"""
Helper script to initialize database tables using Base.metadata.create_all
"""

import asyncio
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models.models import *  # noqa: F401, F403
from app.core.database import Base, engine


async def main():
    print("Creating all database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✓ Tables created successfully")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
