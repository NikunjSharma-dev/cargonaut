"""Cargonaut — Hubs endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenPayload, get_current_user
from app.models.models import Hub
from app.schemas.schemas import HubCreate, HubResponse, HubUpdate

router = APIRouter()

@router.get("/", response_model=list[HubResponse])
async def list_hubs(current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Hub).where(Hub.tenant_id == current_user.tenant_id))
    return result.scalars().all()

@router.post("/", response_model=HubResponse, status_code=201)
async def create_hub(data: HubCreate, current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    hub = Hub(tenant_id=current_user.tenant_id, **data.model_dump())
    db.add(hub)
    await db.commit()
    await db.refresh(hub)
    return hub

@router.get("/{hub_id}", response_model=HubResponse)
async def get_hub(hub_id: str, current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Hub).where(and_(Hub.id == hub_id, Hub.tenant_id == current_user.tenant_id)))
    hub = result.scalar_one_or_none()
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")
    return hub

@router.patch("/{hub_id}", response_model=HubResponse)
async def update_hub(hub_id: str, data: HubUpdate, current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Hub).where(and_(Hub.id == hub_id, Hub.tenant_id == current_user.tenant_id)))
    hub = result.scalar_one_or_none()
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(hub, k, v)
    await db.commit()
    await db.refresh(hub)
    return hub

@router.delete("/{hub_id}", status_code=204)
async def delete_hub(hub_id: str, current_user: TokenPayload = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Hub).where(and_(Hub.id == hub_id, Hub.tenant_id == current_user.tenant_id)))
    hub = result.scalar_one_or_none()
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")
    await db.delete(hub)
    await db.commit()
