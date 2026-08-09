"""Cargonaut — Vehicles endpoints (road units and air freighters)"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenPayload, get_current_user
from app.models.models import (
    AIR_VEHICLE_TYPES,
    TransportMode,
    Vehicle,
    VehicleType,
    mode_for_vehicle_type,
)
from app.schemas.schemas import VehicleCreate, VehicleResponse, VehicleUpdate

router = APIRouter()

@router.get("/", response_model=list[VehicleResponse])
async def list_vehicles(
    transport_mode: Optional[TransportMode] = None,
    vehicle_type: Optional[VehicleType] = None,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Vehicle).where(Vehicle.tenant_id == current_user.tenant_id)
    if transport_mode:
        query = query.where(Vehicle.transport_mode == transport_mode)
    if vehicle_type:
        query = query.where(Vehicle.vehicle_type == vehicle_type)
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/", response_model=VehicleResponse, status_code=201)
async def create_vehicle(data: VehicleCreate, current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    payload = data.model_dump(exclude_none=True)
    # The asset itself decides its mode — a freighter is always an air unit.
    payload["transport_mode"] = mode_for_vehicle_type(data.vehicle_type)

    if data.vehicle_type in AIR_VEHICLE_TYPES and not data.tail_number:
        raise HTTPException(status_code=422, detail="Air freight assets require a tail number")
    if data.vehicle_type not in AIR_VEHICLE_TYPES:
        # Aircraft-only attributes are meaningless on a road unit
        for air_only in ("tail_number", "uld_positions", "range_km"):
            payload.pop(air_only, None)

    vehicle = Vehicle(tenant_id=current_user.tenant_id, **payload)
    db.add(vehicle)
    await db.commit()
    await db.refresh(vehicle)
    return vehicle

@router.get("/{vehicle_id}", response_model=VehicleResponse)
async def get_vehicle(vehicle_id: str, current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Vehicle).where(and_(Vehicle.id == vehicle_id, Vehicle.tenant_id == current_user.tenant_id)))
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle

@router.patch("/{vehicle_id}", response_model=VehicleResponse)
async def update_vehicle(vehicle_id: str, data: VehicleUpdate, current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Vehicle).where(and_(Vehicle.id == vehicle_id, Vehicle.tenant_id == current_user.tenant_id)))
    vehicle = result.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(vehicle, k, v)
    await db.commit()
    await db.refresh(vehicle)
    return vehicle
