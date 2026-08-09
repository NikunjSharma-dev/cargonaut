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
    JSON,
    UUID,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.orm import relationship

from app.core.config import settings
from app.core.database import Base

if "sqlite" in settings.DATABASE_URL:
    def Geometry(*args, **kwargs):
        return Text()
else:
    from geoalchemy2 import Geometry


JSONB = JSON().with_variant(PG_JSONB(), "postgresql")



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


class TransportMode(str, PyEnum):
    """How a shipment moves. Drives capacity, ETA and handling rules."""
    ROAD = "road"
    AIR  = "air"


class VehicleType(str, PyEnum):
    TRUCK      = "truck"
    VAN        = "van"
    BIKE       = "bike"
    CAR        = "car"
    MOTORCYCLE = "motorcycle"
    FREIGHTER  = "freighter"   # wide-body cargo aircraft
    TURBOPROP  = "turboprop"   # regional feeder freighter


# Vehicle types that fly. Everything else is road.
AIR_VEHICLE_TYPES = frozenset({VehicleType.FREIGHTER, VehicleType.TURBOPROP})


def mode_for_vehicle_type(vehicle_type: "VehicleType") -> "TransportMode":
    return TransportMode.AIR if vehicle_type in AIR_VEHICLE_TYPES else TransportMode.ROAD


class CargoType(str, PyEnum):
    """What is inside the shipment — decides handling, equipment and mode."""
    GENERAL      = "general"
    PARCEL       = "parcel"
    PALLETIZED   = "palletized"
    REFRIGERATED = "refrigerated"
    FRAGILE      = "fragile"
    HAZMAT       = "hazmat"
    LIQUID_BULK  = "liquid_bulk"
    OVERSIZED    = "oversized"
    HIGH_VALUE   = "high_value"


# Volumetric (dimensional) weight factors. Air is the IATA 1:167 kg/m³ standard;
# road freight is billed against a denser 333 kg/m³ equivalent.
VOLUMETRIC_FACTOR_KG_PER_M3 = {
    TransportMode.ROAD: 333.0,
    TransportMode.AIR:  167.0,
}


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
    AIR_CARGO_TERMINAL  = "air_cargo_terminal"


class GeofenceKind(str, PyEnum):
    """How the dispatcher drew the fence. Both store a polygon ring."""
    CIRCLE  = "circle"
    POLYGON = "polygon"


class GeofenceEventType(str, PyEnum):
    ENTER = "enter"
    EXIT  = "exit"


class ShiftStatus(str, PyEnum):
    SCHEDULED = "scheduled"
    ACTIVE    = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class MaintenanceType(str, PyEnum):
    FUEL              = "fuel"
    OIL_CHANGE        = "oil_change"
    TIRE_ROTATION     = "tire_rotation"
    REPAIR            = "repair"
    INSPECTION        = "inspection"
    SCHEDULED_SERVICE = "scheduled_service"



class FuelType(str, PyEnum):
    PETROL   = "petrol"
    DIESEL   = "diesel"
    ELECTRIC = "electric"
    HYBRID   = "hybrid"
    CNG      = "cng"
    JET_A1   = "jet_a1"   # aviation turbine fuel


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
    iata_code             = Column(String(3), nullable=True)   # set on air cargo terminals
    handles_air_cargo     = Column(Boolean, nullable=False, default=False)
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
    transport_mode          = Column(Enum(TransportMode), nullable=False, default=TransportMode.ROAD, index=True)
    fuel_type               = Column(Enum(FuelType),      nullable=False, default=FuelType.DIESEL)
    payload_capacity_kg     = Column(Float,  nullable=False, default=1000.0)
    volume_capacity_m3      = Column(Float,  nullable=True)
    has_refrigeration       = Column(Boolean, nullable=False, default=False)
    status                  = Column(Enum(VehicleStatus), nullable=False, default=VehicleStatus.AVAILABLE)

    # Air-freight assets only — null on road vehicles
    tail_number             = Column(String(12), nullable=True)   # e.g. VT-CGN
    uld_positions           = Column(Integer,    nullable=True)   # main + lower deck ULD slots
    range_km                = Column(Float,      nullable=True)   # max stage length
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
    cargo_type              = Column(Enum(CargoType),     nullable=False, default=CargoType.GENERAL, index=True)
    transport_mode          = Column(Enum(TransportMode), nullable=False, default=TransportMode.ROAD, index=True)
    weight_kg               = Column(Float,   nullable=True)
    volume_m3               = Column(Float,   nullable=True)
    pieces                  = Column(Integer, nullable=True)
    fragile                 = Column(Boolean, default=False)
    requires_refrigeration  = Column(Boolean, default=False)

    # Air freight paperwork — only populated on transport_mode = air
    air_waybill_number      = Column(String(20), nullable=True, index=True)
    flight_number           = Column(String(10), nullable=True)
    hazmat_un_code          = Column(String(10), nullable=True)   # e.g. UN1263

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

    @property
    def chargeable_weight_kg(self) -> float | None:
        """
        Freight is billed on whichever is greater: actual weight, or the weight
        the volume would have at the mode's density factor. Air uses the IATA
        1:167 kg/m³ rule; road tariffs are denser, so light bulky loads only
        get up-rated at 333 kg/m³.
        """
        if self.weight_kg is None and self.volume_m3 is None:
            return None
        actual = self.weight_kg or 0.0
        if not self.volume_m3:
            return round(actual, 2)
        factor = VOLUMETRIC_FACTOR_KG_PER_M3[TransportMode(self.transport_mode)]
        return round(max(actual, self.volume_m3 * factor), 2)

    tenant          = relationship("Tenant",  back_populates="orders")
    driver          = relationship("Driver",  back_populates="orders")
    vehicle         = relationship("Vehicle", back_populates="orders")
    origin_hub      = relationship("Hub", back_populates="orders_origin",      foreign_keys=[origin_hub_id])
    destination_hub = relationship("Hub", back_populates="orders_destination", foreign_keys=[destination_hub_id])

    __table_args__ = (
        Index("ix_orders_tenant_status", "tenant_id", "status"),
        Index("ix_orders_tenant_number", "tenant_id", "order_number"),
        Index("ix_orders_tenant_mode", "tenant_id", "transport_mode"),
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
        # Route replay scans one vehicle's breadcrumb over a time window
        Index("ix_gps_pings_vehicle_ts", "vehicle_id", "timestamp"),
    )


# ─── Shift ────────────────────────────────────────────────────────────────────

class Shift(Base):
    """
    A driver rostered to work a window, optionally in a specific vehicle.

    `Driver.shift_start` / `shift_end` are the driver's recurring daily pattern
    ("normally works 08:00–18:00"). A Shift is a dated assignment on the roster.
    The two describe different things and are intentionally kept apart.

    Windows are half-open — [starts_at, ends_at) — so a shift ending at 18:00
    and the next starting at 18:00 are a clean handover, not an overlap.
    """
    __tablename__ = "shifts"

    id         = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id  = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    driver_id  = Column(UUID(as_uuid=False), ForeignKey("drivers.id",  ondelete="CASCADE"), nullable=False, index=True)
    vehicle_id = Column(UUID(as_uuid=False), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True)

    starts_at  = Column(DateTime(timezone=True), nullable=False)
    ends_at    = Column(DateTime(timezone=True), nullable=False)
    status     = Column(Enum(ShiftStatus), nullable=False, default=ShiftStatus.SCHEDULED)
    notes      = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    driver  = relationship("Driver")
    vehicle = relationship("Vehicle")

    __table_args__ = (
        # Roster reads are "this tenant, this week"
        Index("ix_shifts_tenant_start", "tenant_id", "starts_at"),
        # Double-booking checks scan one driver's / one vehicle's window
        Index("ix_shifts_driver_window", "driver_id", "starts_at", "ends_at"),
        Index("ix_shifts_vehicle_window", "vehicle_id", "starts_at", "ends_at"),
        CheckConstraint("ends_at > starts_at", name="ck_shifts_window_ordered"),
    )


# ─── Geofence ─────────────────────────────────────────────────────────────────

class Geofence(Base):
    """
    A named zone a vehicle can be inside or outside of.

    `area` and `boundary` hold the same closed ring: `area` for PostGIS
    ST_Contains and the spatial index, `boundary` as plain JSON for the map and
    for containment where PostGIS is absent. They are only ever written together
    through app.services.geofencing, so they cannot drift.
    """
    __tablename__ = "geofences"

    id         = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id  = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    hub_id     = Column(UUID(as_uuid=False), ForeignKey("hubs.id", ondelete="SET NULL"), nullable=True)

    name       = Column(String(200), nullable=False)
    kind       = Column(Enum(GeofenceKind), nullable=False, default=GeofenceKind.CIRCLE)
    area       = Column(Geometry(geometry_type="POLYGON", srid=4326, spatial_index=False), nullable=True)
    boundary   = Column(JSONB, nullable=False, default=lambda: [])

    # Circle fences keep their source parameters so the UI can re-edit them as a
    # circle instead of handing the dispatcher back 48 polygon vertices.
    centre_latitude  = Column(Float, nullable=True)
    centre_longitude = Column(Float, nullable=True)
    radius_m         = Column(Float, nullable=True)

    # Which transitions raise an alert. A depot may only care about arrivals.
    alert_on_enter = Column(Boolean, nullable=False, default=True)
    alert_on_exit  = Column(Boolean, nullable=False, default=True)
    is_active      = Column(Boolean, nullable=False, default=True)
    colour         = Column(String(9), nullable=True)   # #RRGGBB or #RRGGBBAA
    notes          = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    events = relationship("GeofenceEvent", back_populates="geofence", lazy="dynamic")

    __table_args__ = (
        Index("ix_geofences_tenant_active", "tenant_id", "is_active"),
    )


class GeofenceEvent(Base):
    """A vehicle crossing a fence boundary. Transitions only, never per-ping."""
    __tablename__ = "geofence_events"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id   = Column(UUID(as_uuid=False), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    geofence_id = Column(UUID(as_uuid=False), ForeignKey("geofences.id", ondelete="CASCADE"), nullable=False, index=True)
    vehicle_id  = Column(UUID(as_uuid=False), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=True)
    driver_id   = Column(UUID(as_uuid=False), ForeignKey("drivers.id",  ondelete="SET NULL"), nullable=True)

    event_type  = Column(Enum(GeofenceEventType), nullable=False)
    # Every transition is stored so occupancy can be reconstructed; this marks
    # the ones the fence actually wants surfaced as an alert.
    is_alert    = Column(Boolean, nullable=False, default=True)
    latitude    = Column(Float, nullable=False)
    longitude   = Column(Float, nullable=False)
    occurred_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)

    geofence = relationship("Geofence", back_populates="events")

    __table_args__ = (
        # The alert feed reads "newest events for this tenant"
        Index("ix_geofence_events_tenant_ts", "tenant_id", "occurred_at"),
        # Occupancy lookup: latest state per (vehicle, fence)
        Index("ix_geofence_events_vehicle_fence", "vehicle_id", "geofence_id", "occurred_at"),
    )


# ─── Maintenance Log ─────────────────────────────────────────────────────────

class MaintenanceLog(Base):
    """Fuel & maintenance event record for a vehicle."""
    __tablename__ = "maintenance_logs"

    id         = Column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id  = Column(UUID(as_uuid=False), ForeignKey("tenants.id",  ondelete="CASCADE"), nullable=False, index=True)
    vehicle_id = Column(UUID(as_uuid=False), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)

    type       = Column(Enum(MaintenanceType), nullable=False)
    cost       = Column(Float, nullable=False)
    odometer   = Column(Float, nullable=False)
    date       = Column(DateTime(timezone=True), nullable=False)
    notes      = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    vehicle = relationship("Vehicle")

    __table_args__ = (
        Index("ix_maintenance_logs_tenant_date", "tenant_id", "date"),
    )

