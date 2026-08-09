"""Cargonaut — Drivers endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenPayload, get_current_user
from app.models.models import Driver, Vehicle
from app.schemas.schemas import DriverCreate, DriverResponse, DriverUpdate

router = APIRouter()

@router.get("/", response_model=list[DriverResponse])
async def list_drivers(current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Driver).where(Driver.tenant_id == current_user.tenant_id))
    return result.scalars().all()

@router.post("/", response_model=DriverResponse, status_code=201)
async def create_driver(data: DriverCreate, current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    payload = data.model_dump(exclude_none=True)

    # Pydantic parses these into uuid.UUID, but the columns are
    # UUID(as_uuid=False) — the string variant. Handing the driver a UUID object
    # makes SQLAlchemy's bind processor call .replace() on it and blow up.
    for fk in ("vehicle_id", "user_id"):
        if payload.get(fk) is not None:
            payload[fk] = str(payload[fk])

    if payload.get("vehicle_id"):
        owned = await db.execute(
            select(Vehicle).where(
                and_(
                    Vehicle.id == payload["vehicle_id"],
                    Vehicle.tenant_id == current_user.tenant_id,
                )
            )
        )
        if not owned.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Vehicle not found")

    driver = Driver(tenant_id=current_user.tenant_id, **payload)
    db.add(driver)
    await db.commit()
    await db.refresh(driver)
    return driver

@router.get("/{driver_id}", response_model=DriverResponse)
async def get_driver(driver_id: str, current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Driver).where(and_(Driver.id == driver_id, Driver.tenant_id == current_user.tenant_id)))
    driver = result.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    return driver

@router.patch("/{driver_id}", response_model=DriverResponse)
async def update_driver(driver_id: str, data: DriverUpdate, current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Driver).where(and_(Driver.id == driver_id, Driver.tenant_id == current_user.tenant_id)))
    driver = result.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    for k, v in data.model_dump(exclude_none=True).items():
        # Same UUID-object coercion as create — see create_driver
        setattr(driver, k, str(v) if k == "vehicle_id" else v)
    await db.commit()
    await db.refresh(driver)
    return driver

@router.delete("/{driver_id}", status_code=204)
async def deactivate_driver(driver_id: str, current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Driver).where(and_(Driver.id == driver_id, Driver.tenant_id == current_user.tenant_id)))
    driver = result.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    driver.is_active = False
    await db.commit()
