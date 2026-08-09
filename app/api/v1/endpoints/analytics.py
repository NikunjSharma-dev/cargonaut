"""
Cargonaut — Analytics Endpoints
Aggregated KPIs for the dashboard. In production these feed Power BI Embedded.
"""

from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import Date, and_, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenPayload, get_current_user
from app.models.models import Driver, Order, OrderStatus, Vehicle, VehicleStatus
from app.schemas.schemas import DashboardStats, OrderStatusBreakdown

router = APIRouter()


@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tid = current_user.tenant_id
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Orders
    total_orders_r = await db.execute(
        select(func.count()).where(Order.tenant_id == tid)
    )
    total_orders = total_orders_r.scalar() or 0

    orders_today_r = await db.execute(
        select(func.count()).where(
            and_(Order.tenant_id == tid, Order.created_at >= today_start)
        )
    )
    orders_today = orders_today_r.scalar() or 0

    in_transit_r = await db.execute(
        select(func.count()).where(
            and_(Order.tenant_id == tid, Order.status.in_([
                OrderStatus.DISPATCHED, OrderStatus.IN_TRANSIT, OrderStatus.ARRIVED
            ]))
        )
    )
    orders_in_transit = in_transit_r.scalar() or 0

    delivered_today_r = await db.execute(
        select(func.count()).where(
            and_(
                Order.tenant_id == tid,
                Order.status == OrderStatus.DELIVERED,
                Order.actual_delivery >= today_start,
            )
        )
    )
    orders_delivered_today = delivered_today_r.scalar() or 0

    # SLA breaches (past deadline, not delivered)
    sla_breach_r = await db.execute(
        select(func.count()).where(
            and_(
                Order.tenant_id == tid,
                Order.sla_deadline < now,
                Order.status.notin_([OrderStatus.DELIVERED, OrderStatus.CANCELLED]),
            )
        )
    )
    sla_breach_count = sla_breach_r.scalar() or 0
    sla_breach_rate = round((sla_breach_count / total_orders * 100) if total_orders > 0 else 0, 2)

    # Drivers
    total_drivers_r = await db.execute(
        select(func.count()).where(and_(Driver.tenant_id == tid, Driver.is_active.is_(True)))
    )
    total_drivers = total_drivers_r.scalar() or 0

    active_drivers_r = await db.execute(
        select(func.count()).where(
            and_(Driver.tenant_id == tid, Driver.is_active.is_(True), Driver.is_available.is_(False))
        )
    )
    active_drivers = active_drivers_r.scalar() or 0

    # Vehicles
    total_vehicles_r = await db.execute(
        select(func.count()).where(Vehicle.tenant_id == tid)
    )
    total_vehicles = total_vehicles_r.scalar() or 0

    avail_vehicles_r = await db.execute(
        select(func.count()).where(
            and_(Vehicle.tenant_id == tid, Vehicle.status == VehicleStatus.AVAILABLE)
        )
    )
    available_vehicles = avail_vehicles_r.scalar() or 0

    # Avg delivery time (hours) - for delivered orders this month
    delivered_orders_r = await db.execute(
        select(Order.actual_delivery, Order.actual_pickup).where(
            and_(
                Order.tenant_id == tid,
                Order.status == OrderStatus.DELIVERED,
                Order.actual_delivery >= month_start,
                Order.actual_pickup.isnot(None),
                Order.actual_delivery.isnot(None),
            )
        )
    )
    delivered_rows = delivered_orders_r.fetchall()
    if delivered_rows:
        durations = [
            (row.actual_delivery - row.actual_pickup).total_seconds() / 3600
            for row in delivered_rows
            if row.actual_delivery and row.actual_pickup
        ]
        avg_delivery_time = round(sum(durations) / len(durations), 2) if durations else 0.0
    else:
        avg_delivery_time = 0.0

    # Revenue
    revenue_today_r = await db.execute(
        select(func.sum(Order.delivery_fee)).where(
            and_(
                Order.tenant_id == tid,
                Order.status == OrderStatus.DELIVERED,
                Order.actual_delivery >= today_start,
            )
        )
    )
    revenue_today = float(revenue_today_r.scalar() or 0)

    revenue_month_r = await db.execute(
        select(func.sum(Order.delivery_fee)).where(
            and_(
                Order.tenant_id == tid,
                Order.status == OrderStatus.DELIVERED,
                Order.actual_delivery >= month_start,
            )
        )
    )
    revenue_month = float(revenue_month_r.scalar() or 0)

    return DashboardStats(
        total_orders=total_orders,
        orders_today=orders_today,
        orders_in_transit=orders_in_transit,
        orders_delivered_today=orders_delivered_today,
        sla_breach_count=sla_breach_count,
        sla_breach_rate=sla_breach_rate,
        active_drivers=active_drivers,
        total_drivers=total_drivers,
        available_vehicles=available_vehicles,
        total_vehicles=total_vehicles,
        avg_delivery_time_hours=avg_delivery_time,
        revenue_today=revenue_today,
        revenue_month=revenue_month,
    )


@router.get("/orders/status-breakdown", response_model=List[OrderStatusBreakdown])
async def get_order_status_breakdown(
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order.status, func.count().label("count")).where(
            Order.tenant_id == current_user.tenant_id
        ).group_by(Order.status)
    )
    rows = result.fetchall()

    total = sum(r.count for r in rows)
    return [
        OrderStatusBreakdown(
            status=r.status.value,
            count=r.count,
            percentage=round(r.count / total * 100, 1) if total > 0 else 0,
        )
        for r in rows
    ]


@router.get("/orders/daily-volume")
async def get_daily_order_volume(
    days: int = 30,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Orders created per day for the last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(
            cast(Order.created_at, Date).label("day"),
            func.count().label("total"),
            func.count().filter(Order.status == OrderStatus.DELIVERED).label("delivered"),
        ).where(
            and_(Order.tenant_id == current_user.tenant_id, Order.created_at >= since)
        ).group_by(cast(Order.created_at, Date)).order_by(cast(Order.created_at, Date))
    )
    rows = result.fetchall()
    return [{"day": str(r.day), "total": r.total, "delivered": r.delivered} for r in rows]


@router.get("/fleet/utilization")
async def get_fleet_utilization(
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fleet utilization summary per vehicle."""
    vehicles_r = await db.execute(
        select(Vehicle).where(Vehicle.tenant_id == current_user.tenant_id)
    )
    vehicles = vehicles_r.scalars().all()

    result = []
    for v in vehicles:
        orders_r = await db.execute(
            select(func.count()).where(
                and_(
                    Order.vehicle_id == v.id,
                    Order.status == OrderStatus.DELIVERED,
                )
            )
        )
        orders_completed = orders_r.scalar() or 0
        utilization = min(round((orders_completed / 30) * 100, 1), 100)

        result.append({
            "vehicle_id": str(v.id),
            "registration_number": v.registration_number,
            "vehicle_type": v.vehicle_type.value,
            "status": v.status.value,
            "orders_completed": orders_completed,
            "total_km": v.odometer_km,
            "utilization_pct": utilization,
        })

    return result
