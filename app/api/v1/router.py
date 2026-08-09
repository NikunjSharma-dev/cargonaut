"""
Cargonaut — Unified API Router
"""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth, tenants, users, hubs, vehicles,
    drivers, orders, dispatch, tracking, analytics
)

api_router = APIRouter()

api_router.include_router(auth.router,      prefix="/auth",      tags=["Authentication"])
api_router.include_router(tenants.router,   prefix="/tenants",   tags=["Tenants"])
api_router.include_router(users.router,     prefix="/users",     tags=["Users"])
api_router.include_router(hubs.router,      prefix="/hubs",      tags=["Hubs"])
api_router.include_router(vehicles.router,  prefix="/vehicles",  tags=["Vehicles"])
api_router.include_router(drivers.router,   prefix="/drivers",   tags=["Drivers"])
api_router.include_router(orders.router,    prefix="/orders",    tags=["Orders"])
api_router.include_router(dispatch.router,  prefix="/dispatch",  tags=["Dispatch & Optimization"])
api_router.include_router(tracking.router,  prefix="/tracking",  tags=["Live Tracking"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
