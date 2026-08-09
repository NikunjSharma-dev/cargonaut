"""
Cargonaut — Cargo handling & transport mode rules.

One place that answers three questions the rest of the app keeps asking:

  * What does this cargo need to travel safely? (`CARGO_PROFILES`)
  * Can this asset legally and physically carry it? (`check_compatibility`)
  * How long does a leg take, and what is it billed on? (`MODE_PROFILES`,
    `chargeable_weight_kg`)

The frontend mirrors these tables in `frontend/src/utils/cargo.js`; keep the two
in step when adding a cargo type.
"""

from dataclasses import dataclass
from typing import Any, Optional

from app.models.models import (
    VOLUMETRIC_FACTOR_KG_PER_M3,
    CargoType,
    TransportMode,
    VehicleType,
    mode_for_vehicle_type,
)


@dataclass(frozen=True)
class ModeProfile:
    label: str
    avg_speed_kmh: float
    # Terminal time that does not scale with distance: dock loading for road,
    # build-up / customs / ramp handling for air.
    fixed_handling_minutes: int
    cost_per_km: float


MODE_PROFILES: dict[TransportMode, ModeProfile] = {
    TransportMode.ROAD: ModeProfile(
        label="Road cargo", avg_speed_kmh=40.0, fixed_handling_minutes=20, cost_per_km=0.85,
    ),
    TransportMode.AIR: ModeProfile(
        label="Air cargo", avg_speed_kmh=780.0, fixed_handling_minutes=210, cost_per_km=4.20,
    ),
}


@dataclass(frozen=True)
class CargoProfile:
    label: str
    needs_refrigeration: bool = False
    # Air cargo is regulated far more tightly than road freight. These two flags
    # are what stop the optimizer loading a shipment onto an aircraft it may not
    # legally fly on.
    air_allowed: bool = True
    air_requires_declaration: bool = False
    # Multiplier applied to the base rate — hazmat and high-value cost more to move.
    rate_multiplier: float = 1.0


CARGO_PROFILES: dict[CargoType, CargoProfile] = {
    CargoType.GENERAL:      CargoProfile("General freight"),
    CargoType.PARCEL:       CargoProfile("Parcels", rate_multiplier=1.05),
    CargoType.PALLETIZED:   CargoProfile("Palletized", rate_multiplier=1.0),
    CargoType.REFRIGERATED: CargoProfile("Refrigerated", needs_refrigeration=True, rate_multiplier=1.35),
    CargoType.FRAGILE:      CargoProfile("Fragile", rate_multiplier=1.2),
    CargoType.HAZMAT:       CargoProfile(
        "Hazardous goods", air_requires_declaration=True, rate_multiplier=1.6,
    ),
    # Bulk liquid needs a road tanker; no ULD exists for it.
    CargoType.LIQUID_BULK:  CargoProfile("Liquid bulk", air_allowed=False, rate_multiplier=1.25),
    # Out-of-gauge freight exceeds a freighter's door envelope.
    CargoType.OVERSIZED:    CargoProfile("Oversized / out-of-gauge", air_allowed=False, rate_multiplier=1.45),
    CargoType.HIGH_VALUE:   CargoProfile("High value", air_requires_declaration=True, rate_multiplier=1.5),
}


def profile_for(cargo_type: CargoType | str) -> CargoProfile:
    return CARGO_PROFILES[CargoType(cargo_type)]


def mode_profile_for(mode: TransportMode | str) -> ModeProfile:
    return MODE_PROFILES[TransportMode(mode)]


def chargeable_weight_kg(
    weight_kg: Optional[float],
    volume_m3: Optional[float],
    mode: TransportMode | str = TransportMode.ROAD,
) -> Optional[float]:
    """Billable weight: the greater of actual and volumetric weight."""
    if weight_kg is None and volume_m3 is None:
        return None
    actual = weight_kg or 0.0
    if not volume_m3:
        return round(actual, 2)
    factor = VOLUMETRIC_FACTOR_KG_PER_M3[TransportMode(mode)]
    return round(max(actual, volume_m3 * factor), 2)


def estimate_duration_minutes(distance_km: float, mode: TransportMode | str) -> int:
    """Leg duration including the mode's fixed terminal handling time."""
    profile = mode_profile_for(mode)
    return int(round(distance_km / profile.avg_speed_kmh * 60 + profile.fixed_handling_minutes))


def estimate_cost(distance_km: float, mode: TransportMode | str, cargo_type: CargoType | str) -> float:
    """Indicative line-haul cost for a leg, before surcharges."""
    return round(
        distance_km * mode_profile_for(mode).cost_per_km * profile_for(cargo_type).rate_multiplier, 2
    )


def check_compatibility(
    cargo_type: CargoType | str,
    mode: TransportMode | str,
    vehicle: Any = None,
) -> tuple[bool, Optional[str]]:
    """
    Can this cargo move this way, on this asset?

    Returns `(ok, reason)` — `reason` is a dispatcher-facing sentence when the
    pairing is rejected, and `None` when it is fine. `vehicle` is optional so
    the check also works while an order is still unassigned.
    """
    cargo = CargoType(cargo_type)
    mode = TransportMode(mode)
    profile = profile_for(cargo)

    if mode is TransportMode.AIR and not profile.air_allowed:
        return False, f"{profile.label} cannot be carried as air cargo — route it by road."

    if vehicle is None:
        return True, None

    vehicle_type = VehicleType(vehicle.vehicle_type)
    vehicle_mode = mode_for_vehicle_type(vehicle_type)
    if vehicle_mode is not mode:
        return False, (
            f"{vehicle.registration_number} is a {vehicle_mode.value} asset "
            f"and cannot serve a {mode.value} shipment."
        )

    if profile.needs_refrigeration and not getattr(vehicle, "has_refrigeration", False):
        return False, f"{profile.label} needs a temperature-controlled unit; {vehicle.registration_number} has none."

    return True, None
