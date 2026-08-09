"""
Cargonaut — Driver shift roster.

The load-bearing rule here is that a driver cannot be rostered onto two
overlapping windows, and neither can a vehicle. Both are enforced server-side:
the UI's own checks are a convenience, not the guarantee.
"""

from datetime import datetime, timezone
from typing import List, Optional, Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenPayload, get_current_user
from app.models.models import Driver, Shift, ShiftStatus, Vehicle
from app.schemas.schemas import ShiftCreate, ShiftResponse, ShiftUpdate

router = APIRouter()

# A cancelled shift is history, not a claim on anyone's time.
BLOCKING_STATUSES = (ShiftStatus.SCHEDULED, ShiftStatus.ACTIVE, ShiftStatus.COMPLETED)


def _as_utc(value: datetime) -> datetime:
    """Treat a naive datetime as UTC so comparisons never mix aware and naive."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _describe(shift: Shift) -> str:
    return (
        f"{shift.starts_at:%Y-%m-%d %H:%M} – {shift.ends_at:%H:%M} UTC"
        if shift.starts_at.date() == shift.ends_at.date()
        else f"{shift.starts_at:%Y-%m-%d %H:%M} – {shift.ends_at:%Y-%m-%d %H:%M} UTC"
    )


def _to_response(shift: Shift, driver_name: str, registration: Optional[str]) -> ShiftResponse:
    return ShiftResponse(
        id=shift.id,
        tenant_id=shift.tenant_id,
        driver_id=shift.driver_id,
        driver_name=driver_name,
        vehicle_id=shift.vehicle_id,
        vehicle_registration=registration,
        starts_at=shift.starts_at,
        ends_at=shift.ends_at,
        status=shift.status,
        notes=shift.notes,
        created_at=shift.created_at,
        updated_at=shift.updated_at,
    )


async def _hydrate(db: AsyncSession, shifts: Sequence[Shift]) -> List[ShiftResponse]:
    """Attach driver names and vehicle registrations in two batched lookups."""
    if not shifts:
        return []

    driver_ids = {s.driver_id for s in shifts}
    vehicle_ids = {s.vehicle_id for s in shifts if s.vehicle_id}

    drivers = await db.execute(select(Driver.id, Driver.full_name).where(Driver.id.in_(driver_ids)))
    names = {str(i): n for i, n in drivers.all()}

    registrations = {}
    if vehicle_ids:
        vehicles = await db.execute(
            select(Vehicle.id, Vehicle.registration_number).where(Vehicle.id.in_(vehicle_ids))
        )
        registrations = {str(i): r for i, r in vehicles.all()}

    return [
        _to_response(
            s,
            names.get(str(s.driver_id), "Unknown driver"),
            registrations.get(str(s.vehicle_id)) if s.vehicle_id else None,
        )
        for s in shifts
    ]


async def _assert_no_overlap(
    db: AsyncSession,
    tenant_id: str,
    driver_id: str,
    vehicle_id: Optional[str],
    starts_at: datetime,
    ends_at: datetime,
    exclude_shift_id: Optional[str] = None,
) -> None:
    """
    Reject a window that collides with an existing booking.

    Windows are half-open, so the test is `new.start < other.end AND
    new.end > other.start`. Strict inequalities are what let a shift ending at
    18:00 hand over to one starting at 18:00 without being flagged.
    """
    conflicts_with = [Shift.driver_id == driver_id]
    if vehicle_id:
        conflicts_with.append(Shift.vehicle_id == vehicle_id)

    query = select(Shift).where(
        and_(
            Shift.tenant_id == tenant_id,
            Shift.status.in_(BLOCKING_STATUSES),
            or_(*conflicts_with),
            Shift.starts_at < ends_at,
            Shift.ends_at > starts_at,
        )
    )
    if exclude_shift_id:
        # Editing a shift must not collide with the row being edited
        query = query.where(Shift.id != exclude_shift_id)

    clash = (await db.execute(query.order_by(Shift.starts_at.asc()).limit(1))).scalar_one_or_none()
    if not clash:
        return

    if str(clash.driver_id) == str(driver_id):
        driver = await db.get(Driver, str(driver_id))
        who = driver.full_name if driver else "That driver"
        subject = f"{who} is already rostered"
    else:
        vehicle = await db.get(Vehicle, str(vehicle_id))
        plate = vehicle.registration_number if vehicle else "That vehicle"
        subject = f"{plate} is already assigned"

    raise HTTPException(
        status_code=409,
        detail=f"{subject} for {_describe(clash)}. Shifts for the same driver or vehicle cannot overlap.",
    )


async def _owned_driver(db: AsyncSession, driver_id: UUID, tenant_id: str) -> Driver:
    result = await db.execute(
        select(Driver).where(and_(Driver.id == str(driver_id), Driver.tenant_id == tenant_id))
    )
    driver = result.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    return driver


async def _owned_vehicle(db: AsyncSession, vehicle_id: UUID, tenant_id: str) -> Vehicle:
    result = await db.execute(
        select(Vehicle).where(and_(Vehicle.id == str(vehicle_id), Vehicle.tenant_id == tenant_id))
    )
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.get("/", response_model=List[ShiftResponse])
async def list_shifts(
    from_: Optional[datetime] = Query(None, alias="from", description="Window start (ISO 8601)."),
    to: Optional[datetime] = Query(None, description="Window end (ISO 8601)."),
    driver_id: Optional[UUID] = None,
    vehicle_id: Optional[UUID] = None,
    status: Optional[ShiftStatus] = None,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Shifts overlapping the requested window, earliest first.

    Overlap rather than containment: a shift that started before the window and
    runs into it still belongs on that week's roster.
    """
    query = select(Shift).where(Shift.tenant_id == current_user.tenant_id)

    if to:
        query = query.where(Shift.starts_at < _as_utc(to))
    if from_:
        query = query.where(Shift.ends_at > _as_utc(from_))
    if driver_id:
        query = query.where(Shift.driver_id == str(driver_id))
    if vehicle_id:
        query = query.where(Shift.vehicle_id == str(vehicle_id))
    if status:
        query = query.where(Shift.status == status)

    result = await db.execute(query.order_by(Shift.starts_at.asc()))
    return await _hydrate(db, result.scalars().all())


@router.post("/", response_model=ShiftResponse, status_code=201)
async def create_shift(
    data: ShiftCreate,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    driver = await _owned_driver(db, data.driver_id, current_user.tenant_id)
    vehicle = (
        await _owned_vehicle(db, data.vehicle_id, current_user.tenant_id)
        if data.vehicle_id else None
    )

    starts_at, ends_at = _as_utc(data.starts_at), _as_utc(data.ends_at)
    await _assert_no_overlap(
        db,
        tenant_id=current_user.tenant_id,
        driver_id=str(data.driver_id),
        vehicle_id=str(data.vehicle_id) if data.vehicle_id else None,
        starts_at=starts_at,
        ends_at=ends_at,
    )

    shift = Shift(
        tenant_id=current_user.tenant_id,
        driver_id=str(data.driver_id),
        vehicle_id=str(data.vehicle_id) if data.vehicle_id else None,
        starts_at=starts_at,
        ends_at=ends_at,
        status=data.status,
        notes=data.notes,
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift)

    return _to_response(shift, driver.full_name, vehicle.registration_number if vehicle else None)


@router.get("/{shift_id}", response_model=ShiftResponse)
async def get_shift(
    shift_id: UUID,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Shift).where(
            and_(Shift.id == str(shift_id), Shift.tenant_id == current_user.tenant_id)
        )
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    return (await _hydrate(db, [shift]))[0]


@router.patch("/{shift_id}", response_model=ShiftResponse)
async def update_shift(
    shift_id: UUID,
    data: ShiftUpdate,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Shift).where(
            and_(Shift.id == str(shift_id), Shift.tenant_id == current_user.tenant_id)
        )
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    if data.driver_id:
        await _owned_driver(db, data.driver_id, current_user.tenant_id)
    if data.vehicle_id:
        await _owned_vehicle(db, data.vehicle_id, current_user.tenant_id)

    next_driver = str(data.driver_id) if data.driver_id else str(shift.driver_id)
    if data.clear_vehicle:
        next_vehicle = None
    elif data.vehicle_id:
        next_vehicle = str(data.vehicle_id)
    else:
        next_vehicle = str(shift.vehicle_id) if shift.vehicle_id else None

    next_start = _as_utc(data.starts_at) if data.starts_at else _as_utc(shift.starts_at)
    next_end = _as_utc(data.ends_at) if data.ends_at else _as_utc(shift.ends_at)
    if next_end <= next_start:
        raise HTTPException(status_code=422, detail="`ends_at` must be later than `starts_at`")

    next_status = data.status or shift.status
    # A shift being cancelled releases its slot, so it needs no overlap check
    if next_status != ShiftStatus.CANCELLED:
        await _assert_no_overlap(
            db,
            tenant_id=current_user.tenant_id,
            driver_id=next_driver,
            vehicle_id=next_vehicle,
            starts_at=next_start,
            ends_at=next_end,
            exclude_shift_id=str(shift_id),
        )

    shift.driver_id = next_driver
    shift.vehicle_id = next_vehicle
    shift.starts_at = next_start
    shift.ends_at = next_end
    shift.status = next_status
    if data.notes is not None:
        shift.notes = data.notes

    await db.commit()
    await db.refresh(shift)
    return (await _hydrate(db, [shift]))[0]


@router.delete("/{shift_id}", status_code=204)
async def delete_shift(
    shift_id: UUID,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Shift).where(
            and_(Shift.id == str(shift_id), Shift.tenant_id == current_user.tenant_id)
        )
    )
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    await db.delete(shift)
    await db.commit()
