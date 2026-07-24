"""Phase 1 cases: auth gate and server health/bootstrap HTTP contracts."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from frvt.api.config import get_settings
from frvt.api.db import get_session
from frvt.api.main import create_app
from frvt.api.static import SpaStaticFiles
from frvt.testops.http_client import assert_error_envelope, basic_auth_header
from sqlalchemy.orm import Session


@pytest.fixture
def client() -> TestClient:
    """Build a TestClient against a fresh app instance (no startup seed)."""
    get_settings.cache_clear()
    return TestClient(create_app(run_startup_seed=False))


@pytest.mark.phase1
@pytest.mark.auth
def test_valid_basic_credentials_allow_api_access(client: TestClient) -> None:
    """TC-AUTH-001: Valid Basic credentials allow API access."""
    response = client.get("/api/health", headers=basic_auth_header())
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.phase1
@pytest.mark.server
def test_health_reports_ok_when_db_reachable(client: TestClient) -> None:
    """TC-SERVER-001: Health reports OK when the database is reachable."""
    response = client.get("/api/health", headers=basic_auth_header())
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.phase1
@pytest.mark.auth
def test_unauthenticated_rejected_on_every_route(client: TestClient) -> None:
    """TC-AUTH-010: Unauthenticated requests are rejected on every route."""
    for path in ("/api/health", "/api/translations", "/docs", "/"):
        response = client.get(path)
        assert response.status_code == 401, path
        assert 'Basic realm="FRVT"' in response.headers.get("WWW-Authenticate", "")
        if path.startswith("/api/"):
            body = response.json()
            assert_error_envelope(body, code="unauthorized")


@pytest.mark.phase1
@pytest.mark.auth
def test_wrong_password_is_rejected(client: TestClient) -> None:
    """TC-AUTH-011: Wrong password is rejected."""
    settings = get_settings()
    response = client.get(
        "/api/translations",
        headers=basic_auth_header(settings.basic_auth_username, "not-the-password"),
    )
    assert response.status_code == 401
    assert_error_envelope(response.json(), code="unauthorized")
    assert "items" not in response.json()


@pytest.mark.phase1
@pytest.mark.server
def test_health_reports_database_unavailable(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """TC-SERVER-010: Health reports database unavailable when the DB is down."""

    def _broken_session() -> MagicMock:
        session = MagicMock(spec=Session)

        def _fail(*_args: object, **_kwargs: object) -> None:
            raise OSError("connection refused")

        session.execute.side_effect = _fail
        return session

    # Override after app creation: replace dependency on the app used by client.
    app = client.app
    app.dependency_overrides[get_session] = _broken_session  # type: ignore[index]
    try:
        response = client.get("/api/health", headers=basic_auth_header())
    finally:
        app.dependency_overrides.pop(get_session, None)

    assert response.status_code == 503
    assert_error_envelope(response.json(), code="database_unavailable")


@pytest.mark.phase1
@pytest.mark.server
def test_method_not_allowed_uses_fixed_error_vocabulary(client: TestClient) -> None:
    """Framework-generated 4xx responses never masquerade as internal errors."""
    response = client.post("/api/health", headers=basic_auth_header())
    assert response.status_code == 405
    assert_error_envelope(response.json(), code="bad_request")


@pytest.mark.phase1
@pytest.mark.server
def test_static_ui_falls_back_for_client_routes(tmp_path: Path) -> None:
    """Extensionless client routes serve the SPA while missing assets remain 404."""
    static_dir = tmp_path / "dist"
    static_dir.mkdir()
    (static_dir / "index.html").write_text("<main id='root'></main>", encoding="utf-8")
    app = FastAPI()
    app.mount("/", SpaStaticFiles(directory=static_dir, html=True))

    with TestClient(app) as static_client:
        route = static_client.get("/manage/translations")
        missing_asset = static_client.get("/assets/missing.js")

    assert route.status_code == 200
    assert "id='root'" in route.text
    assert missing_asset.status_code == 404
