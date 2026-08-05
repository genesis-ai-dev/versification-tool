"""Application settings loaded from environment / ``.env``."""

from functools import lru_cache

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed runtime configuration for the API process and its clients."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Host used when assembling DATABASE_URL from discrete POSTGRES_* values.
    postgres_host: str = Field(default="localhost", alias="POSTGRES_HOST")
    # Host port mapped to the Compose Postgres container (container listens on 5432).
    postgres_port: int = Field(default=5433, alias="POSTGRES_PORT")
    # Application database name inside Postgres.
    postgres_db: str = Field(default="frvt", alias="POSTGRES_DB")
    # Database role used by the SQLAlchemy engine.
    postgres_user: str = Field(default="frvt", alias="POSTGRES_USER")
    # Password for the database role (local Compose default only).
    postgres_password: str = Field(default="frvt", alias="POSTGRES_PASSWORD")
    # Optional full SQLAlchemy URL; when set it overrides the POSTGRES_* derivation.
    database_url_override: str | None = Field(default=None, alias="DATABASE_URL")
    # Shared HTTP Basic username that gates API, UI, and docs.
    basic_auth_username: str = Field(default="admin", alias="BASIC_AUTH_USERNAME")
    # Shared HTTP Basic password that gates API, UI, and docs.
    basic_auth_password: str = Field(default="Admin123!", alias="BASIC_AUTH_PASSWORD")
    # Maximum accepted upload size in bytes for ingest endpoints.
    max_upload_bytes: int = Field(default=52_428_800, alias="MAX_UPLOAD_BYTES")
    # Root logger level name for the ``frvt`` logger tree (e.g. DEBUG, TRACE).
    log_level: str = Field(default="DEBUG", alias="LOG_LEVEL")
    # When true, the resolver logs composite pivot/hop diagnostics at TRACE.
    resolve_trace_pivots: bool = Field(default=False, alias="RESOLVE_TRACE_PIVOTS")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> str:
        """Return the SQLAlchemy URL, preferring an explicit override when present."""
        if self.database_url_override:
            return self.database_url_override
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide cached settings instance."""
    return Settings()
