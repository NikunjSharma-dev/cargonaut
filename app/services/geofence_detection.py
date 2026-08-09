"""
Cargonaut — Geofence enter/exit detection.

Shared by the live ping path (`POST /tracking/ping`) and the periodic Celery
sweep, so both raise identical events.

Containment is resolved with PostGIS ST_Contains against the GiST-indexed
`area` column, falling back to a Python ray cast over the stored `boundary`
ring where the extension is unavailable — the same pattern the delivery
geofence check already uses.

Only transitions are recorded. A vehicle sitting inside a fence for an hour
produces one `enter`, not one event per ping.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Geofence, GeofenceEvent, GeofenceEventType
from app.services.geofencing import point_in_ring

logger = logging.getLogger(__name__)


def _ray_cast(latitude: float, longitude: float, fences: List[Geofence]) -> set:
    return {
        str(f.id)
        for f in fences
        if f.boundary and point_in_ring(latitude, longitude, f.boundary)
    }


async def _fences_containing(
    db: AsyncSession,
    tenant_id: str,
    latitude: float,
    longitude: float,
    fences: List[Geofence],
) -> set:
    """Ids of the tenant's active fences that contain the point."""
    if not fences:
        return set()

    # The ST_Contains attempt runs inside a SAVEPOINT. On PostgreSQL a failed
    # statement poisons the entire transaction, so catching the error without
    # rolling back to a savepoint would leave the caller's subsequent flush and
    # commit raising InFailedSqlTransaction — turning a missing extension or one
    # malformed polygon into a 500 on every single ping.
    try:
        async with db.begin_nested():
            result = await db.execute(
                text("""
                    SELECT id FROM geofences
                    WHERE tenant_id = :tenant_id
                      AND is_active IS TRUE
                      AND area IS NOT NULL
                      AND ST_Contains(area, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
                """),
                {"tenant_id": tenant_id, "lat": latitude, "lon": longitude},
            )
            return {str(row[0]) for row in result.fetchall()}
    except Exception:
        # No PostGIS (SQLite tests, bare Postgres), or GEOS rejected a polygon —
        # ray cast the stored rings instead. The savepoint has been rolled back,
        # so the surrounding transaction is still usable.
        logger.debug("ST_Contains unavailable; falling back to ray casting", exc_info=True)
        return _ray_cast(latitude, longitude, fences)


async def _previous_occupancy(
    db: AsyncSession,
    tenant_id: str,
    vehicle_id: str,
) -> Dict[str, bool]:
    """
    Whether the vehicle was last known to be inside each fence.

    Reduced from the event log rather than stored separately: the newest event
    per fence is the current state, and a fence with no events was never
    entered.

    Ranked per fence rather than by taking the newest N events overall — a
    vehicle parked inside a depot for a week while crossing other fences would
    otherwise push that depot's ENTER out of a flat window, the fence would read
    as "never entered", and the next ping would re-fire a duplicate alert.
    """
    ranked = (
        select(
            GeofenceEvent.geofence_id,
            GeofenceEvent.event_type,
            func.row_number()
            .over(
                partition_by=GeofenceEvent.geofence_id,
                # id breaks ties when a sweep replays several fixes onto the
                # same timestamp, so "latest" is always deterministic
                order_by=(GeofenceEvent.occurred_at.desc(), GeofenceEvent.id.desc()),
            )
            .label("rank"),
        )
        .where(
            and_(
                GeofenceEvent.tenant_id == tenant_id,
                GeofenceEvent.vehicle_id == vehicle_id,
            )
        )
        .subquery()
    )

    result = await db.execute(
        select(ranked.c.geofence_id, ranked.c.event_type).where(ranked.c.rank == 1)
    )
    return {
        str(geofence_id): event_type == GeofenceEventType.ENTER
        for geofence_id, event_type in result.all()
    }


async def latest_event_time(
    db: AsyncSession,
    tenant_id: str,
    vehicle_id: str,
) -> Optional[datetime]:
    """
    When this vehicle last changed fence state, or None if it never has.

    The periodic sweep uses this to skip positions the inline path already
    accounted for. Replaying those would compare an old position against newer
    state and invent transitions that never happened.
    """
    result = await db.execute(
        select(func.max(GeofenceEvent.occurred_at)).where(
            and_(
                GeofenceEvent.tenant_id == tenant_id,
                GeofenceEvent.vehicle_id == vehicle_id,
            )
        )
    )
    watermark = result.scalar_one_or_none()
    # SQLite hands back naive datetimes. Always return an aware value so callers
    # can compare it against `datetime.now(timezone.utc)` without blowing up.
    if watermark is not None and watermark.tzinfo is None:
        watermark = watermark.replace(tzinfo=timezone.utc)
    return watermark


async def evaluate_position(
    db: AsyncSession,
    tenant_id: str,
    vehicle_id: Optional[str],
    driver_id: Optional[str],
    latitude: float,
    longitude: float,
    occurred_at: Optional[datetime] = None,
) -> List[GeofenceEvent]:
    """
    Compare a position against the tenant's fences and record any transitions.

    Returns the newly created events. They are added to the session but not
    committed — the caller owns the transaction, so a ping and the events it
    raised land together or not at all.
    """
    if not vehicle_id:
        # Without a vehicle there is nothing to track occupancy against
        return []

    fences_result = await db.execute(
        select(Geofence).where(
            and_(Geofence.tenant_id == tenant_id, Geofence.is_active.is_(True))
        )
    )
    fences = list(fences_result.scalars().all())
    if not fences:
        return []

    inside_now = await _fences_containing(db, tenant_id, latitude, longitude, fences)
    was_inside = await _previous_occupancy(db, tenant_id, vehicle_id)
    stamp = occurred_at or datetime.now(timezone.utc)

    events: List[GeofenceEvent] = []
    for fence in fences:
        fence_id = str(fence.id)
        now_in = fence_id in inside_now
        before_in = was_inside.get(fence_id, False)

        if now_in == before_in:
            continue

        # Every transition is recorded — the event log *is* the occupancy state
        # machine, so suppressing a write here would strand the fence in its old
        # state and lose the matching exit later. A fence that opts out of a
        # direction still gets the row; it just isn't flagged as an alert.
        event = GeofenceEvent(
            tenant_id=tenant_id,
            geofence_id=fence_id,
            vehicle_id=vehicle_id,
            driver_id=driver_id,
            event_type=GeofenceEventType.ENTER if now_in else GeofenceEventType.EXIT,
            is_alert=fence.alert_on_enter if now_in else fence.alert_on_exit,
            latitude=latitude,
            longitude=longitude,
            occurred_at=stamp,
        )
        db.add(event)
        events.append(event)

    return events
