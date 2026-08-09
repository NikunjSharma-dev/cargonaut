"""
Cargonaut OSS — Main Application Entry Point
Multi-tenant logistics & supply chain operating system
"""

import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings, get_allowed_origins, get_allowed_hosts
from app.core.database import engine, Base
# Must import models before create_all so Base.metadata is populated
import app.models.models  # noqa: F401
from app.api.v1.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    if "sqlite" in settings.DATABASE_URL:
        try:
            from sqlalchemy import Table
            Table.dispatch.before_create._clear()
            Table.dispatch.after_create._clear()
        except Exception:
            pass
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()



app = FastAPI(
    title="Cargonaut OSS",
    description="Modular Logistics & Supply Chain Operating System",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Global exception handler — returns JSON with the actual error message
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"UNHANDLED ERROR on {request.method} {request.url}:\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__},
    )

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=get_allowed_hosts())

app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "cargonaut-oss", "version": "1.0.0"}