"""
Seed a demo tenant with a working admin login and a small fleet.

A freshly created database has no users, so `POST /auth/login` returns 401 and
every authenticated call after it fails. Run this once after `alembic upgrade head`:

    python scripts/seed_demo.py

    docker compose exec api python scripts/seed_demo.py   # inside Docker

Re-running is safe: existing rows are left alone.
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.models.models import (  # noqa: E402
    Driver,
    FuelType,
    Hub,
    HubType,
    Order,
    OrderStatus,
    Tenant,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
    VehicleType,
)

DEMO_EMAIL = "admin@demo.com"
DEMO_PASSWORD = "demo1234"


def _now():
    return datetime.now(timezone.utc)


async def seed(session: AsyncSession) -> None:
    existing = await session.scalar(select(User).where(User.email == DEMO_EMAIL))
    if existing:
        print(f"✓ {DEMO_EMAIL} already exists — nothing to do")
        return

    tenant = await session.scalar(select(Tenant).where(Tenant.slug == "cargonaut-demo"))
    if not tenant:
        tenant = Tenant(name="Cargonaut Logistics", slug="cargonaut-demo", plan="enterprise")
        session.add(tenant)
        await session.flush()

    session.add(
        User(
            tenant_id=tenant.id,
            email=DEMO_EMAIL,
            hashed_password=get_password_hash(DEMO_PASSWORD),
            full_name="Fleet Operator",
            role=UserRole.ADMIN,
        )
    )

    hubs = [
        Hub(tenant_id=tenant.id, name="North Hub Depot", hub_type=HubType.WAREHOUSE,
            address="Industrial Zone Gate #3", city="Mumbai", state="Maharashtra",
            country="India", latitude=19.0760, longitude=72.8777, geofence_radius_meters=500),
        Hub(tenant_id=tenant.id, name="Capital Gateway", hub_type=HubType.DISTRIBUTION_CENTER,
            address="Ring Road Logistics Park", city="Delhi", state="Delhi",
            country="India", latitude=28.6139, longitude=77.2090, geofence_radius_meters=400),
        Hub(tenant_id=tenant.id, name="Tech Hub South", hub_type=HubType.CROSS_DOCK,
            address="Electronic City Phase 2", city="Bengaluru", state="Karnataka",
            country="India", latitude=12.9716, longitude=77.5946, geofence_radius_meters=300),
    ]
    session.add_all(hubs)

    session.add_all([
        Vehicle(tenant_id=tenant.id, registration_number="MH-12-FF-802",
                vehicle_type=VehicleType.TRUCK, fuel_type=FuelType.DIESEL,
                payload_capacity_kg=22000, status=VehicleStatus.AVAILABLE, odometer_km=184_320),
        Vehicle(tenant_id=tenant.id, registration_number="DL-01-FF-541",
                vehicle_type=VehicleType.VAN, fuel_type=FuelType.DIESEL,
                payload_capacity_kg=3500, status=VehicleStatus.AVAILABLE, odometer_km=76_540),
        Vehicle(tenant_id=tenant.id, registration_number="KA-05-FF-904",
                vehicle_type=VehicleType.VAN, fuel_type=FuelType.ELECTRIC,
                payload_capacity_kg=1500, status=VehicleStatus.AVAILABLE, odometer_km=12_090),
    ])

    expiry = _now() + timedelta(days=540)
    session.add_all([
        Driver(tenant_id=tenant.id, full_name="Vikram Singh", phone="+919823011204",
               license_number="MH1220190001234", license_expiry=expiry, rating=4.8,
               total_deliveries=412),
        Driver(tenant_id=tenant.id, full_name="Amit Sharma", phone="+919811244321",
               license_number="DL0120180005678", license_expiry=expiry, rating=4.6,
               total_deliveries=298),
        Driver(tenant_id=tenant.id, full_name="Rajesh Kumar", phone="+919740155902",
               license_number="KA0520200009012", license_expiry=expiry, rating=4.9,
               total_deliveries=531),
    ])

    session.add_all([
        Order(tenant_id=tenant.id, order_number="ORD-9421", status=OrderStatus.CONFIRMED,
              customer_name="Acme Retail Corp", delivery_address="Terminal 4 Industrial",
              delivery_city="Delhi", weight_kg=14200, priority=2),
        Order(tenant_id=tenant.id, order_number="ORD-9422", status=OrderStatus.CONFIRMED,
              customer_name="Northline Traders", delivery_address="Sector 18 Warehouse",
              delivery_city="Noida", weight_kg=8600, priority=1),
        Order(tenant_id=tenant.id, order_number="ORD-9423", status=OrderStatus.CONFIRMED,
              customer_name="Metro Express Inc", delivery_address="Warehouse Hub 3",
              delivery_city="Hyderabad", weight_kg=19800, priority=3),
        Order(tenant_id=tenant.id, order_number="ORD-9424", status=OrderStatus.IN_TRANSIT,
              customer_name="Coastal Freight Ltd", delivery_address="Port Road Yard 7",
              delivery_city="Chennai", weight_kg=11400, priority=1),
    ])

    await session.commit()
    print("✓ seeded demo tenant, 3 hubs, 3 vehicles, 3 drivers, 4 orders")
    print(f"  login: {DEMO_EMAIL} / {DEMO_PASSWORD}")


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        await seed(session)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
