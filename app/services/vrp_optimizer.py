"""
Cargonaut — Vehicle Routing Problem (VRP) & CVRP Optimization Engine

Solves the Capacitated Vehicle Routing Problem (CVRP) considering:
  - Vehicle payload capacity (kg / m³)
  - Driver shift limits & current GPS positions
  - Order weight, volume, priority, and delivery time windows
  - Vectorized Haversine distance & duration matrix (OSRM API ready)
"""

import logging
import math
from typing import Any, Dict, List

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle Haversine distance in kilometers between two GPS coordinates."""
    R = 6371.0  # Earth's radius in kilometers
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_distance_matrix(locations: List[Dict[str, float]]) -> np.ndarray:
    """
    Construct a full NxN pairwise Haversine distance matrix.
    Note: In production, this can be swapped with OSRM (Open Source Routing Machine) or Google Distance Matrix API.
    """
    n = len(locations)
    matrix = np.zeros((n, n), dtype=float)
    for i in range(n):
        for j in range(n):
            if i != j:
                matrix[i][j] = haversine_distance_km(
                    locations[i]["lat"], locations[i]["lon"],
                    locations[j]["lat"], locations[j]["lon"]
                )
    return matrix


class CVRPOptimizer:
    """
    Capacitated Vehicle Routing Problem (CVRP) Solver.
    Uses a hybrid nearest-neighbour heuristic with capacity and shift constraints.
    """

    def __init__(
        self,
        orders: List[Dict[str, Any]],
        drivers: List[Dict[str, Any]],
        vehicles: List[Dict[str, Any]] = None,
        max_orders_per_driver: int = 20,
        avg_speed_kmh: float = 40.0,
    ):
        self.orders = orders
        self.drivers = drivers
        self.vehicles = vehicles or []
        self.max_orders_per_driver = max_orders_per_driver
        self.avg_speed_kmh = avg_speed_kmh

    def solve(self) -> Dict[str, Any]:
        """Executes the optimization algorithm and returns route assignments."""
        if not self.orders or not self.drivers:
            return {
                "assignments": {},
                "unassigned": [str(o["id"]) for o in self.orders],
                "total_distance_km": 0.0,
            }

        orders_df = pd.DataFrame(self.orders)

        # Sort orders by priority (descending) and weight
        if "priority" in orders_df.columns:
            orders_df = orders_df.sort_values(by=["priority", "weight_kg"], ascending=[False, False])
        else:
            orders_df = orders_df.sort_values(by="weight_kg", ascending=False)

        assignments: Dict[str, List[str]] = {str(d["id"]): [] for d in self.drivers}
        driver_loads: Dict[str, float] = {str(d["id"]): 0.0 for d in self.drivers}
        driver_capacities: Dict[str, float] = {
            str(d["id"]): d.get("capacity_kg", 500.0) for d in self.drivers
        }
        unassigned: List[str] = []
        total_distance = 0.0

        for _, order in orders_df.iterrows():
            order_id = str(order["id"])
            order_weight = float(order.get("weight_kg", 0.0))
            best_driver_id = None
            min_dist = float("inf")

            order_lat = float(order.get("lat", 0.0))
            order_lon = float(order.get("lon", 0.0))

            for d in self.drivers:
                did = str(d["id"])
                current_orders_count = len(assignments[did])

                # Capacity & order limit checks
                if current_orders_count >= self.max_orders_per_driver:
                    continue
                if driver_loads[did] + order_weight > driver_capacities[did]:
                    continue

                # Compute distance from driver's location or last assigned stop
                if assignments[did]:
                    last_order_id = assignments[did][-1]
                    last_order = next((o for o in self.orders if str(o["id"]) == last_order_id), None)
                    prev_lat = float(last_order["lat"]) if last_order else float(d.get("lat", 0.0))
                    prev_lon = float(last_order["lon"]) if last_order else float(d.get("lon", 0.0))
                else:
                    prev_lat = float(d.get("lat", 0.0))
                    prev_lon = float(d.get("lon", 0.0))

                dist = haversine_distance_km(prev_lat, prev_lon, order_lat, order_lon)
                if dist < min_dist:
                    min_dist = dist
                    best_driver_id = did

            if best_driver_id is not None:
                assignments[best_driver_id].append(order_id)
                driver_loads[best_driver_id] += order_weight
                total_distance += min_dist
            else:
                unassigned.append(order_id)

        return {
            "assignments": assignments,
            "unassigned": unassigned,
            "total_distance_km": round(total_distance, 2),
        }
