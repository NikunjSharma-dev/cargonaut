"""
Cargonaut — Isolation Forest Anomaly Detection Service for Fleet Operations
"""

from typing import Any, Dict, List

import numpy as np

try:
    from sklearn.ensemble import IsolationForest
    _SKLEARN_AVAILABLE = True
except ImportError:
    _SKLEARN_AVAILABLE = False


def _build_default_model():
    if not _SKLEARN_AVAILABLE:
        return None
    np.random.seed(42)
    # Generate 500 normal trip samples:
    # avg_speed: 40-70 km/h, idle_time: 2-15 min, fuel_rate: 6-12 L/h, harsh_brakes: 0-2
    avg_speed = np.random.normal(55.0, 8.0, 500)
    idle_time = np.random.normal(8.0, 3.0, 500)
    fuel_rate = np.random.normal(9.0, 1.5, 500)
    harsh_brakes = np.random.poisson(0.8, 500)

    X_train = np.column_stack([avg_speed, idle_time, fuel_rate, harsh_brakes])

    model = IsolationForest(
        n_estimators=100,
        contamination=0.08,
        random_state=42
    )
    model.fit(X_train)
    return model


_model = _build_default_model()


def detect_trip_anomalies(telemetry_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Score telemetry records using Isolation Forest and return anomaly flags + reasons.
    """
    if not telemetry_records:
        return []

    results = []

    for r in telemetry_records:
        avg_speed = float(r.get("avg_speed_kmh", 50.0))
        idle_time = float(r.get("idle_time_minutes", 10.0))
        fuel_rate = float(r.get("fuel_rate_lph", 9.0))
        harsh_brakes = int(r.get("harsh_braking_events", 0))

        features = [[avg_speed, idle_time, fuel_rate, harsh_brakes]]

        reasons = []
        if avg_speed > 110.0:
            reasons.append(f"Excessive speeding ({avg_speed:.1f} km/h)")
        elif avg_speed < 10.0 and idle_time > 20.0:
            reasons.append(f"Severe congestion / prolonged stall ({avg_speed:.1f} km/h)")

        if idle_time > 30.0:
            reasons.append(f"Excessive idling ({idle_time:.0f} mins)")

        if fuel_rate > 18.0:
            reasons.append(f"Abnormal fuel consumption ({fuel_rate:.1f} L/h)")

        if harsh_brakes >= 5:
            reasons.append(f"High harsh braking events ({harsh_brakes} occurrences)")

        if _model is not None:
            raw_score = float(_model.decision_function(features)[0])
            is_outlier = int(_model.predict(features)[0]) == -1 or len(reasons) > 0
            anomaly_score = round(max(0.0, min(1.0, 0.5 - raw_score)), 3)
        else:
            is_outlier = len(reasons) > 0
            anomaly_score = 0.85 if is_outlier else 0.1

        if is_outlier and not reasons:
            reasons.append("Multi-factor statistical anomaly detected by Isolation Forest")

        results.append({
            "vehicle_id": r.get("vehicle_id"),
            "vehicle_registration": r.get("vehicle_registration", "Unknown"),
            "driver_name": r.get("driver_name", "Unassigned"),
            "avg_speed_kmh": avg_speed,
            "idle_time_minutes": idle_time,
            "fuel_rate_lph": fuel_rate,
            "harsh_braking_events": harsh_brakes,
            "is_anomaly": is_outlier,
            "anomaly_score": anomaly_score,
            "reasons": reasons if is_outlier else [],
        })

    return results
