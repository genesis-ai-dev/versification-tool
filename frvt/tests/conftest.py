"""Shared pytest fixtures: dockerized Postgres test DB with rollback sessions."""

from __future__ import annotations

import base64
import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from frvt.api.bootstrap import seed_canonical
from frvt.api.config import get_settings
from frvt.api.db import get_session
from frvt.api.main import create_app
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

# Default test database URL (Compose maps container 5432 → host 5433).
_DEFAULT_TEST_URL = "postgresql+psycopg2://frvt:frvt@localhost:5433/frvt_test"


def _test_database_url() -> str:
    """Resolve the test database URL from the environment or the local default."""
    return os.environ.get("FRVT_TEST_DATABASE_URL", _DEFAULT_TEST_URL)


@pytest.fixture(scope="session")
def engine() -> Generator[Engine]:
    """Create a session-scoped engine and apply Alembic migrations once."""
    from alembic import command
    from alembic.config import Config

    url = _test_database_url()
    eng = create_engine(url, pool_pre_ping=True)
    with eng.connect() as conn:
        conn.execute(text("SELECT 1"))

    frvt_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    cfg = Config(os.path.join(frvt_root, "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url)
    cfg.set_main_option("script_location", os.path.join(frvt_root, "migrations"))
    # Point Alembic / settings at the test database for this session.
    os.environ["DATABASE_URL"] = url
    from frvt.api.config import get_settings

    get_settings.cache_clear()
    command.upgrade(cfg, "head")

    yield eng
    eng.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Generator[Session]:
    """Yield a session in a transaction that always rolls back after the test."""
    connection = engine.connect()
    transaction = connection.begin()
    factory = sessionmaker(bind=connection, autoflush=False, autocommit=False)
    session = factory()
    session.begin_nested()

    def restart_savepoint(_session: Session, trans: object) -> None:
        """Re-open a SAVEPOINT after nested transactions end so tests stay isolated."""
        if getattr(trans, "nested", False) and not connection.closed:
            if connection.in_transaction() and not connection.in_nested_transaction():
                connection.begin_nested()

    event.listen(session, "after_transaction_end", restart_savepoint)
    try:
        yield session
    finally:
        event.remove(session, "after_transaction_end", restart_savepoint)
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def seeded_session(db_session: Session) -> Session:
    """Seed canonical anchors inside the per-test rollback session."""
    seed_canonical(db_session)
    db_session.flush()
    return db_session


@pytest.fixture
def api_client(seeded_session: Session) -> Generator[TestClient]:
    """TestClient with DB dependency overridden to the rollback session."""
    get_settings.cache_clear()
    app = create_app(run_startup_seed=False)

    def _override_session() -> Generator[Session]:
        yield seeded_session

    app.dependency_overrides[get_session] = _override_session
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def auth_headers() -> dict[str, str]:
    """Build HTTP Basic headers from the active settings credentials."""
    settings = get_settings()
    token = base64.b64encode(
        f"{settings.basic_auth_username}:{settings.basic_auth_password}".encode()
    ).decode()
    return {"Authorization": f"Basic {token}"}
