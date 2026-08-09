"""
Cargonaut — SQLAlchemy ORM Models

Fixes applied:
  - TenantMixin removed. Every model owns its explicit tenant_id FK column.
    The mixin defined a bare Column with no ForeignKey; models that inherited
    it never got a real FK constraint, so Postgres rejected inserts.
  - JSONB mutable defaults changed from `default={}` / `default=[]` to
    `default=lambda: {}` / `default=lambda: []` to avoid shared-state bugs.
  - GPSPing.tenant_id now has a proper FK to tenants.id.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import (
    Column, String, Float, Integer, Boolean, DateTime,
    ForeignKey, Text, Enum, Index, Numeric, JSON, UUID,
)
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.orm import relationship
from app.core.config import settings


if "sqlite" in settings.DATABASE_URL:
    def Geometry(*args, **kwargs):
        return Text()
else:
    from geoalchemy2 import Geometry


JSONB = JSON().with_variant(PG_JSONB(), "postgresql")


from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ─── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, PyEnum):
    SUPER_ADMIN = "super_admin"
    ADMIN       = "admin"
    DISPATCHER  = "dispatcher"
    DRIVER      = "driver"
    VIEWER      = "viewer"


class VehicleStatus(str, PyEnum):
    AVAILABLE   = "available"
    IN_TRANSIT  = "in_transit"
    MAINTENANCE = "maintenance"
    OFFLINE     = "offline"


class VehicleType(str, PyEnum):
    TRUCK      = "truck"
    VAN        = "van"
    BIKE       = "bike"
    CAR        = "car"
    MOTORCYCLE = "motorcycle"


class OrderStatus(str, PyEnum):
    DRAFT      = "draft"
    CONFIRMED  = "confirmed"
    DISPATCHED = "dispatched"
    IN_TRANSIT = "in_transit"
    ARRIVED    = "arrived"
    DELIVERED  = "delivered"
    FAILED     = "failed"
    CANCELLED  = "cancelled"


class HubType(str, PyEnum):
    WAREHOUSE           = "warehouse"
    DISTRIBUTION_CENTER = "distribution_center"
    PICKUP_POINT        = "pickup_point"
    CROSS_DOCK          = "cross_dock"


class FuelType(str, PyEnum):
    PETROL   = "petrol"
    DIESEL   = "diesel"
    ELECTRIC = "electric"
    HYBRID   = "hybrid"
    CNG      = "cng"


# ─── Tenant ───────────────────────────────────────────────────────────────────

class Tenant(Base):
    __tablename__ = "tenants"

    id         = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    name       = Column(String(200), nullable=False, unique=True)
    slug       = Column(String(100), nullable=False, unique=True, index=True)
    plan       = Column(String(50), default="starter")
    is_active  = Column(Boolean, default=True)
    # lambda default prevents all rows sharing the same dict object
    settings   = Column(JSONB, default=lambda: {})
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    users   = relationship("User",    back_populates="tenant", lazy="selectin")
    hubs    = relationship("Hub",     back_populates="tenant")
    vehicles= relationship("Vehicle", back_populates="tenant")
    drivers = relationship("Driver",  back_populates="tenant")
    orders  = relationship("Order",   back_populates="tenant")


# ─── User ─────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id       = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    email           = Column(String(255), nullable=False, unique=True, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name       = Column(String(200), nullable=False)
    role            = Column(Enum(UserRole), default=UserRole.DISPATCHER, nullable=False)
    is_active       = Column(Boolean, default=True)
    avatar_url      = Column(String(500), nullable=True)
    phone           = Column(String(20),  nullable=True)
    last_login      = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at      = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant", back_populates="users")

    __table_args__ = (
        Index("ix_users_tenant_email", "tenant_id", "email"),
    )


# ─── Hub (Warehouse / DC) ─────────────────────────────────────────────────────

class Hub(Base):
    __tablename__ = "hubs"

    id                    = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id             = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name                  = Column(String(200), nullable=False)
    hub_type              = Column(Enum(HubType), default=HubType.WAREHOUSE, nullable=False)
    address               = Column(Text, nullable=False)
    city                  = Column(String(100), nullable=False)
    state                 = Column(String(100), nullable=True)
    country               = Column(String(100), nullable=False)
    postal_code           = Column(String(20),  nullable=True)
    latitude              = Column(Float, nullable=False)
    longitude             = Column(Float, nullable=False)
    geom                  = Column(Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=True)
    geofence_radius_meters= Column(Integer, default=200)
    contact_name          = Column(String(200), nullable=True)
    contact_phone         = Column(String(20),  nullable=True)
    is_active             = Column(Boolean, default=True)
    capacity              = Column(Integer, nullable=True)
    created_at            = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at            = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    tenant            = relationship("Tenant", back_populates="hubs")
    orders_origin     = relationship("Order", back_populates="origin_hub",      foreign_keys="Order.origin_hub_id")
    orders_destination= relationship("Order", back_populates="destination_hub", foreign_keys="Order.destination_hub_id")


# ─── Vehicle ──────────────────────────────────────────────────────────────────

class Vehicle(Base):
    __tablename__ = "vehicles"

    id                      = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id               = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    registration_number     = Column(String(50),  nullable=False)
    make                    = Column(String(100), nullable=True)
    model                   = Column(String(100), nullable=True)
    year                    = Column(Integer,     nullable=True)
    vehicle_type            = Column(Enum(VehicleType),   nullable=False, default=VehicleType.VAN)
    fuel_type               = Column(Enum(FuelType),      nullable=False, default=FuelType.DIESEL)
    payload_capacity_kg     = Column(Float,  nullable=False, default=1000.0)
    volume_capacity_m3      = Column(Float,  nullable=True)
    status                  = Column(Enum(VehicleStatus), nullable=False, default=VehicleStatus.AVAILABLE)
    last_maintenance        = Column(DateTime(timezone=True), nullable=True)
    next_maintenance        = Column(DateTime(timezone=True), nullable=True)
    odometer_km             = Column(Float, default=0.0)
    fuel_efficiency_km_per_l= Column(Float, nullable=True)
    insurance_expiry        = Column(DateTime(timezone=True), nullable=True)
    notes                   = Column(Text,  nullable=True)
    created_at              = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at              = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    tenant     = relationship("Tenant",  back_populates="vehicles")
    driver     = relationship("Driver",  back_populates="vehicle", uselist=False)
    orders     = relationship("Order",   back_populates="vehicle")
    gps_pings  = relationship("GPSPing", back_populates="vehicle", lazy="dynamic")


# ─── Driver ───────────────────────────────────────────────────────────────────

class Driver(Base):
    __tablename__ = "drivers"

    id                = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id         = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id           = Column(UUID(as_uuid=False), ForeignKey("users.id"),    nullable=True)
    vehicle_id        = Column(UUID(as_uuid=False), ForeignKey("vehicles.id"), nullable=True)
    full_name         = Column(String(200), nullable=False)
    phone             = Column(String(20),  nullable=False)
    email             = Column(String(255), nullable=True)
    license_number    = Column(String(50),  nullable=False)
    license_expiry    = Column(DateTime(timezone=True), nullable=False)
    license_class     = Column(String(20),  nullable=True)
    is_active         = Column(Boolean, default=True)
    is_available      = Column(Boolean, default=True)
    shift_start       = Column(String(5), nullable=True)   # HH:MM
    shift_end         = Column(String(5), nullable=True)   # HH:MM
    current_latitude  = Column(Float, nullable=True)
    current_longitude = Column(Float, nullable=True)
    last_ping_at      = Column(DateTime(timezone=True), nullable=True)
    rating            = Column(Float,   default=5.0)
    total_deliveries  = Column(Integer, default=0)
    photo_url         = Column(String(500), nullable=True)
    created_at        = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at        = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    tenant    = relationship("Tenant",  back_populates="drivers")
    vehicle   = relationship("Vehicle", back_populates="driver")
    orders    = relationship("Order",   back_populates="driver")
    gps_pings = relationship("GPSPing", back_populates="driver", lazy="dynamic")


# ─── Order ────────────────────────────────────────────────────────────────────

class Order(Base):
    __tablename__ = "orders"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id   = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_number= Column(String(50), nullable=False, index=True)

    driver_id          = Column(UUID(as_uuid=False), ForeignKey("drivers.id"),  nullable=True)
    vehicle_id         = Column(UUID(as_uuid=False), ForeignKey("vehicles.id"), nullable=True)
    origin_hub_id      = Column(UUID(as_uuid=False), ForeignKey("hubs.id"),     nullable=True)
    destination_hub_id = Column(UUID(as_uuid=False), ForeignKey("hubs.id"),     nullable=True)

    status         = Column(Enum(OrderStatus), default=OrderStatus.DRAFT, nullable=False, index=True)
    # lambda default — each row gets its own fresh list, never a shared object
    status_history = Column(JSONB, default=lambda: [])

    customer_name  = Column(String(200), nullable=False)
    customer_phone = Column(String(20),  nullable=True)
    customer_email = Column(String(255), nullable=True)

    delivery_address    = Column(Text,        nullable=False)
    delivery_city       = Column(String(100), nullable=False)
    delivery_latitude   = Column(Float,       nullable=True)
    delivery_longitude  = Column(Float,       nullable=True)
    delivery_geofence_m = Column(Integer, default=150)

    description             = Column(Text,    nullable=True)
    weight_kg               = Column(Float,   nullable=True)
    volume_m3               = Column(Float,   nullable=True)
    fragile                 = Column(Boolean, default=False)
    requires_refrigeration  = Column(Boolean, default=False)

    scheduled_pickup   = Column(DateTime(timezone=True), nullable=True)
    scheduled_delivery = Column(DateTime(timezone=True), nullable=True)
    actual_pickup      = Column(DateTime(timezone=True), nullable=True)
    actual_delivery    = Column(DateTime(timezone=True), nullable=True)
    sla_deadline       = Column(DateTime(timezone=True), nullable=True)

    declared_value = Column(Numeric(12, 2), nullable=True)
    delivery_fee   = Column(Numeric(10, 2), nullable=True)
    currency       = Column(String(3), default="USD")

    priority           = Column(Integer, default=1)   # 1=normal 2=high 3=urgent
    notes              = Column(Text,    nullable=True)
    proof_of_delivery  = Column(JSONB,   default=lambda: {})

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    tenant          = relationship("Tenant",  back_populates="orders")
    driver          = relationship("Driver",  back_populates="orders")
    vehicle         = relationship("Vehicle", back_populates="orders")
    origin_hub      = relationship("Hub", back_populates="orders_origin",      foreign_keys=[origin_hub_id])
    destination_hub = relationship("Hub", back_populates="orders_destination", foreign_keys=[destination_hub_id])

    __table_args__ = (
        Index("ix_orders_tenant_status", "tenant_id", "status"),
        Index("ix_orders_tenant_number", "tenant_id", "order_number"),
    )


# ─── GPS Ping ─────────────────────────────────────────────────────────────────

class GPSPing(Base):
    __tablename__ = "gps_pings"

    id        = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    driver_id = Column(UUID(as_uuid=False), ForeignKey("drivers.id",  ondelete="CASCADE"), nullable=True)
    vehicle_id= Column(UUID(as_uuid=False), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=True)
    order_id  = Column(UUID(as_uuid=False), ForeignKey("orders.id",   ondelete="SET NULL"), nullable=True)

    latitude      = Column(Float, nullable=False)
    longitude     = Column(Float, nullable=False)
    geom          = Column(Geometry(geometry_type="POINT", srid=4326, spatial_index=False), nullable=True)
    altitude_m    = Column(Float,   nullable=True)
    speed_kmh     = Column(Float,   nullable=True)
    heading       = Column(Float,   nullable=True)   # 0–360 degrees
    accuracy_m    = Column(Float,   nullable=True)
    battery_level = Column(Integer, nullable=True)
    timestamp     = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    driver  = relationship("Driver",  back_populates="gps_pings")
    vehicle = relationship("Vehicle", back_populates="gps_pings")

    __table_args__ = (
        Index("ix_gps_pings_driver_ts", "driver_id", "timestamp"),
        Index("ix_gps_pings_tenant_ts", "tenant_id", "timestamp"),
    )