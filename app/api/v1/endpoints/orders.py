"""
Cargonaut — Orders Endpoints (Full Lifecycle State Machine)
"""

import uuid
import random
import string
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.core.database import get_db
from app.core.security import get_current_user, TokenPayload
from app.models.models import Order, OrderStatus
from app.schemas.schemas import OrderCreate, OrderUpdate, OrderResponse

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


@router.get("/", response_model=dict)
async def list_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[OrderStatus] = None,
    driver_id: Optional[str] = None,
    search: Optional[str] = None,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Order).where(Order.tenant_id == current_user.tenant_id)

    if status:
        query = query.where(Order.status == status)
    if driver_id:
        query = query.where(Order.driver_id == driver_id)
    if search:
        query = query.where(
            Order.order_number.ilike(f"%{search}%") |
            Order.customer_name.ilike(f"%{search}%") |
            Order.delivery_city.ilike(f"%{search}%")
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
    order = Order(
        tenant_id=current_user.tenant_id,
        order_number=generate_order_number(),
        status=OrderStatus.DRAFT,
        status_history=[{
            "status": "draft",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": current_user.user_id,
        }],
        **data.model_dump(exclude_none=True),
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
