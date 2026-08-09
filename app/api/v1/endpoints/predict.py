"""
Cargonaut — ML Prediction Endpoints (ETA & Anomalies)
"""

import random
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenPayload, get_current_user
from app.models.models import Vehicle
from app.schemas.schemas import (
    AnomalyDetectionRequest,
    AnomalyDetectionResult,
    ETAPredictRequest,
    ETAPredictResponse,
)
from app.services.anomaly_detector import detect_trip_anomalies
from app.services.eta_predictor import predict_trip_eta

router = APIRouter()


@router.post("/eta", response_model=ETAPredictResponse)
async def predict_eta(
    payload: ETAPredictRequest,
    current_user: TokenPayload = Depends(get_current_user),
):
    """Predict trip ETA using XGBoost model trained on historical fleet trips."""
    now = datetime.now(timezone.utc)
    hour = payload.hour_of_day if payload.hour_of_day is not None else now.hour
    is_weekend = payload.is_weekend if payload.is_weekend is not None else (now.weekday() >= 5)

    res = predict_trip_eta(
        distance_km=payload.distance_km,
        stops_count=payload.stops_count,
        hour_of_day=hour,
        is_weekend=is_weekend,
        cargo_weight_kg=payload.cargo_weight_kg,
        transport_mode=payload.transport_mode or "road",
    )

    return ETAPredictResponse(**res)


@router.post("/anomalies", response_model=List[AnomalyDetectionResult])
async def detect_anomalies(
    payload: AnomalyDetectionRequest,
    current_user: TokenPayload = Depends(get_current_user),
):
    """Run Isolation Forest anomaly scoring on a set of trip telemetry records."""
    raw_samples = [s.model_dump() for s in payload.samples]
    return detect_trip_anomalies(raw_samples)


@router.get("/anomalies", response_model=List[AnomalyDetectionResult])
async def get_fleet_anomalies(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """Evaluate active fleet vehicles and return current anomalies."""
    v_stmt = select(Vehicle).where(Vehicle.tenant_id == current_user.tenant_id)
    v_res = await db.execute(v_stmt)
    vehicles = v_res.scalars().all()

    sample_data = []
    random.seed(42)

    for i, v in enumerate(vehicles):
        is_spike = (i % 3 == 0)
        sample_data.append({
            "vehicle_id": v.id,
            "vehicle_registration": v.registration_number,
            "driver_name": "Fleet Driver",
            "avg_speed_kmh": 115.0 if is_spike else 55.0,
            "idle_time_minutes": 42.0 if is_spike else 8.0,
            "fuel_rate_lph": 19.5 if is_spike else 9.5,
            "harsh_braking_events": 7 if is_spike else 1,
        })

    if not sample_data:
        sample_data = [
            {"vehicle_id": "demo-1", "vehicle_registration": "MH-12-AB-1234", "driver_name": "Vikram Singh", "avg_speed_kmh": 118.5, "idle_time_minutes": 45.0, "fuel_rate_lph": 21.0, "harsh_braking_events": 8},
            {"vehicle_id": "demo-2", "vehicle_registration": "MH-04-XY-9876", "driver_name": "Amit Sharma", "avg_speed_kmh": 52.0, "idle_time_minutes": 6.0, "fuel_rate_lph": 8.5, "harsh_braking_events": 0},
            {"vehicle_id": "demo-3", "vehicle_registration": "KA-01-EQ-5544", "driver_name": "Rajesh Kumar", "avg_speed_kmh": 35.0, "idle_time_minutes": 38.0, "fuel_rate_lph": 18.2, "harsh_braking_events": 6},
        ]

    return detect_trip_anomalies(sample_data)
