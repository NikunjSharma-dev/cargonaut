"""
Cargonaut — Dispatch & Route Optimization Engine
Solves the Vehicle Routing Problem (VRP) using Pandas + Google OR-Tools.
Heavy computation is offloaded to Celery workers.

Road and air shipments are planned in separate buckets: an order may only go to
a driver whose assigned asset flies (or drives) the same mode and satisfies the
cargo's handling requirements.
"""

import math
import os
import time
from typing import Callable, Dict, List, Optional, Set
from uuid import UUID

import httpx
import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import TokenPayload, get_current_user
from app.models.models import Driver, Order, OrderStatus, TransportMode, mode_for_vehicle_type
from app.schemas.schemas import (
    AssistantChatRequest,
    AssistantChatResponse,
    DispatchOptimizeRequest,
    DispatchOptimizeResponse,
    DispatchResult,
    RouteOptimizeRequest,
    RouteOptimizeResponse,
    UnassignedOrder,
)
from app.services.cargo_rules import check_compatibility, estimate_cost, estimate_duration_minutes
from app.services.dispatch_assistant import process_dispatch_query

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
    eligible: Optional[Callable[[str, str], bool]] = None,
) -> Dict:
    """
    Greedy nearest-neighbour VRP approximation using Pandas.
    For production, replace with OR-Tools CVRP solver.

    `eligible(order_id, driver_id)` gates each pairing so cargo only lands on an
    asset that can legally carry it. Orders with no eligible driver come back in
    `unassigned` rather than being forced onto the wrong vehicle.
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
            if eligible is not None and not eligible(order_id, did):
                continue
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
    if request.transport_mode:
        orders_q = orders_q.where(Order.transport_mode == request.transport_mode)
    orders_result = await db.execute(orders_q)
    orders = orders_result.scalars().all()

    if not orders:
        raise HTTPException(status_code=404, detail="No eligible orders found")

    # 2. Fetch drivers with the asset they are signed on to — the vehicle is what
    #    decides which mode and which cargo the driver can actually take.
    drivers_q = select(Driver).options(selectinload(Driver.vehicle)).where(
        and_(
            Driver.tenant_id == current_user.tenant_id,
            Driver.is_active.is_(True),
        )
    )
    if request.driver_ids:
        drivers_q = drivers_q.where(Driver.id.in_([str(did) for did in request.driver_ids]))

    drivers_result = await db.execute(drivers_q)
    drivers = drivers_result.scalars().all()

    if not drivers:
        raise HTTPException(status_code=404, detail="No available drivers found")

    # 3. Work out each driver's mode from their vehicle; unassigned drivers are
    #    treated as road crew, which is what a dispatcher would assume.
    driver_mode: Dict[str, TransportMode] = {}
    for d in drivers:
        driver_mode[str(d.id)] = (
            mode_for_vehicle_type(d.vehicle.vehicle_type) if d.vehicle else TransportMode.ROAD
        )

    # 4. Pre-pass: which drivers may carry which order, and why not
    eligible_pairs: Dict[str, Set[str]] = {}
    rejections: Dict[str, str] = {}
    for o in orders:
        oid = str(o.id)
        order_mode = TransportMode(o.transport_mode)
        allowed: Set[str] = set()
        reason = f"No {order_mode.value} asset available for this cargo"
        for d in drivers:
            did = str(d.id)
            if driver_mode[did] is not order_mode:
                continue
            ok, why = check_compatibility(o.cargo_type, order_mode, d.vehicle)
            if ok:
                allowed.add(did)
            elif why:
                reason = why
        eligible_pairs[oid] = allowed
        if not allowed:
            rejections[oid] = reason

    # 5. Plan each mode separately, then merge
    assignments: Dict[str, List[str]] = {str(d.id): [] for d in drivers}

    drivers_data = [
        {
            "id": str(d.id),
            "name": d.full_name,
            "is_available": d.is_available,
            "lat": d.current_latitude or 0.0,
            "lon": d.current_longitude or 0.0,
            "mode": driver_mode[str(d.id)].value,
        }
        for d in drivers
    ]
    drivers_df = pd.DataFrame(drivers_data)

    for mode in (TransportMode.ROAD, TransportMode.AIR):
        mode_orders = [
            o for o in orders
            if TransportMode(o.transport_mode) is mode and str(o.id) not in rejections
        ]
        if not mode_orders:
            continue

        mode_drivers_df = drivers_df[drivers_df["mode"] == mode.value]
        if mode_drivers_df.empty:
            for o in mode_orders:
                rejections[str(o.id)] = f"No {mode.value} driver on shift"
            continue

        orders_df = pd.DataFrame([
            {
                "id": str(o.id),
                "lat": o.delivery_latitude or 0.0,
                "lon": o.delivery_longitude or 0.0,
                "weight_kg": o.weight_kg or 0.0,
                "priority": o.priority,
                "city": o.delivery_city,
            }
            for o in mode_orders
        ])

        result = greedy_vrp(
            orders_df,
            mode_drivers_df,
            max_per_driver=request.max_orders_per_driver,
            eligible=lambda oid, did: did in eligible_pairs.get(oid, set()),
        )
        for did, oids in result["assignments"].items():
            assignments[did].extend(oids)
        for oid in result["unassigned"]:
            rejections.setdefault(oid, "All eligible drivers are at their order limit")

    # 6. Build response
    driver_map = {str(d.id): d for d in drivers}
    order_map = {str(o.id): o for o in orders}
    dispatch_results = []

    for driver_id, assigned_order_ids in assignments.items():
        if not assigned_order_ids:
            continue

        driver = driver_map.get(driver_id)
        if not driver:
            continue

        mode = driver_mode[driver_id]

        # Estimate distance (sum of haversine distances in sequence)
        assigned_orders = [order_map[oid] for oid in assigned_order_ids if oid in order_map]
        total_km = 0.0
        prev_lat = driver.current_latitude or 0.0
        prev_lon = driver.current_longitude or 0.0

        for ao in assigned_orders:
            lat = ao.delivery_latitude or 0.0
            lon = ao.delivery_longitude or 0.0
            total_km += haversine_km(prev_lat, prev_lon, lat, lon)
            prev_lat, prev_lon = lat, lon

        # Air legs cruise ~20x faster than a truck but carry hours of terminal
        # handling, so both come from the mode profile rather than a constant.
        estimated_minutes = estimate_duration_minutes(total_km, mode)
        leg_cost = sum(
            estimate_cost(total_km / len(assigned_orders), mode, ao.cargo_type)
            for ao in assigned_orders
        ) if assigned_orders else 0.0

        dispatch_results.append(DispatchResult(
            driver_id=UUID(driver_id),
            driver_name=driver.full_name,
            transport_mode=mode,
            assigned_order_ids=[UUID(oid) for oid in assigned_order_ids],
            estimated_distance_km=round(total_km, 2),
            estimated_duration_minutes=estimated_minutes,
            estimated_cost=round(leg_cost, 2),
            route_sequence=list(range(len(assigned_order_ids))),
        ))

    elapsed_ms = (time.time() - start_time) * 1000

    import uuid as uuid_module
    return DispatchOptimizeResponse(
        task_id=str(uuid_module.uuid4()),
        status="completed",
        assignments=dispatch_results,
        total_orders=len(orders),
        unassigned_order_ids=[UUID(oid) for oid in rejections],
        unassigned=[
            UnassignedOrder(
                order_id=UUID(oid),
                order_number=order_map[oid].order_number if oid in order_map else "—",
                reason=reason,
            )
            for oid, reason in rejections.items()
        ],
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
        select(Driver).options(selectinload(Driver.vehicle)).where(
            and_(Driver.id == driver_id, Driver.tenant_id == current_user.tenant_id)
        )
    )
    driver = driver_result.scalar_one_or_none()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    # A manual override still may not put cargo on an asset that cannot carry it
    ok, reason = check_compatibility(order.cargo_type, order.transport_mode, driver.vehicle)
    if not ok:
        raise HTTPException(status_code=422, detail=reason)

    order.driver_id = driver_id
    if driver.vehicle:
        order.vehicle_id = driver.vehicle.id
    order.status = OrderStatus.DISPATCHED
    await db.commit()
    return {"message": f"Order {order.order_number} assigned to {driver.full_name}"}


@router.post("/optimize/route", response_model=RouteOptimizeResponse)
@router.post("/route/optimize", response_model=RouteOptimizeResponse)
async def optimize_multi_stop_route(
    payload: RouteOptimizeRequest,
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Multi-stop route optimization using 2-opt local search.
    Returns optimized sequence vs original, total distances, and saved km.
    """
    raw_stops = [s.model_dump() for s in payload.stops]
    n = len(raw_stops)

    if n <= 2:
        dist = 0.0
        if n == 2:
            dist = haversine_km(
                raw_stops[0]["latitude"], raw_stops[0]["longitude"],
                raw_stops[1]["latitude"], raw_stops[1]["longitude"]
            )
        return RouteOptimizeResponse(
            original_sequence=list(range(n)),
            optimized_sequence=list(range(n)),
            original_distance_km=round(dist, 2),
            optimized_distance_km=round(dist, 2),
            distance_saved_km=0.0,
            percentage_saved=0.0,
            optimized_stops=payload.stops,
        )

    def route_distance(perm):
        d = 0.0
        for i in range(len(perm) - 1):
            s1, s2 = raw_stops[perm[i]], raw_stops[perm[i + 1]]
            d += haversine_km(s1["latitude"], s1["longitude"], s2["latitude"], s2["longitude"])
        return d

    original_seq = list(range(n))
    original_dist = route_distance(original_seq)

    best_seq = list(range(n))
    best_dist = original_dist
    improved = True

    while improved:
        improved = False
        for i in range(1, n - 1):
            for j in range(i + 1, n):
                new_seq = best_seq[:i] + best_seq[i:j + 1][::-1] + best_seq[j + 1:]
                new_dist = route_distance(new_seq)
                if new_dist < best_dist - 1e-4:
                    best_dist = new_dist
                    best_seq = new_seq
                    improved = True
                    break
            if improved:
                break

    saved_km = max(0.0, original_dist - best_dist)
    pct_saved = (saved_km / original_dist * 100.0) if original_dist > 0 else 0.0
    opt_stops = [payload.stops[idx] for idx in best_seq]

    return RouteOptimizeResponse(
        original_sequence=original_seq,
        optimized_sequence=best_seq,
        original_distance_km=round(original_dist, 2),
        optimized_distance_km=round(best_dist, 2),
        distance_saved_km=round(saved_km, 2),
        percentage_saved=round(pct_saved, 1),
        optimized_stops=opt_stops,
    )


@router.post("/assistant/chat", response_model=AssistantChatResponse)
@router.post("/assistant", response_model=AssistantChatResponse)
async def dispatch_assistant_chat(
    payload: AssistantChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Dispatch AI Assistant chat endpoint.
    Executes typed tool calls with explicit confirmation safety gates for destructive actions.
    """
    res = await process_dispatch_query(
        db=db,
        tenant_id=current_user.tenant_id,
        user_message=payload.message,
        confirm_action=payload.confirm_action,
    )
    return AssistantChatResponse(**res)


@router.get("/route-geometry")
async def get_route_geometry(
    waypoints: str,
    profile: str = "driving",
    overview: str = "full",
):
    """
    Proxy endpoint for road routing geometry.
    Tries Mapbox Directions API, falling back to OSRM (Open Source Routing Machine)
    to return GeoJSON LineString coordinates snapped to real roads.
    """
    token = os.getenv("MAPBOX_TOKEN") or os.getenv("VITE_MAPBOX_TOKEN", "")
    if token:
        url = f"https://api.mapbox.com/directions/v5/mapbox/{profile}/{waypoints}"
        params = {
            "geometries": "geojson",
            "overview": overview,
            "access_token": token,
        }
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, params=params, timeout=4.0)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("routes") and len(data["routes"]) > 0:
                        return data["routes"][0]["geometry"]
        except Exception:
            pass

    # Fallback to free public OSRM road routing API
    osrm_prof = "driving" if profile in ["driving", "driving-traffic"] else profile
    osrm_url = f"https://router.project-osrm.org/route/v1/{osrm_prof}/{waypoints}?overview=full&geometries=geojson"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(osrm_url, timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("routes") and len(data["routes"]) > 0:
                    return data["routes"][0]["geometry"]
    except Exception:
        pass

    return {"type": "LineString", "coordinates": []}



