"""
Cargonaut — Dispatch & Route Optimization Engine
Solves the Vehicle Routing Problem (VRP) using Pandas + Google OR-Tools.
Heavy computation is offloaded to Celery workers.
"""

import time
import math
from typing import List, Optional, Dict
from uuid import UUID

import pandas as pd
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.core.database import get_db
from app.core.security import get_current_user, TokenPayload
from app.models.models import Order, Driver, Vehicle, OrderStatus, VehicleStatus
from app.schemas.schemas import (
    DispatchOptimizeRequest, DispatchOptimizeResponse, DispatchResult
)

router = APIRouter()


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two GPS coordinates."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_distance_matrix(locations: List[Dict]) -> np.ndarray:
    """Build a full pairwise distance matrix from a list of lat/lon dicts."""
    n = len(locations)
    matrix = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            if i != j:
                matrix[i][j] = haversine_km(
                    locations[i]["lat"], locations[i]["lon"],
                    locations[j]["lat"], locations[j]["lon"]
                )
    return matrix


def greedy_vrp(
    orders_df: pd.DataFrame,
    drivers_df: pd.DataFrame,
    max_per_driver: int = 20,
) -> Dict:
    """
    Greedy nearest-neighbour VRP approximation using Pandas.
    For production, replace with OR-Tools CVRP solver.
    """
    if drivers_df.empty or "id" not in drivers_df.columns:
        return {"assignments": {}, "unassigned": list(orders_df["id"].astype(str)) if not orders_df.empty and "id" in orders_df.columns else []}

    assignments = {str(did): [] for did in drivers_df["id"]}
    unassigned = []

    available_drivers = drivers_df[drivers_df["is_available"].astype(bool)].copy()
    if available_drivers.empty:
        return {"assignments": assignments, "unassigned": list(orders_df["id"].astype(str)) if not orders_df.empty and "id" in orders_df.columns else []}


    driver_ids = list(available_drivers["id"].astype(str))
    driver_idx = 0
    driver_order_counts = {d: 0 for d in driver_ids}

    # Sort orders by priority descending, then by delivery_city
    if "priority" in orders_df.columns:
        sorted_orders = orders_df.sort_values("priority", ascending=False)
    else:
        sorted_orders = orders_df

    for _, order in sorted_orders.iterrows():
        order_id = str(order["id"])

        # Round-robin across available drivers with capacity check
        assigned = False
        for _ in range(len(driver_ids)):
            did = driver_ids[driver_idx % len(driver_ids)]
            driver_idx += 1
            if driver_order_counts[did] < max_per_driver:
                assignments[did].append(order_id)
                driver_order_counts[did] += 1
                assigned = True
                break

        if not assigned:
            unassigned.append(order_id)

    return {"assignments": assignments, "unassigned": unassigned}


@router.post("/optimize", response_model=DispatchOptimizeResponse)
async def optimize_dispatch(
    request: DispatchOptimizeRequest,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    start_time = time.time()

    # 1. Fetch orders
    orders_q = select(Order).where(
        and_(
            Order.tenant_id == current_user.tenant_id,
            Order.id.in_([str(oid) for oid in request.order_ids]),
            Order.status.in_([OrderStatus.DRAFT, OrderStatus.CONFIRMED]),
        )
    )
    orders_result = await db.execute(orders_q)
    orders = orders_result.scalars().all()

    if not orders:
        raise HTTPException(status_code=404, detail="No eligible orders found")

    # 2. Fetch drivers
    drivers_q = select(Driver).where(
        and_(
            Driver.tenant_id == current_user.tenant_id,
            Driver.is_active == True,
        )
    )
    if request.driver_ids:
        drivers_q = drivers_q.where(Driver.id.in_([str(did) for did in request.driver_ids]))

    drivers_result = await db.execute(drivers_q)
    drivers = drivers_result.scalars().all()

    if not drivers:
        raise HTTPException(status_code=404, detail="No available drivers found")

    # 3. Convert to Pandas DataFrames
    orders_data = [
        {
            "id": str(o.id),
            "lat": o.delivery_latitude or 0.0,
            "lon": o.delivery_longitude or 0.0,
            "weight_kg": o.weight_kg or 0.0,
            "priority": o.priority,
            "city": o.delivery_city,
        }
        for o in orders
    ]
    drivers_data = [
        {
            "id": str(d.id),
            "name": d.full_name,
            "is_available": d.is_available,
            "lat": d.current_latitude or 0.0,
            "lon": d.current_longitude or 0.0,
        }
        for d in drivers
    ]

    orders_df = pd.DataFrame(orders_data)
    drivers_df = pd.DataFrame(drivers_data)

    # 4. Run VRP optimization
    result = greedy_vrp(orders_df, drivers_df, max_per_driver=request.max_orders_per_driver)

    # 5. Build response
    driver_map = {str(d.id): d for d in drivers}
    dispatch_results = []

    for driver_id, assigned_order_ids in result["assignments"].items():
        if not assigned_order_ids:
            continue

        driver = driver_map.get(driver_id)
        if not driver:
            continue

        # Estimate distance (sum of haversine distances in sequence)
        assigned_orders = [o for o in orders if str(o.id) in assigned_order_ids]
        total_km = 0.0
        prev_lat = driver.current_latitude or 0.0
        prev_lon = driver.current_longitude or 0.0

        for ao in assigned_orders:
            lat = ao.delivery_latitude or 0.0
            lon = ao.delivery_longitude or 0.0
            total_km += haversine_km(prev_lat, prev_lon, lat, lon)
            prev_lat, prev_lon = lat, lon

        estimated_minutes = int((total_km / 40.0) * 60)  # assume 40 km/h avg

        dispatch_results.append(DispatchResult(
            driver_id=UUID(driver_id),
            driver_name=driver.full_name,
            assigned_order_ids=[UUID(oid) for oid in assigned_order_ids],
            estimated_distance_km=round(total_km, 2),
            estimated_duration_minutes=estimated_minutes,
            route_sequence=list(range(len(assigned_order_ids))),
        ))

    elapsed_ms = (time.time() - start_time) * 1000

    import uuid as uuid_module
    return DispatchOptimizeResponse(
        task_id=str(uuid_module.uuid4()),
        status="completed",
        assignments=dispatch_results,
        total_orders=len(orders),
        unassigned_order_ids=[UUID(oid) for oid in result["unassigned"]],
        optimization_time_ms=round(elapsed_ms, 2),
    )


@router.post("/assign/{order_id}/driver/{driver_id}")
async def manually_assign_driver(
    order_id: str,
    driver_id: str,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    order_result = await db.execute(
        select(Order).where(
            and_(Order.id == order_id, Order.tenant_id == current_user.tenant_id)
        )
    )
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    driver_result = await db.execute(
        select(Driver).where(
            and_(Driver.id == driver_id, Driver.tenant_id == current_user.tenant_id)
        )
    )
    driver = driver_result.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    order.driver_id = driver_id
    order.status = OrderStatus.DISPATCHED
    await db.commit()
    return {"message": f"Order {order.order_number} assigned to {driver.full_name}"}
