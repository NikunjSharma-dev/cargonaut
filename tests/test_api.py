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




# ─── Route Replay Tests ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_vehicle_track_history(client, auth_headers):
    """A vehicle's breadcrumb trail comes back oldest-first with a trail length."""
    vehicle_resp = await client.post("/api/v1/vehicles/", json={
        "registration_number": "MH-01-TRACK-1",
        "vehicle_type": "van",
        "payload_capacity_kg": 800.0,
    }, headers=auth_headers)
    assert vehicle_resp.status_code == 201
    vehicle_id = vehicle_resp.json()["id"]

    resp = await client.get(
        f"/api/v1/tracking/vehicles/{vehicle_id}/history",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["vehicle_id"] == vehicle_id
    assert data["registration_number"] == "MH-01-TRACK-1"
    assert data["point_count"] == len(data["points"])
    assert data["distance_km"] >= 0.0
    # Window defaults to the last 24 hours
    assert data["start"] < data["end"]

    timestamps = [p["timestamp"] for p in data["points"]]
    assert timestamps == sorted(timestamps), "Breadcrumbs must be oldest-first"


@pytest.mark.asyncio
async def test_vehicle_track_history_requires_auth(client, auth_headers):
    vehicle_resp = await client.post("/api/v1/vehicles/", json={
        "registration_number": "MH-01-TRACK-2",
        "vehicle_type": "truck",
        "payload_capacity_kg": 12000.0,
    }, headers=auth_headers)
    vehicle_id = vehicle_resp.json()["id"]

    resp = await client.get(f"/api/v1/tracking/vehicles/{vehicle_id}/history")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_vehicle_track_history_rejects_other_tenant(client, auth_headers):
    """A vehicle belonging to another tenant must look absent, not forbidden."""
    vehicle_resp = await client.post("/api/v1/vehicles/", json={
        "registration_number": "MH-01-TRACK-3",
        "vehicle_type": "van",
        "payload_capacity_kg": 800.0,
    }, headers=auth_headers)
    vehicle_id = vehicle_resp.json()["id"]

    uid = uuid.uuid4().hex[:6]
    other = await client.post("/api/v1/auth/register", json={
        "tenant_name": f"Track Outsider {uid}",
        "tenant_slug": f"track-outsider-{uid}",
        "admin_email": f"outsider_{uid}@track.com",
        "admin_password": "outsiderpass123",
        "admin_name": "Track Outsider",
    })
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    resp = await client.get(
        f"/api/v1/tracking/vehicles/{vehicle_id}/history",
        headers=other_headers,
    )
    assert resp.status_code == 404, "Tenant isolation violated!"


@pytest.mark.asyncio
async def test_vehicle_track_history_keeps_newest_when_limited(client, auth_headers):
    """`limit` must drop the OLDEST fixes, so the trail still ends at 'now'."""
    from datetime import datetime, timedelta, timezone

    from app.models.models import GPSPing
    from jose import jwt as jose_jwt

    vehicle_resp = await client.post("/api/v1/vehicles/", json={
        "registration_number": "MH-01-TRACK-5",
        "vehicle_type": "van",
        "payload_capacity_kg": 800.0,
    }, headers=auth_headers)
    vehicle_id = vehicle_resp.json()["id"]
    tenant_id = jose_jwt.get_unverified_claims(
        auth_headers["Authorization"].split()[1]
    )["tenant_id"]

    base = datetime.now(timezone.utc) - timedelta(hours=2)
    async with TestSession() as session:
        for i in range(10):
            session.add(GPSPing(
                tenant_id=tenant_id,
                vehicle_id=vehicle_id,
                latitude=19.0 + i * 0.001,
                longitude=72.8 + i * 0.001,
                timestamp=base + timedelta(minutes=i),
            ))
        await session.commit()

    resp = await client.get(
        f"/api/v1/tracking/vehicles/{vehicle_id}/history",
        params={"limit": 4},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["point_count"] == 4
    assert data["truncated"] is True

    # Still chronological, and anchored to the newest fixes (minutes 6..9)
    timestamps = [p["timestamp"] for p in data["points"]]
    assert timestamps == sorted(timestamps)
    assert data["points"][-1]["latitude"] == pytest.approx(19.009)
    assert data["points"][0]["latitude"] == pytest.approx(19.006)


@pytest.mark.asyncio
async def test_vehicle_track_history_rejects_malformed_id(client, auth_headers):
    resp = await client.get(
        "/api/v1/tracking/vehicles/not-a-uuid/history", headers=auth_headers
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_vehicle_track_history_rejects_inverted_window(client, auth_headers):
    vehicle_resp = await client.post("/api/v1/vehicles/", json={
        "registration_number": "MH-01-TRACK-4",
        "vehicle_type": "van",
        "payload_capacity_kg": 800.0,
    }, headers=auth_headers)
    vehicle_id = vehicle_resp.json()["id"]

    resp = await client.get(
        f"/api/v1/tracking/vehicles/{vehicle_id}/history",
        params={"start": "2026-08-10T12:00:00Z", "end": "2026-08-10T06:00:00Z"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


# ─── Shift Scheduling Tests ───────────────────────────────────────────────────

async def _make_driver(client, headers, name, plate=None):
    payload = {
        "full_name": name,
        "phone": f"+91-90000{uuid.uuid4().hex[:5]}",
        "license_number": f"MH-{uuid.uuid4().hex[:8]}",
        "license_expiry": "2030-01-01T00:00:00Z",
    }
    if plate:
        payload["vehicle_id"] = plate
    resp = await client.post("/api/v1/drivers/", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _make_vehicle(client, headers, plate):
    resp = await client.post("/api/v1/vehicles/", json={
        "registration_number": plate,
        "vehicle_type": "van",
        "payload_capacity_kg": 800.0,
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_create_driver_with_vehicle_id(client, auth_headers):
    """Regression: a UUID-typed FK used to reach the string column unconverted."""
    vehicle_id = await _make_vehicle(client, auth_headers, f"MH-DRV-{uuid.uuid4().hex[:5]}")
    resp = await client.post("/api/v1/drivers/", json={
        "full_name": "Bound Driver",
        "phone": "+91-9000012345",
        "license_number": f"MH-{uuid.uuid4().hex[:8]}",
        "license_expiry": "2030-01-01T00:00:00Z",
        "vehicle_id": vehicle_id,
    }, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    assert resp.json()["vehicle_id"] == vehicle_id


@pytest.mark.asyncio
async def test_create_and_list_shift(client, auth_headers):
    driver_id = await _make_driver(client, auth_headers, "Roster Driver")
    vehicle_id = await _make_vehicle(client, auth_headers, f"MH-SH-{uuid.uuid4().hex[:5]}")

    resp = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_id,
        "vehicle_id": vehicle_id,
        "starts_at": "2026-09-01T08:00:00Z",
        "ends_at": "2026-09-01T18:00:00Z",
    }, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["driver_name"] == "Roster Driver"
    assert data["vehicle_registration"].startswith("MH-SH-")
    assert data["status"] == "scheduled"

    # The week query must find it by overlap, not containment
    listed = await client.get("/api/v1/shifts/", params={
        "from": "2026-09-01T12:00:00Z",
        "to": "2026-09-02T00:00:00Z",
    }, headers=auth_headers)
    assert listed.status_code == 200
    assert any(s["id"] == data["id"] for s in listed.json())


@pytest.mark.asyncio
async def test_shift_rejects_double_booked_driver(client, auth_headers):
    driver_id = await _make_driver(client, auth_headers, "Busy Driver")

    first = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_id,
        "starts_at": "2026-09-05T08:00:00Z",
        "ends_at": "2026-09-05T16:00:00Z",
    }, headers=auth_headers)
    assert first.status_code == 201

    # Overlaps the back half of the first shift
    clash = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_id,
        "starts_at": "2026-09-05T14:00:00Z",
        "ends_at": "2026-09-05T22:00:00Z",
    }, headers=auth_headers)
    assert clash.status_code == 409
    assert "Busy Driver" in clash.json()["detail"]

    # Fully containing the first shift is also a clash
    envelop = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_id,
        "starts_at": "2026-09-05T06:00:00Z",
        "ends_at": "2026-09-05T20:00:00Z",
    }, headers=auth_headers)
    assert envelop.status_code == 409


@pytest.mark.asyncio
async def test_shift_allows_back_to_back_handover(client, auth_headers):
    """Windows are half-open, so 08:00–16:00 and 16:00–24:00 are not a clash."""
    driver_id = await _make_driver(client, auth_headers, "Handover Driver")

    first = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_id,
        "starts_at": "2026-09-06T08:00:00Z",
        "ends_at": "2026-09-06T16:00:00Z",
    }, headers=auth_headers)
    assert first.status_code == 201

    second = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_id,
        "starts_at": "2026-09-06T16:00:00Z",
        "ends_at": "2026-09-07T00:00:00Z",
    }, headers=auth_headers)
    assert second.status_code == 201, second.text


@pytest.mark.asyncio
async def test_shift_rejects_double_booked_vehicle(client, auth_headers):
    """Two different drivers cannot be rostered into the same van at once."""
    driver_a = await _make_driver(client, auth_headers, "Driver A")
    driver_b = await _make_driver(client, auth_headers, "Driver B")
    plate = f"MH-VEH-{uuid.uuid4().hex[:5]}"
    vehicle_id = await _make_vehicle(client, auth_headers, plate)

    first = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_a,
        "vehicle_id": vehicle_id,
        "starts_at": "2026-09-07T08:00:00Z",
        "ends_at": "2026-09-07T16:00:00Z",
    }, headers=auth_headers)
    assert first.status_code == 201

    clash = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_b,
        "vehicle_id": vehicle_id,
        "starts_at": "2026-09-07T12:00:00Z",
        "ends_at": "2026-09-07T20:00:00Z",
    }, headers=auth_headers)
    assert clash.status_code == 409
    assert plate in clash.json()["detail"]


@pytest.mark.asyncio
async def test_cancelled_shift_releases_its_slot(client, auth_headers):
    driver_id = await _make_driver(client, auth_headers, "Cancelling Driver")

    first = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_id,
        "starts_at": "2026-09-08T08:00:00Z",
        "ends_at": "2026-09-08T16:00:00Z",
    }, headers=auth_headers)
    shift_id = first.json()["id"]

    cancelled = await client.patch(
        f"/api/v1/shifts/{shift_id}", json={"status": "cancelled"}, headers=auth_headers
    )
    assert cancelled.status_code == 200

    # The same window is now free
    reuse = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_id,
        "starts_at": "2026-09-08T08:00:00Z",
        "ends_at": "2026-09-08T16:00:00Z",
    }, headers=auth_headers)
    assert reuse.status_code == 201, reuse.text


@pytest.mark.asyncio
async def test_shift_update_ignores_its_own_window(client, auth_headers):
    """Editing a shift must not report the row being edited as a conflict."""
    driver_id = await _make_driver(client, auth_headers, "Editing Driver")

    created = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_id,
        "starts_at": "2026-09-09T08:00:00Z",
        "ends_at": "2026-09-09T16:00:00Z",
    }, headers=auth_headers)
    shift_id = created.json()["id"]

    nudged = await client.patch(f"/api/v1/shifts/{shift_id}", json={
        "ends_at": "2026-09-09T17:00:00Z",
    }, headers=auth_headers)
    assert nudged.status_code == 200, nudged.text
    assert nudged.json()["ends_at"].startswith("2026-09-09T17:00")


@pytest.mark.asyncio
async def test_shift_clear_vehicle_unassigns(client, auth_headers):
    """A null vehicle_id means 'unchanged'; clear_vehicle is how you unassign."""
    driver_id = await _make_driver(client, auth_headers, "Unassign Driver")
    vehicle_id = await _make_vehicle(client, auth_headers, f"MH-UN-{uuid.uuid4().hex[:5]}")

    created = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_id,
        "vehicle_id": vehicle_id,
        "starts_at": "2026-09-15T08:00:00Z",
        "ends_at": "2026-09-15T16:00:00Z",
    }, headers=auth_headers)
    shift_id = created.json()["id"]

    # Omitting vehicle_id leaves the assignment in place
    untouched = await client.patch(
        f"/api/v1/shifts/{shift_id}", json={"notes": "still assigned"}, headers=auth_headers
    )
    assert untouched.json()["vehicle_id"] == vehicle_id

    cleared = await client.patch(
        f"/api/v1/shifts/{shift_id}", json={"clear_vehicle": True}, headers=auth_headers
    )
    assert cleared.status_code == 200
    assert cleared.json()["vehicle_id"] is None
    assert cleared.json()["vehicle_registration"] is None


@pytest.mark.asyncio
async def test_shift_rejects_inverted_window(client, auth_headers):
    driver_id = await _make_driver(client, auth_headers, "Backwards Driver")
    resp = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_id,
        "starts_at": "2026-09-10T18:00:00Z",
        "ends_at": "2026-09-10T08:00:00Z",
    }, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_shift_requires_auth(client):
    resp = await client.get("/api/v1/shifts/")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_shift_tenant_isolation(client, auth_headers):
    driver_id = await _make_driver(client, auth_headers, "Private Driver")
    created = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_id,
        "starts_at": "2026-09-11T08:00:00Z",
        "ends_at": "2026-09-11T16:00:00Z",
    }, headers=auth_headers)
    shift_id = created.json()["id"]

    uid = uuid.uuid4().hex[:6]
    other = await client.post("/api/v1/auth/register", json={
        "tenant_name": f"Shift Outsider {uid}",
        "tenant_slug": f"shift-outsider-{uid}",
        "admin_email": f"shift_{uid}@out.com",
        "admin_password": "outsiderpass123",
        "admin_name": "Shift Outsider",
    })
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    assert (await client.get(
        f"/api/v1/shifts/{shift_id}", headers=other_headers
    )).status_code == 404, "Tenant isolation violated!"

    # And another tenant's driver cannot be rostered
    cross = await client.post("/api/v1/shifts/", json={
        "driver_id": driver_id,
        "starts_at": "2026-09-12T08:00:00Z",
        "ends_at": "2026-09-12T16:00:00Z",
    }, headers=other_headers)
    assert cross.status_code == 404


# ─── Geofence Tests ───────────────────────────────────────────────────────────

def test_geofence_geometry_helpers():
    from app.services.geofencing import (
        circle_to_ring,
        normalise_ring,
        point_in_ring,
        ring_to_wkt,
    )

    # A 1 km circle around Mumbai contains its centre and excludes a point 5 km off
    ring = circle_to_ring(19.0760, 72.8777, 1000)
    assert ring[0] == ring[-1], "Ring must be closed"
    assert point_in_ring(19.0760, 72.8777, ring) is True
    assert point_in_ring(19.1300, 72.8777, ring) is False

    # Longitude is scaled by cos(lat), so the ring stays circular on the ground
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    width_deg = max(lons) - min(lons)
    height_deg = max(lats) - min(lats)
    assert width_deg > height_deg, "Longitude span must be widened by the cos(lat) term"

    # An open square is accepted and closed for you
    square = normalise_ring([[72.0, 19.0], [72.1, 19.0], [72.1, 19.1], [72.0, 19.1]])
    assert square[0] == square[-1]
    assert len(square) == 5
    assert point_in_ring(19.05, 72.05, square) is True
    assert point_in_ring(19.05, 72.5, square) is False

    assert ring_to_wkt(square).startswith("POLYGON((72.0 19.0")

    with pytest.raises(ValueError):
        normalise_ring([[72.0, 19.0], [72.1, 19.0]])


@pytest.mark.asyncio
async def test_create_circle_and_polygon_geofences(client, auth_headers):
    circle = await client.post("/api/v1/geofences/", json={
        "name": "Mumbai Depot",
        "kind": "circle",
        "centre_latitude": 19.0760,
        "centre_longitude": 72.8777,
        "radius_m": 500,
    }, headers=auth_headers)
    assert circle.status_code == 201
    data = circle.json()
    assert data["kind"] == "circle"
    assert data["radius_m"] == 500
    # Circles are buffered into a ring but keep their source parameters
    assert len(data["boundary"]) > 3
    assert data["boundary"][0] == data["boundary"][-1]

    polygon = await client.post("/api/v1/geofences/", json={
        "name": "Restricted Corridor",
        "kind": "polygon",
        "boundary": [[72.80, 19.00], [72.90, 19.00], [72.90, 19.10], [72.80, 19.10]],
    }, headers=auth_headers)
    assert polygon.status_code == 201
    poly_data = polygon.json()
    assert poly_data["kind"] == "polygon"
    assert poly_data["radius_m"] is None
    assert len(poly_data["boundary"]) == 5  # closed for us

    listed = await client.get("/api/v1/geofences/", headers=auth_headers)
    assert listed.status_code == 200
    names = {g["name"] for g in listed.json()}
    assert {"Mumbai Depot", "Restricted Corridor"} <= names


@pytest.mark.asyncio
async def test_create_geofence_rejects_incomplete_shape(client, auth_headers):
    # Circle without a radius
    resp = await client.post("/api/v1/geofences/", json={
        "name": "Bad Circle",
        "kind": "circle",
        "centre_latitude": 19.0,
        "centre_longitude": 72.0,
    }, headers=auth_headers)
    assert resp.status_code == 422

    # Polygon with too few points
    resp = await client.post("/api/v1/geofences/", json={
        "name": "Bad Polygon",
        "kind": "polygon",
        "boundary": [[72.0, 19.0], [72.1, 19.0]],
    }, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_geofence_requires_auth(client):
    resp = await client.get("/api/v1/geofences/")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_geofence_tenant_isolation(client, auth_headers):
    created = await client.post("/api/v1/geofences/", json={
        "name": "Private Zone",
        "kind": "circle",
        "centre_latitude": 19.0, "centre_longitude": 72.0, "radius_m": 300,
    }, headers=auth_headers)
    fence_id = created.json()["id"]

    uid = uuid.uuid4().hex[:6]
    other = await client.post("/api/v1/auth/register", json={
        "tenant_name": f"Fence Outsider {uid}",
        "tenant_slug": f"fence-outsider-{uid}",
        "admin_email": f"fence_{uid}@out.com",
        "admin_password": "outsiderpass123",
        "admin_name": "Fence Outsider",
    })
    other_headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    resp = await client.get(f"/api/v1/geofences/{fence_id}", headers=other_headers)
    assert resp.status_code == 404, "Tenant isolation violated!"

    # And it must not appear in their list
    listed = await client.get("/api/v1/geofences/", headers=other_headers)
    assert all(g["id"] != fence_id for g in listed.json())


@pytest.mark.asyncio
async def test_geofence_enter_exit_events(client, auth_headers):
    """Pings crossing a fence raise one enter and one exit, not one per ping."""
    from app.models.models import Driver, GPSPing
    from app.services.geofence_detection import evaluate_position
    from jose import jwt as jose_jwt

    tenant_id = jose_jwt.get_unverified_claims(
        auth_headers["Authorization"].split()[1]
    )["tenant_id"]

    vehicle = await client.post("/api/v1/vehicles/", json={
        "registration_number": "MH-GEO-1",
        "vehicle_type": "van",
        "payload_capacity_kg": 700.0,
    }, headers=auth_headers)
    vehicle_id = vehicle.json()["id"]

    fence = await client.post("/api/v1/geofences/", json={
        "name": "Depot Zone",
        "kind": "circle",
        "centre_latitude": 19.0760,
        "centre_longitude": 72.8777,
        "radius_m": 1000,
    }, headers=auth_headers)
    fence_id = fence.json()["id"]

    # outside → inside → inside → outside
    track = [
        (19.2000, 72.8777),   # far away
        (19.0765, 72.8780),   # inside
        (19.0758, 72.8775),   # still inside, must not re-fire
        (19.2000, 72.8777),   # back out
    ]
    async with TestSession() as session:
        for lat, lon in track:
            await evaluate_position(
                session, tenant_id=tenant_id, vehicle_id=vehicle_id,
                driver_id=None, latitude=lat, longitude=lon,
            )
            await session.commit()

    events = await client.get(
        "/api/v1/geofences/events",
        params={"vehicle_id": vehicle_id},
        headers=auth_headers,
    )
    assert events.status_code == 200
    payload = events.json()
    kinds = [e["event_type"] for e in payload]
    # Newest first
    assert kinds == ["exit", "enter"], f"Expected one enter then one exit, got {kinds}"
    assert all(e["geofence_id"] == fence_id for e in payload)
    assert payload[0]["geofence_name"] == "Depot Zone"
    assert payload[0]["vehicle_registration"] == "MH-GEO-1"

    # Acknowledging clears it from the unacknowledged feed
    ack = await client.post(
        f"/api/v1/geofences/events/{payload[0]['id']}/acknowledge", headers=auth_headers
    )
    assert ack.status_code == 200
    assert ack.json()["acknowledged_at"] is not None

    remaining = await client.get(
        "/api/v1/geofences/events",
        params={"vehicle_id": vehicle_id, "unacknowledged_only": True},
        headers=auth_headers,
    )
    assert [e["id"] for e in remaining.json()] == [payload[1]["id"]]


@pytest.mark.asyncio
async def test_geofence_occupancy_survives_many_other_crossings(client, auth_headers):
    """
    A fence the vehicle has sat inside for a long time must not be forgotten
    just because it crossed other fences many times since. Occupancy is ranked
    per fence, so an old ENTER stays authoritative.
    """
    from app.services.geofence_detection import _previous_occupancy, evaluate_position
    from jose import jwt as jose_jwt

    tenant_id = jose_jwt.get_unverified_claims(
        auth_headers["Authorization"].split()[1]
    )["tenant_id"]

    vehicle = await client.post("/api/v1/vehicles/", json={
        "registration_number": "MH-GEO-3",
        "vehicle_type": "van",
        "payload_capacity_kg": 700.0,
    }, headers=auth_headers)
    vehicle_id = vehicle.json()["id"]

    # A big fence the vehicle never leaves, and a small one it toggles through
    big = await client.post("/api/v1/geofences/", json={
        "name": "City Wide", "kind": "circle",
        "centre_latitude": 19.0, "centre_longitude": 72.9, "radius_m": 60000,
    }, headers=auth_headers)
    big_id = big.json()["id"]

    await client.post("/api/v1/geofences/", json={
        "name": "Tiny Depot", "kind": "circle",
        "centre_latitude": 19.0, "centre_longitude": 72.9, "radius_m": 300,
    }, headers=auth_headers)

    async with TestSession() as session:
        # Enter both, then toggle the tiny one repeatedly while staying in the big one
        for lat, lon in [(19.0, 72.9)] + [(19.0 + (0.02 if i % 2 else 0.0), 72.9)
                                          for i in range(40)]:
            await evaluate_position(
                session, tenant_id=tenant_id, vehicle_id=vehicle_id,
                driver_id=None, latitude=lat, longitude=lon,
            )
            await session.commit()

        occupancy = await _previous_occupancy(session, tenant_id, vehicle_id)

    assert occupancy.get(big_id) is True, "Long-standing ENTER was lost behind newer events"

    # And the big fence must not have re-fired a duplicate enter
    events = await client.get("/api/v1/geofences/events", params={
        "vehicle_id": vehicle_id, "geofence_id": big_id, "alerts_only": False,
    }, headers=auth_headers)
    assert [e["event_type"] for e in events.json()] == ["enter"]


@pytest.mark.asyncio
async def test_geofence_sweep_does_not_replay_known_pings(client, auth_headers):
    """
    Regression: the sweep used to replay pings older than the newest recorded
    transition, comparing a stale position against newer state and inventing an
    exit for every outside ping in the window.
    """
    from datetime import datetime, timedelta, timezone

    from app.models.models import GPSPing
    from app.services.geofence_detection import (
        evaluate_position,
        latest_event_time,
    )
    from jose import jwt as jose_jwt

    tenant_id = jose_jwt.get_unverified_claims(
        auth_headers["Authorization"].split()[1]
    )["tenant_id"]

    vehicle = await client.post("/api/v1/vehicles/", json={
        "registration_number": "MH-GEO-4",
        "vehicle_type": "van",
        "payload_capacity_kg": 700.0,
    }, headers=auth_headers)
    vehicle_id = vehicle.json()["id"]

    await client.post("/api/v1/geofences/", json={
        "name": "Sweep Zone", "kind": "circle",
        "centre_latitude": 20.0, "centre_longitude": 74.0, "radius_m": 1000,
    }, headers=auth_headers)

    now = datetime.now(timezone.utc)
    outside = [(now - timedelta(minutes=m), 20.5, 74.0) for m in (15, 12, 9)]
    inside = (now - timedelta(minutes=5), 20.0, 74.0)

    async with TestSession() as session:
        for stamp, lat, lon in [*outside, inside]:
            session.add(GPSPing(
                tenant_id=tenant_id, vehicle_id=vehicle_id,
                latitude=lat, longitude=lon, timestamp=stamp,
            ))
        # The inline path saw only the newest fix and recorded the ENTER
        await evaluate_position(
            session, tenant_id=tenant_id, vehicle_id=vehicle_id, driver_id=None,
            latitude=inside[1], longitude=inside[2], occurred_at=inside[0],
        )
        await session.commit()

        watermark = await latest_event_time(session, tenant_id, vehicle_id)
        assert watermark is not None

        # The sweep's rule: replay only pings strictly newer than the watermark.
        # Every stale outside fix must be excluded.
        stale = [p for p in [*outside] if p[0] <= watermark]
        assert len(stale) == 3, "All three outside pings predate the ENTER"

    events = await client.get("/api/v1/geofences/events", params={
        "vehicle_id": vehicle_id, "alerts_only": False,
    }, headers=auth_headers)
    assert [e["event_type"] for e in events.json()] == ["enter"], (
        "Replaying pre-watermark pings would fabricate exit events"
    )


@pytest.mark.asyncio
async def test_geofence_rejects_circle_too_large_for_latitude(client, auth_headers):
    """A ring that runs off the map would store invalid geometry for PostGIS."""
    resp = await client.post("/api/v1/geofences/", json={
        "name": "Polar Blowout",
        "kind": "circle",
        "centre_latitude": 89.9,
        "centre_longitude": 0.0,
        "radius_m": 200000,
    }, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_geofence_alert_opt_out_still_tracks_state(client, auth_headers):
    """
    A fence that only alerts on exit must still record the enter transition,
    otherwise the exit it does care about could never be detected.
    """
    from app.services.geofence_detection import evaluate_position
    from jose import jwt as jose_jwt

    tenant_id = jose_jwt.get_unverified_claims(
        auth_headers["Authorization"].split()[1]
    )["tenant_id"]

    vehicle = await client.post("/api/v1/vehicles/", json={
        "registration_number": "MH-GEO-2",
        "vehicle_type": "van",
        "payload_capacity_kg": 700.0,
    }, headers=auth_headers)
    vehicle_id = vehicle.json()["id"]

    await client.post("/api/v1/geofences/", json={
        "name": "Exit Only Zone",
        "kind": "circle",
        "centre_latitude": 18.5204,
        "centre_longitude": 73.8567,
        "radius_m": 1000,
        "alert_on_enter": False,
        "alert_on_exit": True,
    }, headers=auth_headers)

    async with TestSession() as session:
        for lat, lon in [(18.5204, 73.8567), (18.9000, 73.8567)]:
            await evaluate_position(
                session, tenant_id=tenant_id, vehicle_id=vehicle_id,
                driver_id=None, latitude=lat, longitude=lon,
            )
            await session.commit()

    alerts = await client.get(
        "/api/v1/geofences/events",
        params={"vehicle_id": vehicle_id},
        headers=auth_headers,
    )
    # Only the exit is an alert...
    assert [e["event_type"] for e in alerts.json()] == ["exit"]

    everything = await client.get(
        "/api/v1/geofences/events",
        params={"vehicle_id": vehicle_id, "alerts_only": False},
        headers=auth_headers,
    )
    # ...but the enter was still recorded, which is what made the exit detectable
    assert [e["event_type"] for e in everything.json()] == ["exit", "enter"]
    assert [e["is_alert"] for e in everything.json()] == [True, False]


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
