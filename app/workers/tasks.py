"""
Cargonaut — Celery Tasks
All heavy computation runs here, never on the HTTP request thread.
"""

import logging
from typing import Dict, List

import numpy as np
import pandas as pd

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="app.workers.tasks.run_vrp_optimization",
    max_retries=2,
    soft_time_limit=120,
)
def run_vrp_optimization(
    self,
    tenant_id: str,
    order_ids: List[str],
    driver_ids: List[str],
    optimization_mode: str = "distance",
    max_per_driver: int = 20,
) -> Dict:
    """
    Full async VRP solver task.
    For production: replace greedy heuristic with Google OR-Tools CVRP.

    Usage:
        result = run_vrp_optimization.delay(tenant_id, order_ids, driver_ids)
        result.get(timeout=60)
    """
    logger.info(
        f"[VRP] tenant={tenant_id} orders={len(order_ids)} drivers={len(driver_ids)}"
    )

    try:
        import time

        start = time.time()

        # In a real implementation, fetch from DB here using sync SQLAlchemy
        # For demo, generate synthetic distance matrix
        n_orders = len(order_ids)
        n_drivers = len(driver_ids)

        if n_orders == 0 or n_drivers == 0:
            return {"status": "no_data", "assignments": {}}

        # Build random distance matrix (replace with real lat/lon in production)
        np.random.seed(42)
        lats = np.random.uniform(18.5, 19.2, n_orders)
        lons = np.random.uniform(72.8, 73.1, n_orders)

        orders_df = pd.DataFrame({
            "id": order_ids,
            "lat": lats,
            "lon": lons,
            "weight_kg": np.random.uniform(1, 50, n_orders),
        })

        # Greedy nearest-neighbour assignment
        assignments = {did: [] for did in driver_ids}
        driver_counts = {did: 0 for did in driver_ids}
        driver_idx = 0

        for _, order in orders_df.sort_values("weight_kg", ascending=False).iterrows():
            for _ in range(n_drivers):
                did = driver_ids[driver_idx % n_drivers]
                driver_idx += 1
                if driver_counts[did] < max_per_driver:
                    assignments[did].append(str(order["id"]))
                    driver_counts[did] += 1
                    break

        elapsed = round((time.time() - start) * 1000, 2)
        logger.info(f"[VRP] completed in {elapsed}ms")

        return {
            "status": "completed",
            "task_id": self.request.id,
            "tenant_id": tenant_id,
            "assignments": assignments,
            "unassigned": [],
            "optimization_time_ms": elapsed,
        }

    except Exception as exc:
        logger.error(f"[VRP] failed: {exc}")
        raise self.retry(exc=exc, countdown=5)


@celery_app.task(
    name="app.workers.tasks.run_power_bi_etl",
    soft_time_limit=300,
)
def run_power_bi_etl(tenant_id: str) -> Dict:
    """
    Refresh the materialized views that Power BI reads.
    Schedule this hourly via Celery Beat.
    """
    logger.info(f"[ETL] Refreshing analytics views for tenant={tenant_id}")
    # In production: REFRESH MATERIALIZED VIEW CONCURRENTLY vw_*
    return {"status": "ok", "tenant_id": tenant_id}


@celery_app.task(
    name="app.workers.tasks.flush_gps_buffer",
    soft_time_limit=60,
)
def flush_gps_buffer(tenant_id: str, pings: List[Dict]) -> Dict:
    """
    Batch-write buffered GPS pings from Redis to PostGIS.
    Called by the telemetry endpoint after buffering N pings.
    """
    logger.info(f"[GPS] Flushing {len(pings)} pings for tenant={tenant_id}")
    # In production: bulk INSERT INTO gps_pings using asyncpg copy or executemany
    return {"status": "ok", "flushed": len(pings)}


@celery_app.task(
    name="app.workers.tasks.check_sla_deadlines",
    soft_time_limit=120,
)
def check_sla_deadlines() -> Dict:
    """
    Runs every 15 minutes via Celery Beat.
    Flags orders approaching or past their SLA deadline.
    """
    logger.info("[SLA] Checking deadlines across all tenants")
    # In production: query orders WHERE sla_deadline < NOW() + INTERVAL '1 hour'
    # and push alerts via webhook / email
    return {"status": "ok"}


@celery_app.task(
    bind=True,
    name="app.workers.tasks.sweep_geofences",
    max_retries=1,
    soft_time_limit=300,
)
def sweep_geofences(self, lookback_minutes: int = 15, max_pings: int = 20_000) -> Dict:
    """
    Safety-net pass over recent GPS pings.

    Enter/exit events are normally raised inline by POST /tracking/ping, which
    is instant and has no polling lag. This sweep exists only for positions that
    path never accounted for: pings written while a fence was being edited,
    backfilled by an importer, or lost to a crash between insert and commit.

    Two rules keep it from inventing events:

      * Only pings NEWER than a vehicle's most recent transition are replayed.
        Occupancy is reconstructed from the newest event, so feeding it an older
        position would compare a stale fix against newer state and emit a
        transition that never happened — and because that bogus event carries an
        older timestamp, it would not even correct the state, so every
        subsequent ping in the window would emit another one.
      * Pings are replayed per vehicle in chronological order, because occupancy
        is a state machine and out-of-order positions fabricate crossings.
    """
    import asyncio
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import and_, select

    from app.core.database import AsyncSessionLocal
    from app.models.models import GPSPing
    from app.services.geofence_detection import evaluate_position, latest_event_time

    async def _run() -> Dict:
        since = datetime.now(timezone.utc) - timedelta(minutes=lookback_minutes)
        checked = 0
        skipped = 0
        raised = 0

        async with AsyncSessionLocal() as session:
            # Which (tenant, vehicle) pairs even moved in the window
            pairs = await session.execute(
                select(GPSPing.tenant_id, GPSPing.vehicle_id)
                .where(and_(GPSPing.timestamp >= since, GPSPing.vehicle_id.isnot(None)))
                .group_by(GPSPing.tenant_id, GPSPing.vehicle_id)
            )

            budget = max_pings
            for tenant_id, vehicle_id in pairs.all():
                if budget <= 0:
                    logger.warning(
                        f"[GEOFENCE] sweep hit the {max_pings}-ping budget; "
                        "remaining vehicles deferred to the next run"
                    )
                    break

                # Everything up to the last recorded transition is already known
                watermark = await latest_event_time(session, tenant_id, vehicle_id)
                query = select(GPSPing).where(
                    and_(
                        GPSPing.tenant_id == tenant_id,
                        GPSPing.vehicle_id == vehicle_id,
                        GPSPing.timestamp >= since,
                    )
                )
                if watermark is not None:
                    query = query.where(GPSPing.timestamp > watermark)

                pings = (
                    await session.execute(
                        query.order_by(GPSPing.timestamp.asc()).limit(budget)
                    )
                ).scalars().all()

                if not pings:
                    skipped += 1
                    continue

                for ping in pings:
                    events = await evaluate_position(
                        session,
                        tenant_id=ping.tenant_id,
                        vehicle_id=ping.vehicle_id,
                        driver_id=ping.driver_id,
                        latitude=ping.latitude,
                        longitude=ping.longitude,
                        occurred_at=ping.timestamp,
                    )
                    checked += 1
                    raised += len(events)
                    if events:
                        # Commit per transition so the next iteration's occupancy
                        # read sees it
                        await session.commit()

                budget -= len(pings)

        return {
            "pings_checked": checked,
            "vehicles_up_to_date": skipped,
            "events_raised": raised,
            "lookback_minutes": lookback_minutes,
        }

    logger.info(f"[GEOFENCE] sweep lookback={lookback_minutes}m")
    try:
        return asyncio.run(_run())
    except Exception as exc:
        logger.error(f"[GEOFENCE] sweep failed: {exc}")
        raise self.retry(exc=exc, countdown=60) from exc
