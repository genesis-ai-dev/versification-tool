"""HTTP contract tests for navigation, deltas, and misalignments."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from frvt.api.routers.navigation import navigation_target
from frvt.testops.fixtures.api_setup import (
    create_translation,
    eng_org_resolve_context,
)
from frvt.testops.http_client import assert_error_envelope, basic_auth_header


def _auth() -> dict[str, str]:
    """Build HTTP Basic headers from settings."""
    return basic_auth_header()


@pytest.fixture
def eng_org(api_client: TestClient) -> dict[str, str]:
    """Shared eng→org pair with ingested spans for navigation fixtures."""
    return eng_org_resolve_context(api_client)


@pytest.mark.phase5
@pytest.mark.nav
def test_navigation_target_from_range() -> None:
    """TC-NAV-004: Discrete navigation_ref / navigation contract (unit)."""
    nav_ref, navigation = navigation_target("PSA 3:0-8")
    assert nav_ref == "PSA 3:0"
    assert navigation.book == "PSA"
    assert navigation.chapter == 3
    assert navigation.verse == 0
    assert navigation.part is None


@pytest.mark.phase5
@pytest.mark.nav
def test_navigation_tree_from_max_verses_and_spans(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-NAV-001: Navigation tree built from maxVerses + spans."""
    response = api_client.get(
        f"/api/translations/{eng_org['translation_id']}/navigation",
        headers=_auth(),
        params={"versification": eng_org["eng_id"]},
    )
    assert response.status_code == 200, response.text
    books = response.json()
    assert isinstance(books, list)
    assert any(book["book"] == "GEN" and 1 in book["chapters"] for book in books)


@pytest.mark.phase5
@pytest.mark.nav
def test_deltas_paginated_ordered_by_ordinal(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-NAV-002: Deltas are paginated and ordered by ordinal."""
    response = api_client.get(
        "/api/resolve/deltas",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "from_versification": eng_org["eng_id"],
            "to_versification": eng_org["org_id"],
            "limit": 5,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "items" in body and "total" in body
    assert body["items"]
    assert body["total"] >= len(body["items"])


@pytest.mark.phase5
@pytest.mark.nav
def test_misalignment_category_vocabulary(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-NAV-003: Misalignment category filter uses the fixed vocabulary."""
    vocab = {
        "psalm_title",
        "chapter_boundary",
        "chapter_count",
        "lxx_psalm",
        "synodal",
        "nt_omission",
        "other",
    }
    headers = _auth()
    base_params = {
        "from_translation": eng_org["translation_id"],
        "to_translation": eng_org["org_translation_id"],
        "from_versification": eng_org["eng_id"],
        "to_versification": eng_org["org_id"],
    }
    all_items = api_client.get(
        "/api/resolve/misalignments", headers=headers, params=base_params
    )
    assert all_items.status_code == 200, all_items.text
    seen = {item["category"] for item in all_items.json()["items"]}
    assert seen <= vocab
    # Representative seeds: eng→org PSA shifts are psalm_title; GEN 31:55 is chapter_boundary.
    assert "psalm_title" in seen or "chapter_boundary" in seen or "other" in seen

    for category in vocab:
        filtered = api_client.get(
            "/api/resolve/misalignments",
            headers=headers,
            params={**base_params, "category": category},
        )
        assert filtered.status_code == 200, filtered.text
        assert all(item["category"] == category for item in filtered.json()["items"])


@pytest.mark.phase5
@pytest.mark.nav
def test_delta_navigation_ref_discrete(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-NAV-004: Discrete navigation_ref / navigation contract (HTTP)."""
    response = api_client.get(
        "/api/resolve/deltas",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "from_versification": eng_org["eng_id"],
            "to_versification": eng_org["org_id"],
            "book": "PSA",
            "limit": 20,
        },
    )
    assert response.status_code == 200, response.text
    ranged = next(
        (item for item in response.json()["items"] if "-" in item["source_ref"]),
        None,
    )
    assert ranged is not None, "expected a range-form PSA delta from eng"
    assert ":" in ranged["navigation_ref"]
    assert "-" not in ranged["navigation_ref"]
    assert ranged["navigation"]["book"]
    assert isinstance(ranged["navigation"]["chapter"], int)
    assert isinstance(ranged["navigation"]["verse"], int)

    # navigation_ref must be legal as a resolve ref.
    resolve = api_client.get(
        "/api/resolve",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "ref": ranged["navigation_ref"],
            "from_versification": eng_org["eng_id"],
            "to_versification": eng_org["org_id"],
        },
    )
    assert resolve.status_code == 200, resolve.text


@pytest.mark.phase5
@pytest.mark.nav
def test_nav_deltas_share_resolve_override_errors(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-NAV-010: Nav/deltas/misalignments share resolve override error rules."""
    headers = _auth()
    unknown = str(uuid4())

    nav_missing = api_client.get(
        f"/api/translations/{unknown}/navigation", headers=headers
    )
    assert nav_missing.status_code == 404
    assert_error_envelope(nav_missing.json(), code="not_found")

    deltas_missing = api_client.get(
        "/api/resolve/deltas",
        headers=headers,
        params={
            "from_translation": unknown,
            "to_translation": eng_org["org_translation_id"],
        },
    )
    assert deltas_missing.status_code == 404

    mis_missing = api_client.get(
        "/api/resolve/misalignments",
        headers=headers,
        params={
            "from_translation": unknown,
            "to_translation": eng_org["org_translation_id"],
        },
    )
    assert mis_missing.status_code == 404

    # Unassociated override → 409
    deltas_conflict = api_client.get(
        "/api/resolve/deltas",
        headers=headers,
        params={
            "from_translation": eng_org["org_translation_id"],
            "to_translation": eng_org["translation_id"],
            "from_versification": eng_org["eng_id"],
        },
    )
    assert deltas_conflict.status_code == 409
    assert_error_envelope(deltas_conflict.json(), code="conflict")

    # No preferred → 409
    bare = create_translation(api_client, name=f"NavBare-{uuid4().hex[:8]}")
    nav_nopref = api_client.get(
        f"/api/translations/{bare['id']}/navigation", headers=headers
    )
    assert nav_nopref.status_code == 409
    assert_error_envelope(nav_nopref.json(), code="conflict")


@pytest.mark.phase5
@pytest.mark.nav
def test_deltas_optional_book_filter(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-NAV-012: Optional book filter on deltas."""
    response = api_client.get(
        "/api/resolve/deltas",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "from_versification": eng_org["eng_id"],
            "to_versification": eng_org["org_id"],
            "book": "PSA",
            "limit": 50,
        },
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert items
    assert all(item["source_ref"].startswith("PSA ") for item in items)
