"""
Cargonaut — Celery Worker Application
Handles heavy async tasks: VRP optimization, ETL jobs, bulk GPS processing.
"""

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "cargonaut",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.workers.tasks.run_vrp_optimization": {"queue": "optimization"},
        "app.workers.tasks.run_power_bi_etl": {"queue": "etl"},
        "app.workers.tasks.flush_gps_buffer": {"queue": "telemetry"},
        "app.workers.tasks.sweep_geofences": {"queue": "telemetry"},
    },
    # Safety net only — enter/exit events fire inline on ping ingest.
    beat_schedule={
        "geofence-sweep": {
            "task": "app.workers.tasks.sweep_geofences",
            "schedule": 600.0,   # every 10 minutes
            "kwargs": {"lookback_minutes": 15},
        },
    },
)
