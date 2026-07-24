"""SQLAlchemy engine, session factory, and FastAPI session dependency."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from frvt.api.config import Settings, get_settings
from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

# Process-wide engine; created lazily so tests can override settings first.
_engine: Engine | None = None
# Session factory bound to ``_engine`` once the engine exists.
_SessionLocal: sessionmaker[Session] | None = None


def get_engine(settings: Settings | None = None) -> Engine:
    """Return (and cache) the SQLAlchemy engine for the active settings."""
    global _engine, _SessionLocal
    if _engine is None:
        cfg = settings or get_settings()
        logger.debug("Creating database engine for host=%s", cfg.postgres_host)
        _engine = create_engine(cfg.database_url, pool_pre_ping=True)
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    return _engine


def get_session_factory(settings: Settings | None = None) -> sessionmaker[Session]:
    """Return the session factory, ensuring the engine has been created."""
    get_engine(settings)
    assert _SessionLocal is not None
    return _SessionLocal


def reset_engine() -> None:
    """Dispose the cached engine so tests can rebuild against another URL."""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


def get_session() -> Generator[Session]:
    """Yield a request-scoped session; commit on success, rollback on error."""
    logger.debug("Opening database session")
    factory = get_session_factory()
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        logger.error("Rolling back database session after error", exc_info=True)
        try:
            session.rollback()
        except Exception:
            logger.error("Database session rollback also failed", exc_info=True)
        raise
    finally:
        session.close()
