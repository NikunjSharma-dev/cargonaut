"""
Cargonaut — Geofences & alert feed.

A fence is stored as a closed polygon ring whatever shape the dispatcher drew;
circles are buffered at write time. See app.services.geofencing for why the ring
is held both as PostGIS geometry and as JSON.
"""

from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenPayload, get_current_user
from app.models.models import (
    Driver,
    Geofence,
    GeofenceEvent,
    GeofenceEventType,
    GeofenceKind,
    Hub,
    Vehicle,
)
from app.schemas.schemas import (
    GeofenceCreate,
    GeofenceEventResponse,
    GeofenceResponse,
    GeofenceUpdate,
)
from app.services.geofencing import circle_to_ring, normalise_ring, ring_to_wkt

router = APIRouter()


def _apply_shape(fence: Geofence, kind: GeofenceKind, data) -> None:
    """
    Write the ring, its PostGIS geometry and the circle parameters together.

    Single funnel for every shape change so `area` and `boundary` cannot drift
    out of step with each other.
    """
    if kind == GeofenceKind.CIRCLE:
        ring = circle_to_ring(data.centre_latitude, data.centre_longitude, data.radius_m)
        fence.centre_latitude = data.centre_latitude
        fence.centre_longitude = data.centre_longitude
        fence.radius_m = data.radius_m
    else:
        ring = normalise_ring(data.boundary)
        # A polygon has no meaningful centre/radius; clear any stale circle
        # parameters left behind by a reshape.
        fence.centre_latitude = None
        fence.centre_longitude = None
        fence.radius_m = None

    fence.kind = kind
    fence.boundary = ring
    fence.area = f"SRID=4326;{ring_to_wkt(ring)}"


async def _get_owned_fence(db: AsyncSession, fence_id: UUID, tenant_id: str) -> Geofence:
    result = await db.execute(
        select(Geofence).where(
            and_(Geofence.id == str(fence_id), Geofence.tenant_id == tenant_id)
        )
    )
    fence = result.scalar_one_or_none()
    if not fence:
        raise HTTPException(status_code=404, detail="Geofence not found")
    return fence


@router.get("/", response_model=List[GeofenceResponse])
async def list_geofences(
    is_active: Optional[bool] = None,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Geofence).where(Geofence.tenant_id == current_user.tenant_id)
    if is_active is not None:
        query = query.where(Geofence.is_active.is_(is_active))
    result = await db.execute(query.order_by(Geofence.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=GeofenceResponse, status_code=201)
async def create_geofence(
    data: GeofenceCreate,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.hub_id:
        hub = await db.execute(
            select(Hub).where(
                and_(Hub.id == str(data.hub_id), Hub.tenant_id == current_user.tenant_id)
            )
        )
        if not hub.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Hub not found")

    fence = Geofence(
        tenant_id=current_user.tenant_id,
        hub_id=str(data.hub_id) if data.hub_id else None,
        name=data.name,
        alert_on_enter=data.alert_on_enter,
        alert_on_exit=data.alert_on_exit,
        is_active=data.is_active,
        colour=data.colour,
        notes=data.notes,
    )
    try:
        _apply_shape(fence, data.kind, data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    db.add(fence)
    await db.commit()
    await db.refresh(fence)
    return fence


@router.get("/events", response_model=List[GeofenceEventResponse])
async def list_geofence_events(
    since: Optional[datetime] = Query(None, description="Only events after this instant (ISO 8601)."),
    vehicle_id: Optional[UUID] = None,
    geofence_id: Optional[UUID] = None,
    event_type: Optional[GeofenceEventType] = None,
    alerts_only: bool = Query(True, description="Hide transitions the fence opted out of alerting on."),
    unacknowledged_only: bool = False,
    limit: int = Query(100, ge=1, le=1000),
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Newest-first alert feed. The dashboard polls this with `since` to raise a
    toast for anything it has not shown yet.
    """
    query = (
        select(GeofenceEvent, Geofence.name, Vehicle.registration_number, Driver.full_name)
        .join(Geofence, Geofence.id == GeofenceEvent.geofence_id)
        .outerjoin(Vehicle, Vehicle.id == GeofenceEvent.vehicle_id)
        .outerjoin(Driver, Driver.id == GeofenceEvent.driver_id)
        .where(GeofenceEvent.tenant_id == current_user.tenant_id)
    )

    if since:
        if since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)
        query = query.where(GeofenceEvent.occurred_at > since)
    if vehicle_id:
        query = query.where(GeofenceEvent.vehicle_id == str(vehicle_id))
    if geofence_id:
        query = query.where(GeofenceEvent.geofence_id == str(geofence_id))
    if event_type:
        query = query.where(GeofenceEvent.event_type == event_type)
    if alerts_only:
        query = query.where(GeofenceEvent.is_alert.is_(True))
    if unacknowledged_only:
        query = query.where(GeofenceEvent.acknowledged_at.is_(None))

    result = await db.execute(query.order_by(GeofenceEvent.occurred_at.desc()).limit(limit))

    return [
        GeofenceEventResponse(
            id=event.id,
            geofence_id=event.geofence_id,
            geofence_name=fence_name,
            vehicle_id=event.vehicle_id,
            vehicle_registration=registration,
            driver_id=event.driver_id,
            driver_name=driver_name,
            event_type=event.event_type,
            is_alert=event.is_alert,
            latitude=event.latitude,
            longitude=event.longitude,
            occurred_at=event.occurred_at,
            acknowledged_at=event.acknowledged_at,
        )
        for event, fence_name, registration, driver_name in result.all()
    ]


@router.post("/events/{event_id}/acknowledge", response_model=GeofenceEventResponse)
async def acknowledge_geofence_event(
    event_id: UUID,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Same joins as the list feed, so the acknowledged row comes back with the
    # registration and driver name the client was already displaying rather than
    # blanking them out on re-render.
    result = await db.execute(
        select(GeofenceEvent, Geofence.name, Vehicle.registration_number, Driver.full_name)
        .join(Geofence, Geofence.id == GeofenceEvent.geofence_id)
        .outerjoin(Vehicle, Vehicle.id == GeofenceEvent.vehicle_id)
        .outerjoin(Driver, Driver.id == GeofenceEvent.driver_id)
        .where(
            and_(
                GeofenceEvent.id == str(event_id),
                GeofenceEvent.tenant_id == current_user.tenant_id,
            )
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Geofence event not found")

    event, fence_name, registration, driver_name = row
    # Acknowledging twice keeps the original timestamp — it records when the
    # alert was first cleared, not the last time someone clicked it.
    if event.acknowledged_at is None:
        event.acknowledged_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(event)

    return GeofenceEventResponse(
        id=event.id,
        geofence_id=event.geofence_id,
        geofence_name=fence_name,
        vehicle_id=event.vehicle_id,
        vehicle_registration=registration,
        driver_id=event.driver_id,
        driver_name=driver_name,
        event_type=event.event_type,
        is_alert=event.is_alert,
        latitude=event.latitude,
        longitude=event.longitude,
        occurred_at=event.occurred_at,
        acknowledged_at=event.acknowledged_at,
    )


@router.get("/{geofence_id}", response_model=GeofenceResponse)
async def get_geofence(
    geofence_id: UUID,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_owned_fence(db, geofence_id, current_user.tenant_id)


@router.patch("/{geofence_id}", response_model=GeofenceResponse)
async def update_geofence(
    geofence_id: UUID,
    data: GeofenceUpdate,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fence = await _get_owned_fence(db, geofence_id, current_user.tenant_id)

    for field in ("name", "alert_on_enter", "alert_on_exit", "is_active", "colour", "notes"):
        value = getattr(data, field)
        if value is not None:
            setattr(fence, field, value)

    # Reshaping is all-or-nothing: a partial circle would leave the ring and the
    # centre/radius describing different zones.
    circle_parts = (data.centre_latitude, data.centre_longitude, data.radius_m)
    if data.boundary is not None:
        try:
            _apply_shape(fence, GeofenceKind.POLYGON, data)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    elif any(p is not None for p in circle_parts):
        if any(p is None for p in circle_parts):
            raise HTTPException(
                status_code=422,
                detail="Reshaping a circle requires centre_latitude, centre_longitude and radius_m together",
            )
        try:
            _apply_shape(fence, GeofenceKind.CIRCLE, data)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    await db.commit()
    await db.refresh(fence)
    return fence


@router.delete("/{geofence_id}", status_code=204)
async def delete_geofence(
    geofence_id: UUID,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fence = await _get_owned_fence(db, geofence_id, current_user.tenant_id)
    await db.delete(fence)
    await db.commit()
