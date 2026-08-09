"""
Cargonaut — Application Configuration

Note: ALLOWED_ORIGINS and ALLOWED_HOSTS are stored as plain comma-separated
strings to avoid pydantic-settings v2 JSON-parsing issues with List[str] fields
read from .env files or Docker environment blocks.
Use get_allowed_origins() / get_allowed_hosts() helpers wherever a list is needed.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Cargonaut OSS"
    DEBUG: bool = False
    SECRET_KEY: str = "change-this-in-production-use-256bit-random-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://fleetforge:password@localhost:5432/fleetforge"

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # CORS & Security — stored as comma-separated strings, never as JSON lists.
    # In docker-compose.yml use:  ALLOWED_ORIGINS: "http://localhost:3000,http://localhost:5173"
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173,https://app.cargonaut.io"
    ALLOWED_HOSTS: str = "*"

    # Power BI Embedded (Azure)
    POWERBI_TENANT_ID: str = ""
    POWERBI_CLIENT_ID: str = ""
    POWERBI_CLIENT_SECRET: str = ""
    POWERBI_WORKSPACE_ID: str = ""

    # AWS (optional)
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"
    S3_BUCKET: str = "cargonaut-uploads"

    model_config = {"env_file": ".env", "case_sensitive": True}


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


def get_allowed_origins() -> list[str]:
    """Return ALLOWED_ORIGINS as a proper list, splitting on commas."""
    return [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]


def get_allowed_hosts() -> list[str]:
    """Return ALLOWED_HOSTS as a proper list, splitting on commas."""
    return [h.strip() for h in settings.ALLOWED_HOSTS.split(",") if h.strip()]
