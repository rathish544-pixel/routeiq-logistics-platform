import os
from pydantic_settings import BaseSettings


def _parse_origins(value: str | None) -> list[str]:
    """Parse comma-separated CORS origins from the environment."""
    if not value:
        return [
            "http://localhost:5173",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:3000",
        ]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


class Settings(BaseSettings):
    PROJECT_NAME: str = "RouteIQ — Fleet Control Center"
    VERSION: str = "2.4.0"
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str = "postgresql://localhost/logistics_db"

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str | None = None

    # OSRM
    OSRM_URL: str = "https://router.project-osrm.org"

    # Supabase Auth
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # Operations & Policies
    # Warning windows scale with urgency: critical (P3) flags the earliest.
    DELAY_WARNING_P1_MINUTES: int = 15
    DELAY_WARNING_P2_MINUTES: int = 20
    DELAY_WARNING_P3_MINUTES: int = 30
    OPTIMIZER_TIMEOUT_SECONDS: int = 5
    DEFAULT_SERVICE_TIME_MINUTES: int = 10

    # CORS (comma-separated in .env)
    CORS_ORIGINS: list[str] = []

    class Config:
        env_file = ".env"
        extra = "allow"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        raw = os.getenv("CORS_ORIGINS")
        if raw:
            self.CORS_ORIGINS = _parse_origins(raw)
        elif not self.CORS_ORIGINS:
            self.CORS_ORIGINS = _parse_origins(None)

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def supabase_configured(self) -> bool:
        return bool(self.SUPABASE_URL and self.SUPABASE_JWT_SECRET)


settings = Settings()