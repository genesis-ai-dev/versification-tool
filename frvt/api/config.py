"""Application settings loaded from environment / ``.env``."""

from functools import lru_cache

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

# Shared local-only Basic defaults; the startup warning compares against these.
DEFAULT_BASIC_AUTH_USERNAME = "admin"
# Shared local-only Basic password; never log this value.
DEFAULT_BASIC_AUTH_PASSWORD = "Admin123!"


def _normalize_public_path_prefix(token: str) -> str | None:
    """Return a stripped prefix, dropping empties and trailing slashes except ``/``.

    Used when splitting ``BASIC_AUTH_PUBLIC_PATHS``. Returns None for tokens that
    are empty after strip/normalize so callers can skip them.
    """
    prefix = token.strip()
    if not prefix:
        return None
    if prefix != "/":
        prefix = prefix.rstrip("/")
        if not prefix:
            return None
    return prefix


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
    basic_auth_username: str = Field(
        default=DEFAULT_BASIC_AUTH_USERNAME, alias="BASIC_AUTH_USERNAME"
    )
    # Shared HTTP Basic password that gates API, UI, and docs.
    basic_auth_password: str = Field(
        default=DEFAULT_BASIC_AUTH_PASSWORD, alias="BASIC_AUTH_PASSWORD"
    )
    # Comma-separated path prefixes that skip Basic auth and the failed-auth limiter.
    basic_auth_public_paths_csv: str = Field(
        default="", alias="BASIC_AUTH_PUBLIC_PATHS"
    )
    # How many in-window auth failures return 401 before the next failure is 429.
    basic_auth_failure_limit: int = Field(default=10, alias="BASIC_AUTH_FAILURE_LIMIT")
    # Sliding-window length in seconds for failed-auth counting; ``<= 0`` disables 429s.
    basic_auth_failure_window_seconds: int = Field(
        default=60, alias="BASIC_AUTH_FAILURE_WINDOW_SECONDS"
    )
    # When true, key the limiter on the rightmost ``X-Forwarded-For`` hop.
    trust_proxy_headers: bool = Field(default=False, alias="TRUST_PROXY_HEADERS")
    # Maximum accepted upload size in bytes for ingest endpoints.
    max_upload_bytes: int = Field(default=52_428_800, alias="MAX_UPLOAD_BYTES")
    # Root logger level name for the ``frvt`` logger tree (e.g. DEBUG, TRACE).
    log_level: str = Field(default="DEBUG", alias="LOG_LEVEL")
    # When true, the resolver logs composite pivot/hop diagnostics at TRACE.
    resolve_trace_pivots: bool = Field(default=False, alias="RESOLVE_TRACE_PIVOTS")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def basic_auth_public_paths(self) -> tuple[str, ...]:
        """Normalized prefixes parsed from ``BASIC_AUTH_PUBLIC_PATHS``."""
        logger.trace(  # type: ignore[attr-defined]
            "Resolving public path prefixes from csv length=%s",
            len(self.basic_auth_public_paths_csv),
        )
        prefixes: list[str] = []
        for token in self.basic_auth_public_paths_csv.split(","):
            prefix = _normalize_public_path_prefix(token)
            if prefix is not None:
                prefixes.append(prefix)
        return tuple(prefixes)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def database_url(self) -> str:
        """Return the SQLAlchemy URL, preferring an explicit override when present."""
        logger.trace("Resolving database_url from override or POSTGRES_* fields")  # type: ignore[attr-defined]
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
