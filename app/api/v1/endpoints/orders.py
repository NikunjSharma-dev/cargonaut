"""
Cargonaut — Orders Endpoints (Full Lifecycle State Machine)
"""

import random
import string
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenPayload, get_current_user
from app.models.models import CargoType, Order, OrderStatus, TransportMode
from app.schemas.schemas import OrderCreate, OrderResponse, OrderUpdate
from app.services.cargo_rules import check_compatibility

router = APIRouter()

# Valid state transitions
ORDER_TRANSITIONS = {
    OrderStatus.DRAFT:       [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    OrderStatus.CONFIRMED:   [OrderStatus.DISPATCHED, OrderStatus.CANCELLED],
    OrderStatus.DISPATCHED:  [OrderStatus.IN_TRANSIT, OrderStatus.CANCELLED],
    OrderStatus.IN_TRANSIT:  [OrderStatus.ARRIVED, OrderStatus.FAILED],
    OrderStatus.ARRIVED:     [OrderStatus.DELIVERED, OrderStatus.IN_TRANSIT],
    OrderStatus.DELIVERED:   [],
    OrderStatus.FAILED:      [OrderStatus.CONFIRMED],
    OrderStatus.CANCELLED:   [],
}


def generate_order_number() -> str:
    prefix = "FF"
    ts = datetime.now().strftime("%y%m%d")
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"{prefix}-{ts}-{suffix}"


def generate_air_waybill() -> str:
    """
    House air waybill in the IATA shape: a 3-digit airline prefix, then an
    8-digit serial. Cargonaut's own prefix is 731.
    """
    serial = "".join(random.choices(string.digits, k=8))
    return f"731-{serial}"


@router.get("/", response_model=dict)
async def list_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[OrderStatus] = None,
    driver_id: Optional[str] = None,
    cargo_type: Optional[CargoType] = None,
    transport_mode: Optional[TransportMode] = None,
    search: Optional[str] = None,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Order).where(Order.tenant_id == current_user.tenant_id)

    if status:
        query = query.where(Order.status == status)
    if driver_id:
        query = query.where(Order.driver_id == driver_id)
    if cargo_type:
        query = query.where(Order.cargo_type == cargo_type)
    if transport_mode:
        query = query.where(Order.transport_mode == transport_mode)
    if search:
        query = query.where(
            Order.order_number.ilike(f"%{search}%") |
            Order.customer_name.ilike(f"%{search}%") |
            Order.delivery_city.ilike(f"%{search}%") |
            Order.air_waybill_number.ilike(f"%{search}%")
        )

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    query = query.order_by(Order.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    orders = result.scalars().all()

    return {
        "items": [OrderResponse.model_validate(o).model_dump() for o in orders],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.post("/", response_model=OrderResponse, status_code=201)
async def create_order(
    data: OrderCreate,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ok, reason = check_compatibility(data.cargo_type, data.transport_mode)
    if not ok:
        raise HTTPException(status_code=422, detail=reason)

    payload = data.model_dump(exclude_none=True)

    if data.cargo_type is CargoType.HAZMAT and data.transport_mode is TransportMode.AIR:
        if not data.hazmat_un_code:
            raise HTTPException(
                status_code=422,
                detail="Hazardous air cargo requires a UN code on the shipper's declaration",
            )

    if data.transport_mode is TransportMode.AIR and not data.air_waybill_number:
        payload["air_waybill_number"] = generate_air_waybill()

    # Keep the handling flags honest with what was actually booked
    if data.cargo_type is CargoType.REFRIGERATED:
        payload["requires_refrigeration"] = True
    if data.cargo_type is CargoType.FRAGILE:
        payload["fragile"] = True

    order = Order(
        tenant_id=current_user.tenant_id,
        order_number=generate_order_number(),
        status=OrderStatus.DRAFT,
        status_history=[{
            "status": "draft",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": current_user.user_id,
        }],
        **payload,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: str,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order).where(
            and_(Order.id == order_id, Order.tenant_id == current_user.tenant_id)
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.patch("/{order_id}", response_model=OrderResponse)
async def update_order(
    order_id: str,
    data: OrderUpdate,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order).where(
            and_(Order.id == order_id, Order.tenant_id == current_user.tenant_id)
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    update_data = data.model_dump(exclude_none=True)

    # Re-check cargo against mode whenever either side of the pair moves
    if "cargo_type" in update_data or "transport_mode" in update_data:
        new_cargo = update_data.get("cargo_type", order.cargo_type)
        new_mode = update_data.get("transport_mode", order.transport_mode)
        ok, reason = check_compatibility(new_cargo, new_mode)
        if not ok:
            raise HTTPException(status_code=422, detail=reason)
        # Switching a shipment to air gives it an air waybill
        if (
            TransportMode(new_mode) is TransportMode.AIR
            and not order.air_waybill_number
            and not update_data.get("air_waybill_number")
        ):
            update_data["air_waybill_number"] = generate_air_waybill()

    # Validate state transition
    if "status" in update_data:
        new_status = OrderStatus(update_data["status"]) if isinstance(update_data["status"], str) else update_data["status"]
        current_status = OrderStatus(order.status) if isinstance(order.status, str) else order.status
        allowed = ORDER_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid transition: {order.status} → {new_status}. Allowed: {[s.value for s in allowed]}",
            )
        update_data["status"] = new_status


        history = list(order.status_history or [])
        history.append({
            "status": new_status.value if hasattr(new_status, 'value') else new_status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": current_user.user_id,
        })
        order.status_history = history

        # Auto-set timestamps
        if new_status == OrderStatus.IN_TRANSIT and not order.actual_pickup:
            order.actual_pickup = datetime.now(timezone.utc)
        if new_status == OrderStatus.DELIVERED and not order.actual_delivery:
            order.actual_delivery = datetime.now(timezone.utc)

    for key, value in update_data.items():
        setattr(order, key, value)

    await db.commit()
    await db.refresh(order)
    return order


@router.delete("/{order_id}", status_code=204)
async def cancel_order(
    order_id: str,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Order).where(
            and_(Order.id == order_id, Order.tenant_id == current_user.tenant_id)
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status not in [OrderStatus.DRAFT, OrderStatus.CONFIRMED]:
        raise HTTPException(status_code=400, detail="Can only cancel DRAFT or CONFIRMED orders")

    order.status = OrderStatus.CANCELLED
    await db.commit()
