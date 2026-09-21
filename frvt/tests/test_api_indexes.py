"""HTTP wiring tests for translation index routes.

Handlers delegate to the registry; those contracts live in
``test_index_registry.py``. This module covers only what is invisible below
HTTP: route declaration order and the auth gate.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from frvt.testops.http_client import assert_error_envelope, basic_auth_header

pytestmark = [pytest.mark.phase2, pytest.mark.api]


def test_usage_path_is_not_parsed_as_an_id(api_client: TestClient) -> None:
    """GET /api/indexes/usage must not try to parse 'usage' as a UUID."""
    response = api_client.get("/api/indexes/usage", headers=basic_auth_header())
    assert response.status_code == 200
    assert "total_indexes" in response.json()


def test_index_routes_require_auth(api_client: TestClient) -> None:
    """Unauthenticated callers receive 401 with the uniform envelope."""
    response = api_client.get("/api/indexes")
    assert response.status_code == 401
    assert_error_envelope(response.json(), code="unauthorized")
