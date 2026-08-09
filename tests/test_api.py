"""
Cargonaut — Test Suite
Run: pytest tests/ -v
"""

import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.core.database import Base, get_db

import os

TEST_DB_URL = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSession = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSession() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


if test_engine.dialect.name == "sqlite":
    from sqlalchemy import Text
    for table in Base.metadata.tables.values():
        for col in table.columns:
            if hasattr(col.type, "spatial_type") or col.type.__class__.__name__ == "Geometry":
                col.type = Text()




@pytest.fixture(scope="session", autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    try:
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
    except Exception:
        pass




@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac


import uuid

@pytest.fixture
async def auth_headers(client):
    """Register a tenant and return auth headers."""
    uid = uuid.uuid4().hex[:6]
    resp = await client.post("/api/v1/auth/register", json={
        "tenant_name": f"Test Corp {uid}",
        "tenant_slug": f"test-corp-{uid}",
        "admin_email": f"admin_{uid}@testcorp.com",
        "admin_password": "testpass123",
        "admin_name": "Test Admin",
    })
    assert resp.status_code == 201
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}



# ─── Auth Tests ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_tenant(client):
    resp = await client.post("/api/v1/auth/register", json={
        "tenant_name": "Acme Logistics",
        "tenant_slug": "acme-logistics",
        "admin_email": "admin@acme.com",
        "admin_password": "securepass123",
        "admin_name": "Acme Admin",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["role"] == "admin"
    assert data["email"] == "admin@acme.com"


@pytest.mark.asyncio
async def test_login(client):
    # Register first
    await client.post("/api/v1/auth/register", json={
        "tenant_name": "Login Test Co",
        "tenant_slug": "login-test-co",
        "admin_email": "login@test.com",
        "admin_password": "mypassword123",
        "admin_name": "Login Tester",
    })
    # Then login
    resp = await client.post("/api/v1/auth/login", json={
        "email": "login@test.com",
        "password": "mypassword123",
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "login@test.com",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_me(client, auth_headers):
    resp = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "email" in data
    assert "role" in data


# ─── Order Tests ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_order(client, auth_headers):
    resp = await client.post("/api/v1/orders/", json={
        "customer_name": "Rajesh Kumar",
        "customer_phone": "+91-9876543210",
        "delivery_address": "123 MG Road",
        "delivery_city": "Mumbai",
        "weight_kg": 5.0,
        "priority": 1,
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "draft"
    assert data["customer_name"] == "Rajesh Kumar"
    assert data["order_number"].startswith("FF-")
    return data


@pytest.mark.asyncio
async def test_list_orders(client, auth_headers):
    resp = await client.get("/api/v1/orders/", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_order_state_machine(client, auth_headers):
    # Create
    create_resp = await client.post("/api/v1/orders/", json={
        "customer_name": "State Test",
        "delivery_address": "456 Park Street",
        "delivery_city": "Delhi",
    }, headers=auth_headers)
    assert create_resp.status_code == 201
    order_id = create_resp.json()["id"]

    # draft → confirmed
    resp = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"status": "confirmed"},
        headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "confirmed"

    # confirmed → dispatched
    resp = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"status": "dispatched"},
        headers=auth_headers
    )
    assert resp.status_code == 200

    # dispatched → in_transit
    resp = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"status": "in_transit"},
        headers=auth_headers
    )
    assert resp.status_code == 200

    # in_transit → arrived
    resp = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"status": "arrived"},
        headers=auth_headers
    )
    assert resp.status_code == 200

    # arrived → delivered
    resp = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"status": "delivered"},
        headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "delivered"



@pytest.mark.asyncio
async def test_invalid_state_transition(client, auth_headers):
    create_resp = await client.post("/api/v1/orders/", json={
        "customer_name": "Invalid Trans",
        "delivery_address": "789 Link Road",
        "delivery_city": "Pune",
    }, headers=auth_headers)
    order_id = create_resp.json()["id"]

    # Try to skip directly draft → delivered (invalid)
    resp = await client.patch(
        f"/api/v1/orders/{order_id}",
        json={"status": "delivered"},
        headers=auth_headers
    )
    assert resp.status_code == 400
    assert "Invalid transition" in resp.json()["detail"]


# ─── Driver Tests ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_driver(client, auth_headers):
    resp = await client.post("/api/v1/drivers/", json={
        "full_name": "Arjun Singh",
        "phone": "+91-9123456789",
        "license_number": "MH-01-20220001",
        "license_expiry": "2027-01-01T00:00:00Z",
        "license_class": "LMV",
        "shift_start": "08:00",
        "shift_end": "18:00",
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["full_name"] == "Arjun Singh"
    assert data["is_active"] is True
    assert data["is_available"] is True


# ─── Hub Tests ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_hub(client, auth_headers):
    resp = await client.post("/api/v1/hubs/", json={
        "name": "Mumbai Warehouse",
        "hub_type": "warehouse",
        "address": "APMC Yard, Turbhe",
        "city": "Mumbai",
        "country": "India",
        "latitude": 19.0760,
        "longitude": 72.8777,
        "geofence_radius_meters": 300,
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Mumbai Warehouse"
    assert data["hub_type"] == "warehouse"


# ─── Analytics Tests ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_dashboard_stats(client, auth_headers):
    resp = await client.get("/api/v1/analytics/dashboard", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    required_fields = [
        "total_orders", "orders_today", "orders_in_transit",
        "sla_breach_count", "active_drivers", "total_drivers",
        "available_vehicles", "total_vehicles",
    ]
    for field in required_fields:
        assert field in data, f"Missing field: {field}"


@pytest.mark.asyncio
async def test_health_check(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


# ─── VRP Optimization Engine Tests ───────────────────────────────────────────

def test_vrp_optimizer_engine():
    from app.services.vrp_optimizer import CVRPOptimizer, haversine_distance_km

    dist = haversine_distance_km(19.0760, 72.8777, 18.5204, 73.8567)
    assert dist > 100 and dist < 150  # ~120 km between Mumbai & Pune

    orders = [
        {"id": "order-1", "lat": 19.0760, "lon": 72.8777, "weight_kg": 20.0, "priority": 2},
        {"id": "order-2", "lat": 19.0800, "lon": 72.8800, "weight_kg": 15.0, "priority": 1},
    ]
    drivers = [
        {"id": "driver-1", "lat": 19.0700, "lon": 72.8700, "capacity_kg": 100.0, "is_available": True},
    ]

    solver = CVRPOptimizer(orders=orders, drivers=drivers, max_orders_per_driver=5)
    result = solver.solve()

    assert "assignments" in result
    assert "driver-1" in result["assignments"]
    assert len(result["assignments"]["driver-1"]) == 2
    assert result["unassigned"] == []


@pytest.mark.asyncio
async def test_dispatch_optimize_endpoint(client, auth_headers):
    # Create a driver
    driver_resp = await client.post("/api/v1/drivers/", json={
        "full_name": "VRP Driver",
        "phone": "+91-9999988888",
        "license_number": "MH-02-9999",
        "license_expiry": "2027-01-01T00:00:00Z",
        "shift_start": "08:00",
        "shift_end": "18:00",
    }, headers=auth_headers)

    driver_id = driver_resp.json()["id"]

    # Create an order
    order_resp = await client.post("/api/v1/orders/", json={
        "customer_name": "VRP Customer",
        "delivery_address": "Bandra West",
        "delivery_city": "Mumbai",
        "delivery_latitude": 19.0596,
        "delivery_longitude": 72.8295,
        "weight_kg": 10.0,
    }, headers=auth_headers)
    order_id = order_resp.json()["id"]

    # Trigger optimize dispatch
    opt_resp = await client.post("/api/v1/dispatch/optimize", json={
        "order_ids": [order_id],
        "driver_ids": [driver_id],
        "max_orders_per_driver": 5,
    }, headers=auth_headers)
    assert opt_resp.status_code == 200
    data = opt_resp.json()
    assert data["status"] == "completed"
    assert data["total_orders"] == 1


@pytest.mark.asyncio
async def test_gps_ping_geofence_trigger(client, auth_headers):
    # Ingest a GPS telemetry ping
    ping_resp = await client.post("/api/v1/tracking/ping", json={
        "latitude": 19.0760,
        "longitude": 72.8777,
        "speed_kmh": 35.5,
        "heading": 180.0,
    }, headers=auth_headers)
    assert ping_resp.status_code == 200
    data = ping_resp.json()
    assert data["latitude"] == 19.0760
    assert data["longitude"] == 72.8777




# ─── Tenant Isolation Tests ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_data_isolation(client):
    """Tenant A should NOT see Tenant B orders."""
    # Register tenant A
    resp_a = await client.post("/api/v1/auth/register", json={
        "tenant_name": "Tenant Alpha",
        "tenant_slug": "tenant-alpha",
        "admin_email": "admin@alpha.com",
        "admin_password": "alphapass123",
        "admin_name": "Alpha Admin",
    })
    headers_a = {"Authorization": f"Bearer {resp_a.json()['access_token']}"}

    # Register tenant B
    resp_b = await client.post("/api/v1/auth/register", json={
        "tenant_name": "Tenant Beta",
        "tenant_slug": "tenant-beta",
        "admin_email": "admin@beta.com",
        "admin_password": "betapass123",
        "admin_name": "Beta Admin",
    })
    headers_b = {"Authorization": f"Bearer {resp_b.json()['access_token']}"}

    # Tenant A creates an order
    order_resp = await client.post("/api/v1/orders/", json={
        "customer_name": "Alpha Customer",
        "delivery_address": "Alpha Street",
        "delivery_city": "Alpha City",
    }, headers=headers_a)
    order_id_a = order_resp.json()["id"]

    # Tenant B tries to access Tenant A's order — should 404
    resp = await client.get(f"/api/v1/orders/{order_id_a}", headers=headers_b)
    assert resp.status_code == 404, "Tenant isolation violated!"
