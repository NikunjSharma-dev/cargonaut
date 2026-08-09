"""
Cargonaut — Async Database Engine (PostgreSQL + PostGIS)
"""

from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# Async engine
engine_kwargs = {
    "echo": settings.DEBUG,
    "pool_pre_ping": True,
}
if "sqlite" not in settings.DATABASE_URL:
    engine_kwargs.update({"pool_size": 20, "max_overflow": 40})

engine = create_async_engine(
    settings.DATABASE_URL,
    **engine_kwargs
)


AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_postgis(session: AsyncSession):
    """Enable PostGIS extension on first run."""
    await session.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    await session.execute(text("CREATE EXTENSION IF NOT EXISTS postgis_topology"))
    await session.commit()
