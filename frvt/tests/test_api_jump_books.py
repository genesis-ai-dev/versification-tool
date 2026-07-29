"""Unit and HTTP contract tests for jump-books summary."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from frvt.api.jump_books import jump_difference_books
from frvt.api.routers.navigation import JumpMapping
from frvt.api.usx_book_order import usx_book_sort_key
from frvt.testops.fixtures.api_setup import (
    complementary_psalm_context,
    eng_org_resolve_context,
)
from frvt.testops.http_client import assert_error_envelope, basic_auth_header


def _auth() -> dict[str, str]:
    """Build HTTP Basic headers from settings."""
    return basic_auth_header()


@pytest.mark.phase5
@pytest.mark.nav
def test_jump_difference_books_dedupes_and_sorts() -> None:
    """Pure collector returns USX-sorted distinct books from navigation targets."""
    rows = [
        JumpMapping("PSA 3:0-8", "PSA 3:1-9", None, "shift", "eng"),
        JumpMapping("PSA 62:1-12", "PSA 62:1-11", None, "shift", "eng"),
        JumpMapping("GEN 31:55", "GEN 32:1", None, "shift", "eng"),
    ]
    assert jump_difference_books(rows) == ["GEN", "PSA"]
    assert jump_difference_books([]) == []


@pytest.mark.phase5
@pytest.mark.nav
def test_jump_difference_books_skips_unparseable_rows() -> None:
    """Unparseable source refs are omitted, matching jump-menu sort fallbacks."""
    rows = [
        JumpMapping("PSA 1:1", "PSA 1:1", None, "shift", "eng"),
        JumpMapping("NOT A REF", None, None, "shift", "eng"),
    ]
    assert jump_difference_books(rows) == ["PSA"]


@pytest.fixture
def eng_org(api_client: TestClient) -> dict[str, str]:
    """Shared eng→org pair with ingested spans for navigation fixtures."""
    return eng_org_resolve_context(api_client)


@pytest.mark.phase5
@pytest.mark.nav
def test_jump_books_lists_books_with_differences(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-NAV-014: Happy path returns USX-sorted books with jump differences."""
    response = api_client.get(
        "/api/resolve/jump-books",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "from_versification": eng_org["eng_id"],
            "to_versification": eng_org["org_id"],
        },
    )
    assert response.status_code == 200, response.text
    books = response.json()["books"]
    assert "PSA" in books
    assert books == sorted(books, key=usx_book_sort_key)

    deltas = api_client.get(
        "/api/resolve/deltas",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "from_versification": eng_org["eng_id"],
            "to_versification": eng_org["org_id"],
            "limit": 500,
        },
    ).json()["items"]
    delta_books = {item["navigation"]["book"] for item in deltas}
    assert set(books) >= delta_books


@pytest.mark.phase5
@pytest.mark.nav
def test_jump_books_empty_when_schemes_match(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """Identical selected schemes yield an empty book list."""
    response = api_client.get(
        "/api/resolve/jump-books",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["translation_id"],
            "from_versification": eng_org["eng_id"],
            "to_versification": eng_org["eng_id"],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["books"] == []


@pytest.mark.phase5
@pytest.mark.nav
def test_jump_books_share_resolve_override_errors(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-NAV-014: Jump-books shares 404/409 pre-checks with deltas."""
    missing = uuid4()
    not_found = api_client.get(
        "/api/resolve/jump-books",
        headers=_auth(),
        params={
            "from_translation": missing,
            "to_translation": eng_org["org_translation_id"],
        },
    )
    assert not_found.status_code == 404
    assert_error_envelope(not_found.json(), code="not_found")

    conflict = api_client.get(
        "/api/resolve/jump-books",
        headers=_auth(),
        params={
            "from_translation": eng_org["org_translation_id"],
            "to_translation": eng_org["translation_id"],
            "from_versification": eng_org["eng_id"],
        },
    )
    assert conflict.status_code == 409
    assert_error_envelope(conflict.json(), code="conflict")


@pytest.fixture
def complementary_psalm(api_client: TestClient) -> dict[str, str]:
    """Two org-based psalm schemes that cancel on resolve for most PSA deltas."""
    return complementary_psalm_context(api_client)


@pytest.mark.phase5
@pytest.mark.nav
def test_jump_books_respects_cancel_filter(
    api_client: TestClient, complementary_psalm: dict[str, str]
) -> None:
    """Cancel-filtered books match the deltas projection for complementary psalms."""
    params = {
        "from_translation": complementary_psalm["translation_id"],
        "to_translation": complementary_psalm["org_translation_id"],
        "from_versification": complementary_psalm["style_a_id"],
        "to_versification": complementary_psalm["style_b_id"],
    }
    books = api_client.get(
        "/api/resolve/jump-books", headers=_auth(), params=params
    ).json()["books"]
    deltas = api_client.get(
        "/api/resolve/deltas",
        headers=_auth(),
        params={**params, "limit": 500},
    ).json()["items"]
    delta_books = {item["navigation"]["book"] for item in deltas}
    assert set(books) == delta_books
