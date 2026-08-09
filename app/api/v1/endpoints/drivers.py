"""Cargonaut — Drivers endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.core.database import get_db
from app.core.security import get_current_user, TokenPayload
from app.models.models import Driver
from app.schemas.schemas import DriverCreate, DriverUpdate, DriverResponse

router = APIRouter()

@router.get("/", response_model=list[DriverResponse])
async def list_drivers(current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Driver).where(Driver.tenant_id == current_user.tenant_id))
    return result.scalars().all()

@router.post("/", response_model=DriverResponse, status_code=201)
async def create_driver(data: DriverCreate, current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    driver = Driver(tenant_id=current_user.tenant_id, **data.model_dump(exclude_none=True))
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
        setattr(driver, k, v)
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
