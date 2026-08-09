"""Cargonaut — Tenant endpoints"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user, TokenPayload, require_role
from app.models.models import Tenant, UserRole
from app.schemas.schemas import TenantResponse

router = APIRouter()


@router.get("/me", response_model=TenantResponse)
async def get_my_tenant(
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant
