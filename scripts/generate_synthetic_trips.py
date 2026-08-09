#!/usr/bin/env python3
"""
Synthetic Trip Data Generator & XGBoost Model Trainer for FleetForge ETA Prediction.
"""

import os
import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

def generate_synthetic_trips(num_samples: int = 5000) -> pd.DataFrame:
    np.random.seed(42)

    distance_km = np.random.uniform(5.0, 300.0, num_samples)
    stops_count = np.random.randint(1, 10, num_samples)
    hour_of_day = np.random.randint(0, 24, num_samples)
    is_weekend = np.random.choice([0, 1], num_samples, p=[0.7, 0.3])
    cargo_weight_kg = np.random.uniform(10.0, 5000.0, num_samples)
    transport_mode = np.random.choice([0, 1], num_samples, p=[0.85, 0.15]) # 0=road, 1=air

    # Traffic multiplier based on peak hours (7-10 AM, 4-7 PM)
    peak_hours = np.isin(hour_of_day, [7, 8, 9, 16, 17, 18, 19]).astype(float)
    traffic_mult = 1.0 + (peak_hours * 0.35 * (1.0 - is_weekend * 0.5))

    # Base speeds: Road ~ 45 km/h, Air ~ 450 km/h (plus handling overhead)
    base_speed = np.where(transport_mode == 1, 400.0, 45.0)
    transit_hours = (distance_km / base_speed) * traffic_mult
    stop_delay_minutes = stops_count * np.random.uniform(8.0, 15.0, num_samples)

    # Cargo weight handling delay (1 min per 500 kg)
    cargo_delay_minutes = (cargo_weight_kg / 500.0) * np.random.uniform(2.0, 5.0, num_samples)

    # Total duration in minutes + Gaussian noise
    duration_minutes = (transit_hours * 60.0) + stop_delay_minutes + cargo_delay_minutes
    noise = np.random.normal(0, 5.0, num_samples)
    duration_minutes = np.maximum(10.0, duration_minutes + noise)

    df = pd.DataFrame({
        'distance_km': distance_km,
        'stops_count': stops_count,
        'hour_of_day': hour_of_day,
        'is_weekend': is_weekend,
        'cargo_weight_kg': cargo_weight_kg,
        'transport_mode': transport_mode,
        'duration_minutes': duration_minutes,
    })
    return df

def train_and_save_model():
    print("Generating synthetic trip data...")
    df = generate_synthetic_trips(5000)

    X = df[['distance_km', 'stops_count', 'hour_of_day', 'is_weekend', 'cargo_weight_kg', 'transport_mode']]
    y = df['duration_minutes']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = xgb.XGBRegressor(
        n_estimators=100,
        max_depth=5,
        learning_rate=0.08,
        random_state=42,
    )
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)

    print(f"Model Trained! Test MAE: {mae:.2f} minutes | R2 Score: {r2:.4f}")

    os.makedirs('app/ml', exist_ok=True)
    model_path = 'app/ml/eta_model.pkl'
    joblib.dump(model, model_path)
    print(f"Model saved to {model_path}")

if __name__ == '__main__':
    train_and_save_model()
