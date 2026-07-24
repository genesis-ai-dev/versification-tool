"""Tests for the authenticated health endpoint and auth gate."""

from __future__ import annotations

import base64
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from frvt.api.config import get_settings
from frvt.api.main import create_app
from frvt.api.static import SpaStaticFiles


@pytest.fixture
def client() -> TestClient:
    """Build a TestClient against a fresh app instance (no startup seed)."""
    get_settings.cache_clear()
    return TestClient(create_app(run_startup_seed=False))


def _auth_header(username: str, password: str) -> dict[str, str]:
    """Build an HTTP Basic Authorization header."""
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def test_health_requires_auth(client: TestClient) -> None:
    """Unauthenticated requests receive 401 with a WWW-Authenticate challenge."""
    response = client.get("/api/health")
    assert response.status_code == 401
    assert response.json()["code"] == "unauthorized"
    assert 'Basic realm="FRVT"' in response.headers.get("WWW-Authenticate", "")


def test_docs_requires_auth(client: TestClient) -> None:
    """OpenAPI docs are gated by the same Basic-auth middleware."""
    response = client.get("/docs")
    assert response.status_code == 401


def test_method_not_allowed_uses_fixed_error_vocabulary(client: TestClient) -> None:
    """Framework-generated 4xx responses never masquerade as internal errors."""
    settings = get_settings()
    response = client.post(
        "/api/health",
        headers=_auth_header(
            settings.basic_auth_username, settings.basic_auth_password
        ),
    )
    assert response.status_code == 405
    assert response.json()["code"] == "bad_request"


def test_health_ok_when_db_up(client: TestClient) -> None:
    """Health returns ok when Postgres answers the ping."""
    settings = get_settings()
    response = client.get(
        "/api/health",
        headers=_auth_header(
            settings.basic_auth_username, settings.basic_auth_password
        ),
    )
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


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
