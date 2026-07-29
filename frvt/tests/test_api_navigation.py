"""HTTP contract tests for navigation, deltas, and misalignments."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from frvt.api.models import VerseSpan
from frvt.api.routers.navigation import navigation_target
from frvt.api.usx_book_order import usx_book_sort_key
from frvt.testops.fixtures.api_setup import (
    associate,
    complementary_psalm_context,
    create_translation,
    eng_org_resolve_context,
    upload_ingredient_json,
)
from frvt.testops.fixtures.synthetic_schemes import gen_partial_ingredient
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
def test_navigation_tree_from_stored_spans(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-NAV-001: Navigation tree built from stored spans only."""
    response = api_client.get(
        f"/api/translations/{eng_org['translation_id']}/navigation",
        headers=_auth(),
        params={"versification": eng_org["eng_id"]},
    )
    assert response.status_code == 200, response.text
    books = response.json()
    assert isinstance(books, list)
    assert any(book["book"] == "GEN" and 1 in book["chapters"] for book in books)
    codes = [book["book"] for book in books]
    # USX Bible order (not alphabetical): GEN before EXO before PSA before MAT.
    for earlier, later in (
        ("GEN", "EXO"),
        ("EXO", "PSA"),
        ("PSA", "MAT"),
        ("MAT", "MRK"),
    ):
        assert earlier in codes and later in codes
        assert codes.index(earlier) < codes.index(later)


@pytest.mark.phase5
@pytest.mark.nav
def test_navigation_omits_scheme_books_without_spans(
    api_client: TestClient, eng_org: dict[str, str], seeded_session: Session
) -> None:
    """TC-NAV-001 subset: full-canon scheme does not pad empty books into nav."""
    bare = create_translation(api_client, name=f"NavSpansOnly-{uuid4().hex[:8]}")
    associate(api_client, bare["id"], eng_org["eng_id"])
    seeded_session.add(
        VerseSpan(
            translation_id=UUID(bare["id"]),
            seq=0,
            book="MAT",
            chapter=1,
            verse=1,
            part=None,
            content="Subset navigation fixture",
        )
    )
    seeded_session.flush()

    response = api_client.get(
        f"/api/translations/{bare['id']}/navigation",
        headers=_auth(),
        params={"versification": eng_org["eng_id"]},
    )
    assert response.status_code == 200, response.text
    books = response.json()
    codes = [book["book"] for book in books]
    assert codes == ["MAT"]
    assert books[0]["chapters"] == [1]
    assert "GEN" not in codes



@pytest.mark.phase5
@pytest.mark.nav
def test_deltas_paginated_ordered_by_source_bcv(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-NAV-002: Deltas are paginated and ordered by source starting BCV."""
    response = api_client.get(
        "/api/resolve/deltas",
        headers=_auth(),
        params={
            "from_translation": eng_org["translation_id"],
            "to_translation": eng_org["org_translation_id"],
            "from_versification": eng_org["eng_id"],
            "to_versification": eng_org["org_id"],
            "limit": 100,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "items" in body and "total" in body
    assert body["items"]
    assert body["total"] >= len(body["items"])

    def bcv_key(item: dict) -> tuple:
        nav = item["navigation"]
        book_index, book_code = usx_book_sort_key(nav["book"])
        return (
            book_index,
            book_code,
            nav["chapter"],
            nav["verse"],
            nav.get("part") or "",
            item["source_ref"],
            item["relation"],
        )

    keys = [bcv_key(item) for item in body["items"]]
    assert keys == sorted(keys)
    # Range lower-bound navigation (e.g. PSA 3:0-8 → PSA 3:0) drives order.
    ranged = next(
        (item for item in body["items"] if "-" in item["source_ref"]),
        None,
    )
    if ranged is not None:
        assert ranged["navigation_ref"] == ranged["source_ref"].split("-", 1)[0]
        assert "-" not in ranged["navigation_ref"]


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


@pytest.mark.phase5
@pytest.mark.nav
def test_jump_menu_keeps_identity_locus_partial(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-NAV-013: Partial rows stay visible in Jump in both directions."""
    partial_scheme = upload_ingredient_json(
        api_client,
        f"jump-partial-{uuid4().hex[:8]}",
        gen_partial_ingredient(),
    )
    associate(api_client, eng_org["translation_id"], partial_scheme["id"])

    directions = (
        (
            "partial-to-org",
            eng_org["translation_id"],
            eng_org["org_translation_id"],
            partial_scheme["id"],
            eng_org["org_id"],
        ),
        (
            "org-to-partial",
            eng_org["org_translation_id"],
            eng_org["translation_id"],
            eng_org["org_id"],
            partial_scheme["id"],
        ),
    )
    expected_navigation = {
        "book": "GEN",
        "chapter": 1,
        "verse": 1,
        "part": "a",
    }

    for (
        direction,
        from_translation,
        to_translation,
        from_versification,
        to_versification,
    ) in directions:
        response = api_client.get(
            "/api/resolve/jump-menu",
            headers=_auth(),
            params={
                "from_translation": from_translation,
                "to_translation": to_translation,
                "from_versification": from_versification,
                "to_versification": to_versification,
                "book": "GEN",
                "limit": 20,
            },
        )
        assert response.status_code == 200, f"{direction}: {response.text}"
        body = response.json()

        delta = next(
            (
                item
                for item in body["deltas"]["items"]
                if item["relation"] == "partial"
            ),
            None,
        )
        assert delta is not None, f"{direction}: partial delta missing"
        assert delta["source_ref"] == "GEN 1:1"
        assert delta["base_ref"] == "GEN 1:1"
        assert delta["navigation_ref"] == "GEN 1:1"
        assert delta["navigation"] == expected_navigation

        misalignment = next(
            (
                item
                for item in body["misalignments"]["items"]
                if item["relation"] == "partial"
            ),
            None,
        )
        assert misalignment is not None, f"{direction}: partial misalignment missing"
        assert misalignment["category"] == "other"
        assert misalignment["source_ref"] == "GEN 1:1"
        assert misalignment["navigation_ref"] == "GEN 1:1"
        assert misalignment["navigation"] == expected_navigation


@pytest.fixture
def complementary_psalm(api_client: TestClient) -> dict[str, str]:
    """Two org-based psalm schemes that cancel on resolve for most PSA deltas."""
    return complementary_psalm_context(api_client)


@pytest.mark.phase5
@pytest.mark.nav
def test_deltas_hide_canceling_complementary_psalm_rows(
    api_client: TestClient, complementary_psalm: dict[str, str]
) -> None:
    """TC-NAV-013: Cancel filter omits complementary psalm deltas with same BCV."""
    headers = _auth()
    base_params = {
        "from_translation": complementary_psalm["translation_id"],
        "to_translation": complementary_psalm["org_translation_id"],
        "from_versification": complementary_psalm["style_a_id"],
        "to_versification": complementary_psalm["style_b_id"],
        "book": "PSA",
        "limit": 100,
    }
    response = api_client.get(
        "/api/resolve/deltas",
        headers=headers,
        params=base_params,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    nav_refs = {item["navigation_ref"] for item in body["items"]}
    assert "PSA 3:1" not in nav_refs
    assert body["total"] < 8

    non_psa = api_client.get(
        "/api/resolve/deltas",
        headers=headers,
        params={**base_params, "book": "1SA", "limit": 20},
    )
    assert non_psa.status_code == 200, non_psa.text
    non_psa_items = non_psa.json()["items"]
    assert any(item["navigation_ref"] == "1SA 20:42" for item in non_psa_items)


@pytest.mark.phase5
@pytest.mark.nav
def test_misalignments_hide_canceling_complementary_psalm_rows(
    api_client: TestClient, complementary_psalm: dict[str, str]
) -> None:
    """TC-NAV-013: Cancel filter omits complementary psalm misalignments."""
    headers = _auth()
    base_params = {
        "from_translation": complementary_psalm["translation_id"],
        "to_translation": complementary_psalm["org_translation_id"],
        "from_versification": complementary_psalm["style_a_id"],
        "to_versification": complementary_psalm["style_b_id"],
        "limit": 100,
    }
    all_items = api_client.get(
        "/api/resolve/misalignments",
        headers=headers,
        params=base_params,
    )
    assert all_items.status_code == 200, all_items.text
    psalm_nav_refs = {
        item["navigation_ref"]
        for item in all_items.json()["items"]
        if item["source_ref"].startswith("PSA ")
    }
    assert "PSA 3:1" not in psalm_nav_refs

    filtered = api_client.get(
        "/api/resolve/misalignments",
        headers=headers,
        params={**base_params, "category": "chapter_boundary"},
    )
    assert filtered.status_code == 200, filtered.text
    assert all(
        item["category"] == "chapter_boundary" for item in filtered.json()["items"]
    )
    assert any(
        item["navigation_ref"] == "GEN 31:55" for item in filtered.json()["items"]
    )
