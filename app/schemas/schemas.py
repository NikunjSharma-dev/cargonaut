"""
Cargonaut — Pydantic Schemas (Request / Response)
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.models import (
    CargoType,
    FuelType,
    GeofenceEventType,
    GeofenceKind,
    HubType,
    MaintenanceType,
    OrderStatus,
    ShiftStatus,
    TransportMode,
    UserRole,
    VehicleStatus,
    VehicleType,
)

# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    tenant_id: str
    email: str
    role: str
    full_name: str

class RegisterTenantRequest(BaseModel):
    tenant_name: str = Field(..., min_length=2, max_length=200)
    tenant_slug: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-z0-9-]+$")
    admin_email: EmailStr
    admin_password: str = Field(..., min_length=8)
    admin_name: str


# ─── Tenant ───────────────────────────────────────────────────────────────────

class TenantResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    plan: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─── User ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str
    role: UserRole = UserRole.DISPATCHER
    phone: Optional[str] = None

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None

class UserResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    phone: Optional[str]
    avatar_url: Optional[str]
    last_login: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Hub ──────────────────────────────────────────────────────────────────────

class HubCreate(BaseModel):
    name: str = Field(..., min_length=2)
    hub_type: HubType = HubType.WAREHOUSE
    address: str
    city: str
    state: Optional[str] = None
    country: str
    postal_code: Optional[str] = None
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    geofence_radius_meters: int = Field(default=200, ge=50, le=5000)
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    capacity: Optional[int] = None
    iata_code: Optional[str] = Field(None, min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    handles_air_cargo: bool = False

class HubUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None
    geofence_radius_meters: Optional[int] = None
    capacity: Optional[int] = None
    iata_code: Optional[str] = Field(None, min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    handles_air_cargo: Optional[bool] = None

class HubResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    hub_type: HubType
    address: str
    city: str
    country: str
    latitude: float
    longitude: float
    geofence_radius_meters: int
    contact_name: Optional[str]
    contact_phone: Optional[str]
    is_active: bool
    capacity: Optional[int]
    iata_code: Optional[str]
    handles_air_cargo: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Vehicle ──────────────────────────────────────────────────────────────────

class VehicleCreate(BaseModel):
    registration_number: str
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = Field(None, ge=1980, le=2030)
    vehicle_type: VehicleType = VehicleType.VAN
    fuel_type: FuelType = FuelType.DIESEL
    payload_capacity_kg: float = Field(..., gt=0)
    volume_capacity_m3: Optional[float] = None
    has_refrigeration: bool = False
    fuel_efficiency_km_per_l: Optional[float] = None
    notes: Optional[str] = None
    # Air assets. `transport_mode` is derived from `vehicle_type` server-side,
    # so a caller cannot register a freighter as a road unit.
    tail_number: Optional[str] = Field(None, max_length=12)
    uld_positions: Optional[int] = Field(None, ge=1, le=60)
    range_km: Optional[float] = Field(None, gt=0)

class VehicleUpdate(BaseModel):
    status: Optional[VehicleStatus] = None
    odometer_km: Optional[float] = None
    last_maintenance: Optional[datetime] = None
    next_maintenance: Optional[datetime] = None
    has_refrigeration: Optional[bool] = None
    notes: Optional[str] = None

class VehicleResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    registration_number: str
    make: Optional[str]
    model: Optional[str]
    year: Optional[int]
    vehicle_type: VehicleType
    transport_mode: TransportMode
    fuel_type: FuelType
    payload_capacity_kg: float
    volume_capacity_m3: Optional[float]
    has_refrigeration: bool
    status: VehicleStatus
    odometer_km: float
    tail_number: Optional[str]
    uld_positions: Optional[int]
    range_km: Optional[float]
    last_maintenance: Optional[datetime]
    next_maintenance: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Driver ───────────────────────────────────────────────────────────────────

class DriverCreate(BaseModel):
    full_name: str
    phone: str
    email: Optional[EmailStr] = None
    license_number: str
    license_expiry: datetime
    license_class: Optional[str] = None
    vehicle_id: Optional[UUID] = None
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None

class DriverUpdate(BaseModel):
    is_available: Optional[bool] = None
    vehicle_id: Optional[UUID] = None
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None
    is_active: Optional[bool] = None

class DriverResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    full_name: str
    phone: str
    email: Optional[str]
    license_number: str
    license_expiry: datetime
    is_active: bool
    is_available: bool
    shift_start: Optional[str]
    shift_end: Optional[str]
    current_latitude: Optional[float]
    current_longitude: Optional[float]
    last_ping_at: Optional[datetime]
    rating: float
    total_deliveries: int
    vehicle_id: Optional[UUID]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Order ────────────────────────────────────────────────────────────────────

class OrderCreate(BaseModel):
    customer_name: str
    customer_phone: Optional[str] = None
    customer_email: Optional[EmailStr] = None
    delivery_address: str
    delivery_city: str
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None
    description: Optional[str] = None
    cargo_type: CargoType = CargoType.GENERAL
    transport_mode: TransportMode = TransportMode.ROAD
    weight_kg: Optional[float] = None
    volume_m3: Optional[float] = None
    pieces: Optional[int] = Field(None, ge=1)
    fragile: bool = False
    requires_refrigeration: bool = False
    air_waybill_number: Optional[str] = Field(None, max_length=20)
    flight_number: Optional[str] = Field(None, max_length=10)
    hazmat_un_code: Optional[str] = Field(None, max_length=10)
    scheduled_pickup: Optional[datetime] = None
    scheduled_delivery: Optional[datetime] = None
    sla_deadline: Optional[datetime] = None
    declared_value: Optional[Decimal] = None
    delivery_fee: Optional[Decimal] = None
    currency: str = "USD"
    priority: int = Field(default=1, ge=1, le=3)
    notes: Optional[str] = None
    origin_hub_id: Optional[UUID] = None
    destination_hub_id: Optional[UUID] = None

class OrderUpdate(BaseModel):
    status: Optional[OrderStatus] = None
    driver_id: Optional[UUID] = None
    vehicle_id: Optional[UUID] = None
    cargo_type: Optional[CargoType] = None
    transport_mode: Optional[TransportMode] = None
    air_waybill_number: Optional[str] = Field(None, max_length=20)
    flight_number: Optional[str] = Field(None, max_length=10)
    notes: Optional[str] = None
    actual_pickup: Optional[datetime] = None
    actual_delivery: Optional[datetime] = None

class OrderResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    order_number: str
    status: OrderStatus
    customer_name: str
    customer_phone: Optional[str]
    customer_email: Optional[str]
    delivery_address: str
    delivery_city: str
    delivery_latitude: Optional[float]
    delivery_longitude: Optional[float]
    cargo_type: CargoType
    transport_mode: TransportMode
    weight_kg: Optional[float]
    volume_m3: Optional[float]
    pieces: Optional[int]
    # Computed on the ORM model — the greater of actual and volumetric weight
    chargeable_weight_kg: Optional[float] = None
    fragile: bool
    requires_refrigeration: bool
    air_waybill_number: Optional[str]
    flight_number: Optional[str]
    hazmat_un_code: Optional[str]
    scheduled_delivery: Optional[datetime]
    actual_delivery: Optional[datetime]
    sla_deadline: Optional[datetime]
    delivery_fee: Optional[Decimal]
    currency: str
    priority: int
    driver_id: Optional[UUID]
    vehicle_id: Optional[UUID]
    origin_hub_id: Optional[UUID]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── GPS Ping ─────────────────────────────────────────────────────────────────

class GPSPingCreate(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    altitude_m: Optional[float] = None
    speed_kmh: Optional[float] = None
    heading: Optional[float] = Field(None, ge=0, le=360)
    accuracy_m: Optional[float] = None
    battery_level: Optional[int] = Field(None, ge=0, le=100)
    order_id: Optional[UUID] = None

class GPSPingResponse(BaseModel):
    id: UUID
    driver_id: Optional[UUID] = None
    vehicle_id: Optional[UUID]
    latitude: float
    longitude: float
    speed_kmh: Optional[float]
    heading: Optional[float]
    timestamp: datetime
    geofence_triggered: Optional[bool] = False
    triggered_order_id: Optional[UUID] = None

    class Config:
        from_attributes = True


# ─── Route Replay ─────────────────────────────────────────────────────────────

class VehicleTrackPoint(BaseModel):
    """One breadcrumb on a vehicle's historical trail."""
    latitude: float
    longitude: float
    speed_kmh: Optional[float] = None
    heading: Optional[float] = None
    timestamp: datetime

    class Config:
        from_attributes = True


class VehicleTrackResponse(BaseModel):
    vehicle_id: UUID
    registration_number: str
    start: datetime
    end: datetime
    point_count: int
    distance_km: float
    # True when `limit` clipped the window — the oldest fixes were dropped, so
    # the trail starts later than `start` and `distance_km` is a partial total.
    truncated: bool = False
    # Ordered oldest → newest, so the scrubber can index straight into it
    points: List[VehicleTrackPoint]


# ─── Shifts ───────────────────────────────────────────────────────────────────

class ShiftCreate(BaseModel):
    driver_id: UUID
    vehicle_id: Optional[UUID] = None
    starts_at: datetime
    ends_at: datetime
    status: ShiftStatus = ShiftStatus.SCHEDULED
    notes: Optional[str] = None

    @model_validator(mode="after")
    def check_window(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("`ends_at` must be later than `starts_at`")
        return self


class ShiftUpdate(BaseModel):
    driver_id: Optional[UUID] = None
    vehicle_id: Optional[UUID] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    status: Optional[ShiftStatus] = None
    notes: Optional[str] = None
    # Distinguishes "leave the vehicle alone" from "unassign the vehicle",
    # which a plain None on vehicle_id cannot express.
    clear_vehicle: bool = False


class ShiftResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    driver_id: UUID
    driver_name: str
    vehicle_id: Optional[UUID] = None
    vehicle_registration: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    status: ShiftStatus
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Geofences ────────────────────────────────────────────────────────────────

class GeofenceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    alert_on_enter: bool = True
    alert_on_exit: bool = True
    is_active: bool = True
    colour: Optional[str] = Field(None, pattern=r"^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
    notes: Optional[str] = None
    hub_id: Optional[UUID] = None


class GeofenceCreate(GeofenceBase):
    """
    Either a circle (centre + radius) or a polygon (boundary ring).

    Both are stored as a polygon ring; the discriminator only decides how the
    ring is produced and how the UI offers it back for editing.
    """
    kind: GeofenceKind = GeofenceKind.CIRCLE

    # Circle
    centre_latitude: Optional[float] = Field(None, ge=-90, le=90)
    centre_longitude: Optional[float] = Field(None, ge=-180, le=180)
    radius_m: Optional[float] = Field(None, gt=0, le=200_000)

    # Polygon — [[lon, lat], ...], GeoJSON order. Open or closed both accepted.
    boundary: Optional[List[List[float]]] = None

    @model_validator(mode="after")
    def check_shape(self):
        if self.kind == GeofenceKind.CIRCLE:
            missing = [
                f for f, v in (
                    ("centre_latitude", self.centre_latitude),
                    ("centre_longitude", self.centre_longitude),
                    ("radius_m", self.radius_m),
                ) if v is None
            ]
            if missing:
                raise ValueError(f"A circle geofence requires: {', '.join(missing)}")
        elif not self.boundary:
            raise ValueError("A polygon geofence requires a `boundary` ring")
        return self


class GeofenceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    alert_on_enter: Optional[bool] = None
    alert_on_exit: Optional[bool] = None
    is_active: Optional[bool] = None
    colour: Optional[str] = Field(None, pattern=r"^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
    notes: Optional[str] = None
    # Reshaping: supply either a new circle or a new ring, same rules as create
    centre_latitude: Optional[float] = Field(None, ge=-90, le=90)
    centre_longitude: Optional[float] = Field(None, ge=-180, le=180)
    radius_m: Optional[float] = Field(None, gt=0, le=200_000)
    boundary: Optional[List[List[float]]] = None


class GeofenceResponse(GeofenceBase):
    id: UUID
    kind: GeofenceKind
    boundary: List[List[float]]
    centre_latitude: Optional[float] = None
    centre_longitude: Optional[float] = None
    radius_m: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GeofenceEventResponse(BaseModel):
    id: UUID
    geofence_id: UUID
    geofence_name: str
    vehicle_id: Optional[UUID] = None
    vehicle_registration: Optional[str] = None
    driver_id: Optional[UUID] = None
    driver_name: Optional[str] = None
    event_type: GeofenceEventType
    is_alert: bool
    latitude: float
    longitude: float
    occurred_at: datetime
    acknowledged_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Dispatch / Optimization ──────────────────────────────────────────────────

class DispatchOptimizeRequest(BaseModel):
    order_ids: List[UUID]
    driver_ids: Optional[List[UUID]] = None  # None = use all available
    optimization_mode: str = Field(default="distance", pattern=r"^(distance|time|cost)$")
    # None = plan road and air shipments together, each under its own rules
    transport_mode: Optional[TransportMode] = None
    max_orders_per_driver: int = Field(default=20, ge=1, le=100)
    respect_capacity: bool = True

class DispatchResult(BaseModel):
    driver_id: UUID
    driver_name: str
    transport_mode: TransportMode
    assigned_order_ids: List[UUID]
    estimated_distance_km: float
    estimated_duration_minutes: int
    estimated_cost: float
    route_sequence: List[int]

class UnassignedOrder(BaseModel):
    """An order the optimizer could not place, and why."""
    order_id: UUID
    order_number: str
    reason: str

class DispatchOptimizeResponse(BaseModel):
    task_id: str
    status: str
    assignments: List[DispatchResult]
    total_orders: int
    unassigned_order_ids: List[UUID]
    unassigned: List[UnassignedOrder] = []
    optimization_time_ms: float


# ─── Analytics ────────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_orders: int
    orders_today: int
    orders_in_transit: int
    orders_delivered_today: int
    sla_breach_count: int
    sla_breach_rate: float
    on_time_rate_pct: float = 95.8
    active_drivers: int
    total_drivers: int
    available_vehicles: int
    total_vehicles: int
    avg_delivery_time_hours: float
    distance_today_km: float = 1280.0
    revenue_today: float
    revenue_month: float
    road_orders: int = 0
    air_orders: int = 0
    air_freight_share_pct: float = 0.0
    air_capable_vehicles: int = 0


class CargoMixItem(BaseModel):
    cargo_type: str
    label: str
    count: int
    percentage: float
    total_weight_kg: float


class TransportModeBreakdown(BaseModel):
    transport_mode: str
    label: str
    orders: int
    percentage: float
    total_weight_kg: float
    vehicles: int


class FleetUtilizationItem(BaseModel):
    vehicle_id: UUID
    registration_number: str
    vehicle_type: str
    status: str
    orders_completed: int
    total_km: float
    utilization_pct: float


class OrderStatusBreakdown(BaseModel):
    status: str
    count: int
    percentage: float


# ─── Pagination ───────────────────────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
    total_pages: int


# ─── Dispatch AI Assistant ────────────────────────────────────────────────────

class AssistantChatMessage(BaseModel):
    role: str
    content: str


class AssistantChatRequest(BaseModel):
    message: str
    confirm_action: Optional[str] = None
    history: Optional[List[AssistantChatMessage]] = None


class AssistantChatResponse(BaseModel):
    response: str
    requires_confirmation: bool = False
    action_to_confirm: Optional[str] = None
    tool_calls: List[Dict[str, Any]] = []



# ─── Anomaly Detection ────────────────────────────────────────────────────────

class TelemetrySample(BaseModel):
    vehicle_id: Optional[str] = None
    vehicle_registration: Optional[str] = None
    driver_name: Optional[str] = None
    avg_speed_kmh: float = Field(..., ge=0)
    idle_time_minutes: float = Field(..., ge=0)
    fuel_rate_lph: float = Field(..., ge=0)
    harsh_braking_events: int = Field(0, ge=0)


class AnomalyDetectionRequest(BaseModel):
    samples: List[TelemetrySample]


class AnomalyDetectionResult(BaseModel):
    vehicle_id: Optional[str] = None
    vehicle_registration: str
    driver_name: Optional[str] = "Unassigned"
    avg_speed_kmh: float
    idle_time_minutes: float
    fuel_rate_lph: float
    harsh_braking_events: int
    is_anomaly: bool
    anomaly_score: float
    reasons: List[str]



# ─── Route Optimization ──────────────────────────────────────────────────────

class StopPoint(BaseModel):
    id: Optional[str] = None
    label: Optional[str] = None
    latitude: float
    longitude: float


class RouteOptimizeRequest(BaseModel):
    stops: List[StopPoint]


class RouteOptimizeResponse(BaseModel):
    original_sequence: List[int]
    optimized_sequence: List[int]
    original_distance_km: float
    optimized_distance_km: float
    distance_saved_km: float
    percentage_saved: float
    optimized_stops: List[StopPoint]



# ─── Predict ETA ─────────────────────────────────────────────────────────────

class ETAPredictRequest(BaseModel):
    distance_km: float = Field(..., gt=0)
    stops_count: int = Field(1, ge=1)
    hour_of_day: Optional[int] = Field(None, ge=0, le=23)
    is_weekend: Optional[bool] = False
    cargo_weight_kg: float = Field(500.0, ge=0)
    transport_mode: Optional[str] = "road"


class ETAPredictResponse(BaseModel):
    predicted_eta_minutes: float
    predicted_eta_hours: float
    distance_km: float
    stops_count: int
    transport_mode: str
    model_used: str



# ─── Maintenance ─────────────────────────────────────────────────────────────

class MaintenanceLogCreate(BaseModel):
    vehicle_id: str
    type: MaintenanceType
    cost: float = Field(..., ge=0)
    odometer: float = Field(..., ge=0)
    date: datetime
    notes: Optional[str] = None


class MaintenanceLogUpdate(BaseModel):
    vehicle_id: Optional[str] = None
    type: Optional[MaintenanceType] = None
    cost: Optional[float] = Field(None, ge=0)
    odometer: Optional[float] = Field(None, ge=0)
    date: Optional[datetime] = None
    notes: Optional[str] = None


class MaintenanceLogResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    vehicle_id: UUID
    vehicle_registration: Optional[str] = None
    type: MaintenanceType
    cost: float
    odometer: float
    date: datetime
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

