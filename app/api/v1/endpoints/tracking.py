"""
Cargonaut — Live GPS Tracking & Geofencing
PostGIS ST_Contains checks if driver entered delivery geofence.
WebSocket streams live positions to dispatcher UI.
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, Set

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import and_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenPayload, get_current_user
from app.models.models import Driver, GPSPing, Order, OrderStatus
from app.schemas.schemas import GPSPingCreate, GPSPingResponse

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
