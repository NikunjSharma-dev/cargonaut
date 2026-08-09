"""
Cargonaut — Live GPS Tracking & Geofencing
PostGIS ST_Contains checks if driver entered delivery geofence.
WebSocket streams live positions to dispatcher UI.
"""

import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, Set
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import and_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenPayload, get_current_user
from app.models.models import Driver, GPSPing, Order, OrderStatus, Vehicle
from app.schemas.schemas import (
    GPSPingCreate,
    GPSPingResponse,
    VehicleTrackPoint,
    VehicleTrackResponse,
)
from app.services.geofence_detection import evaluate_position

router = APIRouter()

# In-memory active WebSocket connections per tenant
# In production, use Redis pub/sub for multi-instance support
active_connections: Dict[str, Set[WebSocket]] = {}


@router.post("/ping", response_model=GPSPingResponse)
async def ingest_gps_ping(
    data: GPSPingCreate,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Driver app sends GPS pings to this endpoint.
    Checks PostGIS geofences and auto-updates order status on arrival.
    """
    # Update driver's current position
    driver_result = await db.execute(
        select(Driver).where(
            and_(
                Driver.tenant_id == current_user.tenant_id,
            )
        )
    )
    # Find driver by user_id or use driver_id from token context
    # For demo, use user_id to find driver
    driver_result = await db.execute(
        select(Driver).where(Driver.user_id == current_user.user_id)
    )
    driver = driver_result.scalar_one_or_none()

    geofence_triggered = False
    triggered_order_id = None

    if driver:
        driver.current_latitude = data.latitude
        driver.current_longitude = data.longitude
        driver.last_ping_at = datetime.now(timezone.utc)

        # Check PostGIS geofences for active orders
        if data.order_id:
            order_result = await db.execute(
                select(Order).where(
                    and_(
                        Order.id == str(data.order_id),
                        Order.tenant_id == current_user.tenant_id,
                        Order.status == OrderStatus.IN_TRANSIT,
                    )
                )
            )
            order = order_result.scalar_one_or_none()

            if order and order.delivery_latitude and order.delivery_longitude:
                # PostGIS ST_DWithin geofence check with Python Haversine fallback
                try:
                    geofence_check = await db.execute(
                        text("""
                            SELECT ST_DWithin(
                                ST_MakePoint(:driver_lon, :driver_lat)::geography,
                                ST_MakePoint(:dest_lon, :dest_lat)::geography,
                                :radius_m
                            ) AS within_geofence
                        """),
                        {
                            "driver_lat": data.latitude,
                            "driver_lon": data.longitude,
                            "dest_lat": order.delivery_latitude,
                            "dest_lon": order.delivery_longitude,
                            "radius_m": order.delivery_geofence_m or 150,
                        }
                    )
                    row = geofence_check.fetchone()
                    within = row.within_geofence if row else False
                except Exception:
                    # Fallback math calculation for environments without PostGIS extension
                    from app.services.vrp_optimizer import haversine_distance_km
                    dist_km = haversine_distance_km(
                        data.latitude, data.longitude,
                        order.delivery_latitude, order.delivery_longitude
                    )
                    within = (dist_km * 1000.0) <= (order.delivery_geofence_m or 150)

                if within:
                    order.status = OrderStatus.ARRIVED
                    geofence_triggered = True
                    triggered_order_id = order.id


    # Persist GPS ping
    ping = GPSPing(
        tenant_id=current_user.tenant_id,
        driver_id=driver.id if driver else None,
        vehicle_id=driver.vehicle_id if driver else None,
        order_id=str(data.order_id) if data.order_id else None,
        latitude=data.latitude,
        longitude=data.longitude,
        altitude_m=data.altitude_m,
        speed_kmh=data.speed_kmh,
        heading=data.heading,
        accuracy_m=data.accuracy_m,
        battery_level=data.battery_level,
    )
    db.add(ping)

    # Enter/exit against the tenant's drawn fences. Added to the same
    # transaction as the ping, so a position and the transitions it caused are
    # never persisted apart.
    fence_events = await evaluate_position(
        db,
        tenant_id=current_user.tenant_id,
        vehicle_id=ping.vehicle_id,
        driver_id=ping.driver_id,
        latitude=data.latitude,
        longitude=data.longitude,
    )
    # Primary keys come from a Python-side default applied at INSERT, so the
    # rows have to reach the database before their ids can be read.
    if fence_events:
        await db.flush()

    # Read the fields the broadcast needs before commit expires the instances
    fence_payload = [
        {
            "id": str(e.id),
            "geofence_id": str(e.geofence_id),
            "event_type": e.event_type.value,
            "is_alert": e.is_alert,
        }
        for e in fence_events
    ]

    await db.commit()
    await db.refresh(ping)

    # Broadcast to active WebSocket connections for this tenant
    tenant_key = str(current_user.tenant_id)
    if tenant_key in active_connections:
        payload = json.dumps({
            "type": "gps_update",
            "driver_id": str(driver.id) if driver else None,
            "lat": data.latitude,
            "lon": data.longitude,
            "speed_kmh": data.speed_kmh,
            "heading": data.heading,
            "order_id": str(data.order_id) if data.order_id else None,
            "geofence_triggered": geofence_triggered,
            "geofence_events": fence_payload,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        dead = set()
        for ws in active_connections[tenant_key]:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        active_connections[tenant_key] -= dead

    return GPSPingResponse(
        id=ping.id,
        driver_id=ping.driver_id,
        vehicle_id=ping.vehicle_id,
        latitude=ping.latitude,
        longitude=ping.longitude,
        speed_kmh=ping.speed_kmh,
        heading=ping.heading,
        timestamp=ping.timestamp,
        geofence_triggered=geofence_triggered,
        triggered_order_id=triggered_order_id,
    )


@router.get("/drivers/live")
async def get_live_driver_positions(
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current positions of all active drivers."""
    result = await db.execute(
        select(Driver).where(
            and_(
                Driver.tenant_id == current_user.tenant_id,
                Driver.is_active.is_(True),
                Driver.current_latitude.isnot(None),
            )
        )
    )
    drivers = result.scalars().all()

    return [
        {
            "driver_id": str(d.id),
            "full_name": d.full_name,
            "phone": d.phone,
            "latitude": d.current_latitude,
            "longitude": d.current_longitude,
            "last_ping_at": d.last_ping_at.isoformat() if d.last_ping_at else None,
            "is_available": d.is_available,
            "vehicle_id": str(d.vehicle_id) if d.vehicle_id else None,
        }
        for d in drivers
    ]


@router.get("/vehicles/{vehicle_id}/history", response_model=VehicleTrackResponse)
async def get_vehicle_track(
    vehicle_id: UUID,
    start: Optional[datetime] = Query(None, description="Window start (ISO 8601). Defaults to 24h before `end`."),
    end: Optional[datetime] = Query(None, description="Window end (ISO 8601). Defaults to now."),
    limit: int = Query(5000, ge=1, le=20000, description="Max breadcrumbs returned, newest dropped first."),
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Breadcrumb trail for one vehicle over a time window, oldest first.

    Backs the map replay: the polyline is drawn from `points`, and the scrubber
    indexes into the same array, so the trail and the marker can never disagree.
    """
    # Scope by tenant here rather than trusting the path id — an id from another
    # tenant must look absent, not forbidden.
    vehicle_result = await db.execute(
        select(Vehicle).where(
            and_(Vehicle.id == str(vehicle_id), Vehicle.tenant_id == current_user.tenant_id)
        )
    )
    vehicle = vehicle_result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    window_end = end or datetime.now(timezone.utc)
    window_start = start or (window_end - timedelta(hours=24))

    # Naive datetimes arrive from `?start=2026-08-10T00:00:00`; treat them as UTC
    # so the comparison below never mixes aware and naive values.
    if window_start.tzinfo is None:
        window_start = window_start.replace(tzinfo=timezone.utc)
    if window_end.tzinfo is None:
        window_end = window_end.replace(tzinfo=timezone.utc)

    if window_start >= window_end:
        raise HTTPException(status_code=422, detail="`start` must be earlier than `end`")

    # Take the NEWEST `limit` fixes, then flip to chronological order. Limiting
    # an ascending scan would keep the oldest rows instead, so a busy vehicle's
    # trail would stop partway through the window and the replay head would
    # never reach where the vehicle actually is.
    result = await db.execute(
        select(GPSPing)
        .where(
            and_(
                GPSPing.tenant_id == current_user.tenant_id,
                GPSPing.vehicle_id == str(vehicle_id),
                GPSPing.timestamp >= window_start,
                GPSPing.timestamp <= window_end,
            )
        )
        .order_by(GPSPing.timestamp.desc())
        # One extra row distinguishes "exactly `limit` fixes exist" from
        # "more than `limit` exist"; without it a complete trail of exactly
        # `limit` points would be reported to the UI as clipped.
        .limit(limit + 1)
    )
    newest_first = list(result.scalars().all())
    truncated = len(newest_first) > limit
    pings = list(reversed(newest_first[:limit]))

    # Trail length over the ground, summed between consecutive fixes.
    from app.services.vrp_optimizer import haversine_distance_km

    distance_km = 0.0
    for previous, current in zip(pings, pings[1:]):
        distance_km += haversine_distance_km(
            previous.latitude, previous.longitude,
            current.latitude, current.longitude,
        )

    return VehicleTrackResponse(
        vehicle_id=vehicle.id,
        registration_number=vehicle.registration_number,
        start=window_start,
        end=window_end,
        point_count=len(pings),
        distance_km=round(distance_km, 3),
        truncated=truncated,
        points=[VehicleTrackPoint.model_validate(p) for p in pings],
    )


@router.websocket("/ws/{tenant_id}")
async def websocket_live_tracking(websocket: WebSocket, tenant_id: str):
    """
    WebSocket endpoint for real-time dispatcher map updates.
    Client connects once; receives GPS updates as drivers ping.
    """
    await websocket.accept()

    if tenant_id not in active_connections:
        active_connections[tenant_id] = set()
    active_connections[tenant_id].add(websocket)

    try:
        await websocket.send_text(json.dumps({
            "type": "connected",
            "message": "Cargonaut live tracking active",
            "tenant_id": tenant_id,
        }))
        # Keep connection alive
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                # Handle ping/pong keepalive
                if msg == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "heartbeat"}))
    except WebSocketDisconnect:
        active_connections[tenant_id].discard(websocket)
    except Exception:
        active_connections[tenant_id].discard(websocket)
