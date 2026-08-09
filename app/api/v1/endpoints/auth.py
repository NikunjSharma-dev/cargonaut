"""
Cargonaut — Authentication Endpoints
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    TokenPayload,
    create_access_token,
    get_current_user,
    get_password_hash,
    verify_password,
)
from app.models.models import Tenant, User, UserRole
from app.schemas.schemas import LoginRequest, RegisterTenantRequest, TokenResponse

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Account is disabled")

    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = create_access_token(
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        email=user.email,
        role=user.role.value,
    )
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        email=user.email,
        role=user.role.value,
        full_name=user.full_name,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register_tenant(data: RegisterTenantRequest, db: AsyncSession = Depends(get_db)):
    # Check slug uniqueness
    result = await db.execute(select(Tenant).where(Tenant.slug == data.tenant_slug))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Tenant slug already taken")

    result = await db.execute(select(User).where(User.email == data.admin_email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    tenant = Tenant(
        name=data.tenant_name,
        slug=data.tenant_slug,
        plan="starter",
    )
    db.add(tenant)
    await db.flush()

    user = User(
        tenant_id=tenant.id,
        email=data.admin_email,
        hashed_password=get_password_hash(data.admin_password),
        full_name=data.admin_name,
        role=UserRole.ADMIN,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(
        user_id=str(user.id),
        tenant_id=str(tenant.id),
        email=user.email,
        role=user.role.value,
    )
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        tenant_id=str(tenant.id),
        email=user.email,
        role=user.role.value,
        full_name=user.full_name,
    )


@router.get("/me")
async def get_me(
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(user.id),
        "tenant_id": str(user.tenant_id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value,
        "is_active": user.is_active,
    }


@router.post("/guest", response_model=TokenResponse)
async def guest_login(db: AsyncSession = Depends(get_db)):
    """One-click guest login for public demo mode."""
    res = await db.execute(select(Tenant).where(Tenant.slug == "cargonaut-demo"))
    tenant = res.scalar_one_or_none()
    if not tenant:
        tenant = Tenant(name="Cargonaut Demo Fleet", slug="cargonaut-demo", plan="enterprise")
        db.add(tenant)
        await db.flush()

    u_res = await db.execute(select(User).where(User.email == "guest@cargonaut.io"))
    user = u_res.scalar_one_or_none()
    if not user:
        user = User(
            tenant_id=tenant.id,
            email="guest@cargonaut.io",
            hashed_password=get_password_hash("guestpass123"),
            full_name="Guest Operator",
            role=UserRole.VIEWER,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_access_token(
        user_id=str(user.id),
        tenant_id=str(tenant.id),
        email=user.email,
        role=user.role.value,
    )
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        tenant_id=str(tenant.id),
        email=user.email,
        role=user.role.value,
        full_name=user.full_name,
    )

