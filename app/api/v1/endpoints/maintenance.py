"""
Cargonaut — Fuel & Maintenance Log Endpoints
"""

from typing import List, Optional, Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenPayload, get_current_user
from app.models.models import MaintenanceLog, MaintenanceType, Vehicle
from app.schemas.schemas import (
    MaintenanceLogCreate,
    MaintenanceLogResponse,
    MaintenanceLogUpdate,
)

router = APIRouter()


async def _hydrate_registrations(
    db: AsyncSession, logs: Sequence[MaintenanceLog]
) -> List[MaintenanceLogResponse]:
    """Attach vehicle registration numbers to maintenance log responses."""
    if not logs:
        return []

    vehicle_ids = {str(m.vehicle_id) for m in logs if m.vehicle_id}
    registrations = {}
    if vehicle_ids:
        stmt = select(Vehicle.id, Vehicle.registration_number).where(
            Vehicle.id.in_(vehicle_ids)
        )
        res = await db.execute(stmt)
        registrations = {str(v_id): reg for v_id, reg in res.all()}

    return [
        MaintenanceLogResponse(
            id=UUID(m.id),
            tenant_id=UUID(m.tenant_id),
            vehicle_id=UUID(m.vehicle_id),
            vehicle_registration=registrations.get(str(m.vehicle_id)),
            type=m.type,
            cost=m.cost,
            odometer=m.odometer,
            date=m.date,
            notes=m.notes,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
        for m in logs
    ]


@router.post("/", response_model=MaintenanceLogResponse, status_code=status.HTTP_201_CREATED)
async def create_maintenance_log(
    payload: MaintenanceLogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Record a fuel or maintenance event for a vehicle."""
    vehicle_id_str = str(payload.vehicle_id)

    # Verify vehicle belongs to tenant
    vehicle_stmt = select(Vehicle).where(
        Vehicle.id == vehicle_id_str,
        Vehicle.tenant_id == current_user.tenant_id,
    )
    res = await db.execute(vehicle_stmt)
    vehicle = res.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found in this tenant",
        )

    log = MaintenanceLog(
        tenant_id=current_user.tenant_id,
        vehicle_id=vehicle_id_str,
        type=payload.type,
        cost=payload.cost,
        odometer=payload.odometer,
        date=payload.date,
        notes=payload.notes,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    hydrated = await _hydrate_registrations(db, [log])
    return hydrated[0]


@router.get("/", response_model=List[MaintenanceLogResponse])
async def list_maintenance_logs(
    vehicle_id: Optional[UUID] = Query(None, description="Filter by vehicle ID"),
    type: Optional[MaintenanceType] = Query(None, description="Filter by maintenance type"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """List maintenance logs for the tenant with optional filters."""
    query = select(MaintenanceLog).where(
        MaintenanceLog.tenant_id == current_user.tenant_id
    )

    if vehicle_id:
        query = query.where(MaintenanceLog.vehicle_id == str(vehicle_id))
    if type:
        query = query.where(MaintenanceLog.type == type)

    query = query.order_by(MaintenanceLog.date.desc()).offset(offset).limit(limit)
    res = await db.execute(query)
    logs = res.scalars().all()

    return await _hydrate_registrations(db, logs)


@router.get("/{id}", response_model=MaintenanceLogResponse)
async def get_maintenance_log(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Fetch a single maintenance log by ID."""
    stmt = select(MaintenanceLog).where(
        MaintenanceLog.id == str(id),
        MaintenanceLog.tenant_id == current_user.tenant_id,
    )
    res = await db.execute(stmt)
    log = res.scalar_one_or_none()
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance log not found",
        )

    hydrated = await _hydrate_registrations(db, [log])
    return hydrated[0]


@router.patch("/{id}", response_model=MaintenanceLogResponse)
async def update_maintenance_log(
    id: UUID,
    payload: MaintenanceLogUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Update maintenance log fields."""
    stmt = select(MaintenanceLog).where(
        MaintenanceLog.id == str(id),
        MaintenanceLog.tenant_id == current_user.tenant_id,
    )
    res = await db.execute(stmt)
    log = res.scalar_one_or_none()
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance log not found",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if "vehicle_id" in update_data and update_data["vehicle_id"] is not None:
        v_id_str = str(update_data["vehicle_id"])
        v_stmt = select(Vehicle).where(
            Vehicle.id == v_id_str,
            Vehicle.tenant_id == current_user.tenant_id,
        )
        v_res = await db.execute(v_stmt)
        if not v_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vehicle not found in this tenant",
            )
        log.vehicle_id = v_id_str

    for key in ("type", "cost", "odometer", "date", "notes"):
        if key in update_data and update_data[key] is not None:
            setattr(log, key, update_data[key])

    await db.commit()
    await db.refresh(log)

    hydrated = await _hydrate_registrations(db, [log])
    return hydrated[0]


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_maintenance_log(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Delete a maintenance log entry."""
    stmt = select(MaintenanceLog).where(
        MaintenanceLog.id == str(id),
        MaintenanceLog.tenant_id == current_user.tenant_id,
    )
    res = await db.execute(stmt)
    log = res.scalar_one_or_none()
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance log not found",
        )

    await db.delete(log)
    await db.commit()
    return None
