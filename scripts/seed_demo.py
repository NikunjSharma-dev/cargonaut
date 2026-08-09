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
    CargoType,
    Driver,
    FuelType,
    Hub,
    HubType,
    Order,
    OrderStatus,
    Tenant,
    TransportMode,
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
        Hub(tenant_id=tenant.id, name="Mumbai Air Cargo Terminal", hub_type=HubType.AIR_CARGO_TERMINAL,
            address="Sahar Cargo Complex, CSMIA", city="Mumbai", state="Maharashtra",
            country="India", latitude=19.0896, longitude=72.8656, geofence_radius_meters=800,
            iata_code="BOM", handles_air_cargo=True),
        Hub(tenant_id=tenant.id, name="Delhi Air Freight Station", hub_type=HubType.AIR_CARGO_TERMINAL,
            address="Cargo Terminal 2, IGI Airport", city="Delhi", state="Delhi",
            country="India", latitude=28.5562, longitude=77.1000, geofence_radius_meters=800,
            iata_code="DEL", handles_air_cargo=True),
    ]
    session.add_all(hubs)

    vehicles = [
        Vehicle(tenant_id=tenant.id, registration_number="MH-12-FF-802",
                vehicle_type=VehicleType.TRUCK, fuel_type=FuelType.DIESEL,
                payload_capacity_kg=22000, status=VehicleStatus.AVAILABLE, odometer_km=184_320),
        Vehicle(tenant_id=tenant.id, registration_number="DL-01-FF-541",
                vehicle_type=VehicleType.VAN, fuel_type=FuelType.DIESEL,
                payload_capacity_kg=3500, status=VehicleStatus.AVAILABLE, odometer_km=76_540),
        Vehicle(tenant_id=tenant.id, registration_number="KA-05-FF-904",
                vehicle_type=VehicleType.VAN, fuel_type=FuelType.ELECTRIC,
                payload_capacity_kg=1500, status=VehicleStatus.AVAILABLE, odometer_km=12_090),
        Vehicle(tenant_id=tenant.id, registration_number="MH-14-FF-118",
                vehicle_type=VehicleType.TRUCK, fuel_type=FuelType.DIESEL,
                payload_capacity_kg=9000, has_refrigeration=True,
                status=VehicleStatus.AVAILABLE, odometer_km=64_210),
        # Air freight assets — registration doubles as the tail number
        Vehicle(tenant_id=tenant.id, registration_number="VT-CGN",
                vehicle_type=VehicleType.FREIGHTER, transport_mode=TransportMode.AIR,
                fuel_type=FuelType.JET_A1, payload_capacity_kg=112_000,
                volume_capacity_m3=858, status=VehicleStatus.AVAILABLE,
                tail_number="VT-CGN", uld_positions=37, range_km=8_150,
                make="Boeing", model="777F"),
        Vehicle(tenant_id=tenant.id, registration_number="VT-CGF",
                vehicle_type=VehicleType.TURBOPROP, transport_mode=TransportMode.AIR,
                fuel_type=FuelType.JET_A1, payload_capacity_kg=8_600,
                volume_capacity_m3=75, status=VehicleStatus.AVAILABLE,
                tail_number="VT-CGF", uld_positions=6, range_km=1_500,
                make="ATR", model="72-600F"),
    ]
    session.add_all(vehicles)
    # Drivers reference their asset, and dispatch reads the mode off that asset
    await session.flush()
    by_reg = {v.registration_number: v for v in vehicles}

    expiry = _now() + timedelta(days=540)
    session.add_all([
        Driver(tenant_id=tenant.id, full_name="Vikram Singh", phone="+919823011204",
               license_number="MH1220190001234", license_expiry=expiry, rating=4.8,
               total_deliveries=412, vehicle_id=by_reg["MH-12-FF-802"].id),
        Driver(tenant_id=tenant.id, full_name="Amit Sharma", phone="+919811244321",
               license_number="DL0120180005678", license_expiry=expiry, rating=4.6,
               total_deliveries=298, vehicle_id=by_reg["DL-01-FF-541"].id),
        Driver(tenant_id=tenant.id, full_name="Rajesh Kumar", phone="+919740155902",
               license_number="KA0520200009012", license_expiry=expiry, rating=4.9,
               total_deliveries=531, vehicle_id=by_reg["MH-14-FF-118"].id),
        # Flight crew — licence class is the type rating that lets them fly the asset
        Driver(tenant_id=tenant.id, full_name="Capt. Neha Iyer", phone="+919920477311",
               license_number="ATPL-IN-114872", license_expiry=expiry, license_class="B777F",
               rating=4.9, total_deliveries=186, vehicle_id=by_reg["VT-CGN"].id),
        Driver(tenant_id=tenant.id, full_name="Capt. Arjun Menon", phone="+919845220719",
               license_number="ATPL-IN-220945", license_expiry=expiry, license_class="ATR72F",
               rating=4.7, total_deliveries=241, vehicle_id=by_reg["VT-CGF"].id),
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
              delivery_city="Chennai", weight_kg=11400, priority=1,
              cargo_type=CargoType.LIQUID_BULK),
        # Air cargo — booked on an AWB, billed on volumetric weight
        Order(tenant_id=tenant.id, order_number="ORD-9425", status=OrderStatus.CONFIRMED,
              customer_name="Helios Pharma", delivery_address="Cargo Terminal 2, IGI",
              delivery_city="Delhi", weight_kg=2_400, volume_m3=19.5, pieces=42, priority=3,
              cargo_type=CargoType.REFRIGERATED, transport_mode=TransportMode.AIR,
              air_waybill_number="731-40028115", flight_number="CG412"),
        Order(tenant_id=tenant.id, order_number="ORD-9426", status=OrderStatus.IN_TRANSIT,
              customer_name="Aurum Bullion Services", delivery_address="Sahar Cargo Complex",
              delivery_city="Mumbai", weight_kg=780, volume_m3=1.2, pieces=6, priority=3,
              cargo_type=CargoType.HIGH_VALUE, transport_mode=TransportMode.AIR,
              air_waybill_number="731-40028116", flight_number="CG208"),
        Order(tenant_id=tenant.id, order_number="ORD-9427", status=OrderStatus.CONFIRMED,
              customer_name="Vector Industrial", delivery_address="Cargo Village Gate 4",
              delivery_city="Bengaluru", weight_kg=1_950, volume_m3=14.0, pieces=18, priority=2,
              cargo_type=CargoType.HAZMAT, transport_mode=TransportMode.AIR,
              air_waybill_number="731-40028117", flight_number="CG377",
              hazmat_un_code="UN1263"),
    ])

    await session.commit()
    print("✓ seeded demo tenant, 5 hubs, 6 vehicles, 5 drivers, 7 orders (4 road, 3 air)")
    print(f"  login: {DEMO_EMAIL} / {DEMO_PASSWORD}")


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        await seed(session)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
