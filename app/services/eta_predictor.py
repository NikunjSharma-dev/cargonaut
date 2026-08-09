"""
Cargonaut — XGBoost ETA Prediction Service
"""

import os

import joblib
import pandas as pd

MODEL_PATH = os.path.join(os.path.dirname(__file__), "../ml/eta_model.pkl")

_model = None

def load_eta_model():
    global _model
    if _model is not None:
        return _model
    abs_path = os.path.abspath(MODEL_PATH)
    if os.path.exists(abs_path):
        try:
            _model = joblib.load(abs_path)
            return _model
        except Exception:
            pass
    return None

def predict_trip_eta(
    distance_km: float,
    stops_count: int = 1,
    hour_of_day: int = 12,
    is_weekend: bool = False,
    cargo_weight_kg: float = 500.0,
    transport_mode: str = "road",
) -> dict:
    """
    Predict trip duration in minutes using XGBoost model with heuristic fallback.
    """
    model = load_eta_model()

    mode_int = 1 if transport_mode.lower() == "air" else 0
    weekend_int = 1 if is_weekend else 0

    if model is not None:
        input_data = pd.DataFrame([{
            'distance_km': float(distance_km),
            'stops_count': int(stops_count),
            'hour_of_day': int(hour_of_day),
            'is_weekend': int(weekend_int),
            'cargo_weight_kg': float(cargo_weight_kg),
            'transport_mode': int(mode_int),
        }])
        predicted_mins = float(model.predict(input_data)[0])
        predicted_mins = max(5.0, round(predicted_mins, 1))
        model_used = "xgboost_v1"
    else:
        # Heuristic fallback
        base_speed = 400.0 if mode_int == 1 else 45.0
        transit_mins = (distance_km / base_speed) * 60.0
        stop_mins = stops_count * 12.0
        predicted_mins = round(transit_mins + stop_mins, 1)
        model_used = "heuristic_fallback"

    return {
        "predicted_eta_minutes": predicted_mins,
        "predicted_eta_hours": round(predicted_mins / 60.0, 2),
        "distance_km": distance_km,
        "stops_count": stops_count,
        "transport_mode": transport_mode,
        "model_used": model_used,
    }
