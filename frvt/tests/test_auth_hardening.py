"""Contract tests for the Basic gate, failed-auth limiter, opt-out, and warning."""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterator
from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from frvt.api.config import get_settings
from frvt.api.main import create_app
from frvt.testops.http_client import assert_error_envelope, basic_auth_header
from starlette.routing import WebSocketRoute

# Expected WWW-Authenticate value on gated 401/429 responses.
_AUTHENTICATE = 'Basic realm="FRVT"'
# Pinned 429 detail from the auth-hardening contract.
_TOO_MANY = "Too many failed authentication attempts."


class _FakeClock:
    """Controllable monotonic clock for sliding-window limiter tests."""

    def __init__(self, now: float = 1_000.0) -> None:
        """Start the clock at ``now`` so tests can advance the limiter window."""
        # Current fake monotonic time read by the limiter on each failure.
        self.now = now

    def __call__(self) -> float:
        """Return the current fake monotonic time."""
        return self.now


@pytest.fixture
def auth_client_factory(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[Callable[..., TestClient]]:
    """Build TestClients with env/clock overrides; clear settings cache after each test."""

    def _factory(
        env: dict[str, str] | None = None,
        clock: Callable[[], float] | None = None,
    ) -> TestClient:
        """Create a fresh app using ``env`` and optional test ``clock``."""
        for key, value in (env or {}).items():
            monkeypatch.setenv(key, value)
        get_settings.cache_clear()
        return TestClient(create_app(run_startup_seed=False, clock=clock))

    yield _factory
    get_settings.cache_clear()


def _http_paths(app: FastAPI) -> list[str]:
    """Return distinct HTTP paths registered on ``app`` (skip WebSocket routes)."""
    paths: list[str] = []
    for route in app.routes:
        if isinstance(route, WebSocketRoute):
            continue
        path = getattr(route, "path", None)
        if isinstance(path, str) and path not in paths:
            paths.append(path)
    return paths


def _forwarded(*hops: str) -> dict[str, str]:
    """Build an ``X-Forwarded-For`` header from left-to-right hops."""
    return {"X-Forwarded-For": ", ".join(hops)}


@pytest.mark.auth
def test_registered_http_routes_reject_unauthenticated(
    auth_client_factory: Callable[..., TestClient],
) -> None:
    """Unauthenticated GET on each registered HTTP path is 401, isolated per IP."""
    client = auth_client_factory({"TRUST_PROXY_HEADERS": "true"})
    # TestClient types ``app`` as a bare ASGI callable; the factory always builds one.
    app = cast(FastAPI, client.app)
    for index, path in enumerate(_http_paths(app), start=1):
        ip = f"198.51.{index // 256}.{index % 256}"
        response = client.get(path, headers=_forwarded(ip))
        assert response.status_code == 401, path
        assert _AUTHENTICATE in response.headers.get("WWW-Authenticate", "")


@pytest.mark.auth
def test_eleventh_failure_from_same_ip_is_too_many_requests(
    auth_client_factory: Callable[..., TestClient],
) -> None:
    """Ten failed gates return 401; the eleventh from that IP returns 429."""
    client = auth_client_factory()
    responses = [client.get("/api/health") for _ in range(11)]
    assert [item.status_code for item in responses[:10]] == [401] * 10
    last = responses[10]
    assert last.status_code == 429
    assert_error_envelope(last.json(), code="too_many_requests")
    assert last.json()["detail"] == _TOO_MANY
    assert _AUTHENTICATE in last.headers.get("WWW-Authenticate", "")
    retry_after = last.headers.get("Retry-After")
    assert retry_after is not None and retry_after.isdigit()
    assert int(retry_after) >= 1


@pytest.mark.auth
def test_valid_credentials_succeed_after_ten_failures(
    auth_client_factory: Callable[..., TestClient],
) -> None:
    """A valid Basic request is not 429 after ten prior failures from that IP."""
    client = auth_client_factory()
    for _ in range(10):
        assert client.get("/api/health").status_code == 401
    response = client.get("/api/health", headers=basic_auth_header())
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.auth
def test_other_ip_still_unauthorized_after_neighbor_is_limited(
    auth_client_factory: Callable[..., TestClient],
) -> None:
    """A second client IP is not 429 when another IP has already been limited."""
    client = auth_client_factory({"TRUST_PROXY_HEADERS": "true"})
    for _ in range(11):
        client.get("/api/health", headers=_forwarded("203.0.113.10"))
    other = client.get("/api/health", headers=_forwarded("203.0.113.11"))
    assert other.status_code == 401
    assert_error_envelope(other.json(), code="unauthorized")


@pytest.mark.auth
def test_failure_window_expiry_returns_unauthorized(
    auth_client_factory: Callable[..., TestClient],
) -> None:
    """After the window elapses, a previously limited IP receives 401 again."""
    clock = _FakeClock()
    client = auth_client_factory(clock=clock)
    for _ in range(11):
        client.get("/api/health")
    clock.now += 60
    response = client.get("/api/health")
    assert response.status_code == 401
    assert_error_envelope(response.json(), code="unauthorized")


@pytest.mark.auth
def test_untrusted_forwarded_for_does_not_isolate_clients(
    auth_client_factory: Callable[..., TestClient],
) -> None:
    """When proxy headers are off, distinct XFF values still share one limiter key."""
    client = auth_client_factory({"TRUST_PROXY_HEADERS": "false"})
    statuses = [
        client.get("/api/health", headers=_forwarded(f"198.51.100.{n}")).status_code
        for n in range(1, 12)
    ]
    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429


@pytest.mark.auth
def test_limiter_keys_on_rightmost_forwarded_for_hop(
    auth_client_factory: Callable[..., TestClient],
) -> None:
    """Varying the leftmost XFF hop does not split the limiter when the rightmost hop is fixed."""
    client = auth_client_factory({"TRUST_PROXY_HEADERS": "true"})
    statuses = [
        client.get(
            "/api/health",
            headers=_forwarded(f"198.51.100.{n}", "203.0.113.50"),
        ).status_code
        for n in range(1, 12)
    ]
    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429


@pytest.mark.auth
def test_zero_failure_limit_never_returns_429(
    auth_client_factory: Callable[..., TestClient],
) -> None:
    """BASIC_AUTH_FAILURE_LIMIT=0 disables 429; failures stay 401."""
    client = auth_client_factory({"BASIC_AUTH_FAILURE_LIMIT": "0"})
    statuses = [client.get("/api/health").status_code for _ in range(11)]
    assert statuses == [401] * 11


@pytest.mark.auth
def test_default_credentials_log_warning_and_still_serve(
    auth_client_factory: Callable[..., TestClient], caplog: pytest.LogCaptureFixture
) -> None:
    """Startup with baked-in defaults logs WARNING and still serves authenticated health."""
    frvt_logger = logging.getLogger("frvt")
    frvt_logger.addHandler(caplog.handler)
    try:
        caplog.set_level(logging.WARNING, logger="frvt")
        client = auth_client_factory()
        response = client.get("/api/health", headers=basic_auth_header())
    finally:
        frvt_logger.removeHandler(caplog.handler)
    assert response.status_code == 200
    messages = [record.getMessage() for record in caplog.records]
    assert any("built-in local defaults" in message for message in messages)
    assert all("Admin123!" not in message for message in messages)


@pytest.mark.auth
def test_non_ascii_credentials_are_rejected_without_error(
    auth_client_factory: Callable[..., TestClient],
) -> None:
    """Non-ASCII Basic credentials fail closed with 401 rather than a server error."""
    client = auth_client_factory()
    response = client.get("/api/health", headers=basic_auth_header("café", "pässwörd"))
    assert response.status_code == 401
    assert_error_envelope(response.json(), code="unauthorized")


@pytest.mark.auth
def test_non_ascii_password_configured_still_authenticates(
    auth_client_factory: Callable[..., TestClient],
) -> None:
    """A configured non-ASCII password authenticates instead of breaking the gate."""
    client = auth_client_factory(
        {"BASIC_AUTH_USERNAME": "operator", "BASIC_AUTH_PASSWORD": "pässwörd-Straße"}
    )
    response = client.get(
        "/api/health", headers=basic_auth_header("operator", "pässwörd-Straße")
    )
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.auth
def test_public_prefix_skips_basic_for_matching_path_only(
    auth_client_factory: Callable[..., TestClient],
) -> None:
    """An opted-out prefix is reachable without Basic; other paths stay gated."""
    client = auth_client_factory({"BASIC_AUTH_PUBLIC_PATHS": "/openapi.json"})
    openapi = client.get("/openapi.json")
    health = client.get("/api/health")
    assert openapi.status_code == 200
    assert health.status_code == 401
    assert_error_envelope(health.json(), code="unauthorized")


@pytest.mark.auth
def test_doc_prefix_does_not_opt_out_docs(
    auth_client_factory: Callable[..., TestClient],
) -> None:
    """Prefix /doc does not match /docs."""
    client = auth_client_factory({"BASIC_AUTH_PUBLIC_PATHS": "/doc"})
    response = client.get("/docs")
    assert response.status_code == 401
    assert _AUTHENTICATE in response.headers.get("WWW-Authenticate", "")


@pytest.mark.auth
def test_slash_prefix_opts_out_every_path(
    auth_client_factory: Callable[..., TestClient],
) -> None:
    """Prefix / skips Basic on API, docs, and health."""
    client = auth_client_factory({"BASIC_AUTH_PUBLIC_PATHS": "/"})
    health = client.get("/api/health")
    docs = client.get("/docs")
    assert health.status_code == 200
    assert docs.status_code == 200
