"""
Cargonaut — Pydantic Schemas (Request / Response)
"""

from datetime import datetime
from typing import Optional, List, Any, Dict
from uuid import UUID
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field

from app.models.models import (
    UserRole, VehicleStatus, VehicleType, FuelType,
    OrderStatus, HubType
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

class HubUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None
    geofence_radius_meters: Optional[int] = None
    capacity: Optional[int] = None

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
    fuel_efficiency_km_per_l: Optional[float] = None
    notes: Optional[str] = None

class VehicleUpdate(BaseModel):
    status: Optional[VehicleStatus] = None
    odometer_km: Optional[float] = None
    last_maintenance: Optional[datetime] = None
    next_maintenance: Optional[datetime] = None
    notes: Optional[str] = None

class VehicleResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    registration_number: str
    make: Optional[str]
    model: Optional[str]
    year: Optional[int]
    vehicle_type: VehicleType
    fuel_type: FuelType
    payload_capacity_kg: float
    volume_capacity_m3: Optional[float]
    status: VehicleStatus
    odometer_km: float
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
    weight_kg: Optional[float] = None
    volume_m3: Optional[float] = None
    fragile: bool = False
    requires_refrigeration: bool = False
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
    weight_kg: Optional[float]
    fragile: bool
    requires_refrigeration: bool
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


# ─── Dispatch / Optimization ──────────────────────────────────────────────────

class DispatchOptimizeRequest(BaseModel):
    order_ids: List[UUID]
    driver_ids: Optional[List[UUID]] = None  # None = use all available
    optimization_mode: str = Field(default="distance", pattern=r"^(distance|time|cost)$")
    max_orders_per_driver: int = Field(default=20, ge=1, le=100)
    respect_capacity: bool = True

class DispatchResult(BaseModel):
    driver_id: UUID
    driver_name: str
    assigned_order_ids: List[UUID]
    estimated_distance_km: float
    estimated_duration_minutes: int
    route_sequence: List[int]

class DispatchOptimizeResponse(BaseModel):
    task_id: str
    status: str
    assignments: List[DispatchResult]
    total_orders: int
    unassigned_order_ids: List[UUID]
    optimization_time_ms: float


# ─── Analytics ────────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_orders: int
    orders_today: int
    orders_in_transit: int
    orders_delivered_today: int
    sla_breach_count: int
    sla_breach_rate: float
    active_drivers: int
    total_drivers: int
    available_vehicles: int
    total_vehicles: int
    avg_delivery_time_hours: float
    revenue_today: float
    revenue_month: float


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