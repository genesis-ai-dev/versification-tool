"""HTTP contract tests for GET /api/resolve Required goldens and errors."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from frvt.api.config import get_settings
from frvt.api.models import MappingRecord, RelationType
from frvt.testops.fixtures.api_setup import (
    associate,
    create_translation,
    eng_org_resolve_context,
    ingest_primary_project,
    upload_ingredient_json,
)
from frvt.testops.fixtures.synthetic_schemes import (
    complex_left_ingredient,
    complex_right_ingredient,
    exclude_ingredient,
    gen_partial_ingredient,
    merge_ingredient,
    partial_ingredient,
    unequal_range_ingredient,
)
from frvt.testops.http_client import assert_error_envelope, basic_auth_header
from httpx import Response
from sqlalchemy import select
from sqlalchemy.orm import Session


def _auth() -> dict[str, str]:
    """Build HTTP Basic headers from settings."""
    return basic_auth_header()


def _resolve(
    api_client: TestClient,
    *,
    from_translation: str,
    to_translation: str,
    ref: str,
    from_versification: str | None = None,
    to_versification: str | None = None,
    part: str | None = None,
) -> Response:
    """Issue GET /api/resolve with the common query shape."""
    params: dict[str, str] = {
        "from_translation": from_translation,
        "to_translation": to_translation,
        "ref": ref,
    }
    if from_versification is not None:
        params["from_versification"] = from_versification
    if to_versification is not None:
        params["to_versification"] = to_versification
    if part is not None:
        params["part"] = part
    return api_client.get("/api/resolve", headers=_auth(), params=params)


def _seed_mapping(
    session: Session,
    scheme_id: str,
    *,
    source_ref: str,
    base_ref: str | None,
    relation: RelationType,
    ordinal: int = 0,
    part: str | None = None,
) -> None:
    """Insert one atomic mapping row for HTTP resolve fixture schemes."""
    session.add(
        MappingRecord(
            scheme_id=scheme_id,
            source_ref=source_ref,
            base_ref=base_ref,
            part=part,
            relation=relation,
            ordinal=ordinal,
        )
    )
    session.flush()


@pytest.fixture
def eng_org(api_client: TestClient) -> dict[str, str]:
    """Shared eng→org resolve pair built from the primary sample project."""
    return eng_org_resolve_context(api_client)


@pytest.mark.phase4
@pytest.mark.resolve
def test_identity_jhn_eng_to_org(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-RESOLVE-001: T1 identity: JHN 3:16 eng→org."""
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="JHN 3:16",
        from_versification=eng_org["eng_id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["relation"] == "one_to_one"
    assert body["source_spans"][0]["ref"] == "JHN 3:16"
    assert body["target_spans"][0]["ref"] == "JHN 3:16"
    assert body["edges"] == []


@pytest.mark.phase4
@pytest.mark.resolve
def test_psalm_title_shift(api_client: TestClient, eng_org: dict[str, str]) -> None:
    """TC-RESOLVE-002: T2 Psalm title shift: PSA 3:1."""
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="PSA 3:1",
        from_versification=eng_org["eng_id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["relation"] == "shift"
    assert body["target_spans"][0]["ref"] == "PSA 3:2"


@pytest.mark.phase4
@pytest.mark.resolve
def test_gen_chapter_boundary(api_client: TestClient, eng_org: dict[str, str]) -> None:
    """TC-RESOLVE-003: T3 chapter-boundary drift: GEN 31:55."""
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="GEN 31:55",
        from_versification=eng_org["eng_id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["target_spans"][0]["ref"] == "GEN 32:1"
    assert body["relation"] in {"shift", "renumber"}


@pytest.mark.phase4
@pytest.mark.resolve
def test_exclude_relation(api_client: TestClient, eng_org: dict[str, str]) -> None:
    """TC-RESOLVE-004: T4 exclude."""
    scheme = upload_ingredient_json(
        api_client, f"excl-{uuid4().hex[:8]}", exclude_ingredient()
    )
    associate(api_client, eng_org["translation_id"], scheme["id"])
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="GEN 1:1",
        from_versification=scheme["id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["relation"] == "exclude"
    assert body["target_spans"] == []


@pytest.mark.phase4
@pytest.mark.resolve
def test_merge_relation(
    api_client: TestClient, eng_org: dict[str, str], seeded_session: Session
) -> None:
    """TC-RESOLVE-005: T5 merge."""
    scheme = upload_ingredient_json(
        api_client, f"merge-{uuid4().hex[:8]}", merge_ingredient()
    )
    associate(api_client, eng_org["translation_id"], scheme["id"])
    _seed_mapping(
        seeded_session,
        scheme["id"],
        source_ref="GEN 1:1-2",
        base_ref="GEN 1:1",
        relation=RelationType.merge,
    )
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="GEN 1:1",
        from_versification=scheme["id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["relation"] == "merge"
    assert len(body["source_spans"]) > 1
    assert len(body["target_spans"]) == 1


@pytest.mark.phase4
@pytest.mark.resolve
def test_range_input_single_verse_outputs(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-RESOLVE-006: T6 range input PSA 3:0–2 yields single-verse outputs."""
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="PSA 3:0-2",
        from_versification=eng_org["eng_id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert all("-" not in span["ref"] for span in body["source_spans"])
    assert all("-" not in span["ref"] for span in body["target_spans"])


@pytest.mark.phase4
@pytest.mark.resolve
def test_complex_hull_with_edges(
    api_client: TestClient, seeded_session: Session
) -> None:
    """TC-RESOLVE-007: T11 complex hull with edges."""
    left_scheme = upload_ingredient_json(
        api_client, f"cx-l-{uuid4().hex[:8]}", complex_left_ingredient()
    )
    right_scheme = upload_ingredient_json(
        api_client, f"cx-r-{uuid4().hex[:8]}", complex_right_ingredient()
    )
    left = create_translation(api_client, name=f"CxL-{uuid4().hex[:8]}")
    right = create_translation(api_client, name=f"CxR-{uuid4().hex[:8]}")
    associate(api_client, left["id"], left_scheme["id"])
    associate(api_client, right["id"], right_scheme["id"])

    response = _resolve(
        api_client,
        from_translation=left["id"],
        to_translation=right["id"],
        ref="GEN 1:1",
        from_versification=left_scheme["id"],
        to_versification=right_scheme["id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["relation"] == "complex"
    assert len(body["source_spans"]) > 1
    assert len(body["target_spans"]) > 1
    assert body["edges"]
    assert all(edge.get("relation") for edge in body["edges"])


@pytest.mark.phase4
@pytest.mark.resolve
def test_partial_part_via_api(api_client: TestClient, eng_org: dict[str, str]) -> None:
    """TC-RESOLVE-008: T12 partial part via resolve API."""
    scheme = upload_ingredient_json(
        api_client, f"part-{uuid4().hex[:8]}", partial_ingredient()
    )
    associate(api_client, eng_org["translation_id"], scheme["id"])
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="SIR 36:13",
        part="a",
        from_versification=scheme["id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source_spans"][0].get("part") == "a"
    assert body["relation"] in {"partial", "one_to_one"}


@pytest.mark.phase4
@pytest.mark.resolve
def test_partial_attaches_whole_verse_seq(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """Partial resolve falls back to the whole-verse seq when no part row exists."""
    scheme = upload_ingredient_json(
        api_client,
        f"part-gen-{uuid4().hex[:8]}",
        gen_partial_ingredient(),
    )
    associate(api_client, eng_org["translation_id"], scheme["id"])
    target_ingest = ingest_primary_project(
        api_client,
        name=f"part-target-{uuid4().hex[:8]}",
    )
    target_translation_id = target_ingest["translation"]["id"]
    associate(api_client, target_translation_id, eng_org["org_id"])
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=target_translation_id,
        ref="GEN 1:1",
        part="a",
        from_versification=scheme["id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["relation"] == "partial"
    assert len(body["source_spans"]) == 1
    assert len(body["target_spans"]) == 1
    source = body["source_spans"][0]
    target = body["target_spans"][0]
    assert source["part"] == "a"
    assert target["part"] == "a"
    assert source["seq"] is not None
    assert target["seq"] is not None


@pytest.mark.phase4
@pytest.mark.resolve
def test_resolve_happy_path_structured_spans(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-RESOLVE-009: Resolve API happy path."""
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="JHN 3:16",
        from_versification=eng_org["eng_id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    span = body["source_spans"][0]
    assert span["book"] == "JHN"
    assert span["chapter"] == 3
    assert span["verse"] == 16
    assert "-" not in span["ref"]
    assert all("-" not in s["ref"] for s in body["target_spans"])


@pytest.mark.phase4
@pytest.mark.resolve
def test_override_does_not_mutate_preferred(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-RESOLVE-010: Per-request versification override does not mutate preferred."""
    # eng is preferred after associate; also associate org as non-preferred.
    associate(api_client, eng_org["translation_id"], eng_org["org_id"])
    before = api_client.get(
        f"/api/translations/{eng_org['translation_id']}/versifications",
        headers=_auth(),
    ).json()
    preferred_before = {row["scheme_id"]: row["preferred"] for row in before}

    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="JHN 3:16",
        from_versification=eng_org["org_id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text

    after = api_client.get(
        f"/api/translations/{eng_org['translation_id']}/versifications",
        headers=_auth(),
    ).json()
    preferred_after = {row["scheme_id"]: row["preferred"] for row in after}
    assert preferred_after == preferred_before


@pytest.mark.phase4
@pytest.mark.resolve
def test_well_formed_bcv_range_accepted(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-RESOLVE-011: Well-formed bcvRange accepted on the resolve API."""
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="JHN 3:16-18",
        from_versification=eng_org["eng_id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert [span["ref"] for span in body["source_spans"]] == [
        "JHN 3:16",
        "JHN 3:17",
        "JHN 3:18",
    ]


@pytest.mark.phase4
@pytest.mark.resolve
def test_unequal_length_range_zip_clamps(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-RESOLVE-013: Unequal-length range zip clamps (Interim)."""
    scheme = upload_ingredient_json(
        api_client, f"uneq-{uuid4().hex[:8]}", unequal_range_ingredient()
    )
    associate(api_client, eng_org["translation_id"], scheme["id"])
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="GEN 1:3",
        from_versification=scheme["id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["target_spans"]
    assert body["target_spans"][0]["ref"] == "GEN 1:2"


@pytest.mark.phase4
@pytest.mark.resolve
def test_identity_hop_without_covering_row(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-RESOLVE-014: Identity hop when no covering row exists."""
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="JHN 3:16",
        from_versification=eng_org["eng_id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    assert response.json()["relation"] == "one_to_one"


@pytest.mark.phase4
@pytest.mark.resolve
def test_part_in_ref_string_invalid(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-RESOLVE-020: Part embedded in a ref string is invalid."""
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="SIR 36:13a",
        from_versification=eng_org["eng_id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 400
    assert_error_envelope(response.json(), code="bad_request")


@pytest.mark.phase4
@pytest.mark.resolve
def test_cross_chapter_range_invalid(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-RESOLVE-021: Cross-chapter range input is invalid (Interim)."""
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="GEN 31:55-GEN 32:1",
        from_versification=eng_org["eng_id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 400
    assert_error_envelope(response.json(), code="bad_request")


@pytest.mark.phase4
@pytest.mark.resolve
def test_missing_translation_404(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-RESOLVE-022: Missing translation returns 404 before resolving."""
    response = _resolve(
        api_client,
        from_translation=str(uuid4()),
        to_translation=eng_org["org_translation_id"],
        ref="GEN 1:1",
    )
    assert response.status_code == 404
    assert_error_envelope(response.json(), code="not_found")


@pytest.mark.phase4
@pytest.mark.resolve
def test_override_not_associated_409(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-RESOLVE-023: Override scheme not associated returns 409."""
    response = _resolve(
        api_client,
        from_translation=eng_org["org_translation_id"],
        to_translation=eng_org["translation_id"],
        ref="GEN 1:1",
        from_versification=eng_org["eng_id"],
    )
    assert response.status_code == 409
    assert_error_envelope(response.json(), code="conflict")


@pytest.mark.phase4
@pytest.mark.resolve
def test_no_preferred_scheme_409(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-RESOLVE-024: No preferred scheme returns 409."""
    created = create_translation(api_client, name=f"NoPref-{uuid4().hex[:8]}")
    response = _resolve(
        api_client,
        from_translation=created["id"],
        to_translation=eng_org["org_translation_id"],
        ref="GEN 1:1",
    )
    assert response.status_code == 409
    assert_error_envelope(response.json(), code="conflict")


@pytest.mark.phase4
@pytest.mark.resolve
def test_no_shared_ancestor_422(
    api_client: TestClient, seeded_session: Session
) -> None:
    """TC-RESOLVE-025: T10 no shared ancestor returns 422."""
    from frvt.api.models import (
        Translation,
        TranslationVersification,
        VersificationScheme,
    )

    orphan_a = Translation(
        name=f"orphan-a-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    orphan_b = Translation(
        name=f"orphan-b-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    seeded_session.add_all([orphan_a, orphan_b])
    seeded_session.flush()
    scheme_a = VersificationScheme(
        name=f"scheme-a-{uuid4().hex[:8]}",
        based_on_name=None,
        based_on_id=None,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["1"]}},
    )
    scheme_b = VersificationScheme(
        name=f"scheme-b-{uuid4().hex[:8]}",
        based_on_name=None,
        based_on_id=None,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["1"]}},
    )
    seeded_session.add_all([scheme_a, scheme_b])
    seeded_session.flush()
    seeded_session.add_all(
        [
            TranslationVersification(
                translation_id=orphan_a.id, scheme_id=scheme_a.id, preferred=True
            ),
            TranslationVersification(
                translation_id=orphan_b.id, scheme_id=scheme_b.id, preferred=True
            ),
        ]
    )
    seeded_session.flush()

    response = _resolve(
        api_client,
        from_translation=str(orphan_a.id),
        to_translation=str(orphan_b.id),
        ref="GEN 1:1",
    )
    assert response.status_code == 422
    assert_error_envelope(response.json(), code="validation_failed")


@pytest.mark.phase4
@pytest.mark.resolve
def test_complex_never_stored(api_client: TestClient, seeded_session: Session) -> None:
    """TC-RESOLVE-027: complex relations are never stored."""
    left_scheme = upload_ingredient_json(
        api_client, f"cx2-l-{uuid4().hex[:8]}", complex_left_ingredient()
    )
    right_scheme = upload_ingredient_json(
        api_client, f"cx2-r-{uuid4().hex[:8]}", complex_right_ingredient()
    )
    left = create_translation(api_client, name=f"Cx2L-{uuid4().hex[:8]}")
    right = create_translation(api_client, name=f"Cx2R-{uuid4().hex[:8]}")
    associate(api_client, left["id"], left_scheme["id"])
    associate(api_client, right["id"], right_scheme["id"])

    response = _resolve(
        api_client,
        from_translation=left["id"],
        to_translation=right["id"],
        ref="GEN 1:1",
        from_versification=left_scheme["id"],
        to_versification=right_scheme["id"],
    )
    assert response.status_code == 200
    assert response.json()["relation"] == "complex"

    rows = seeded_session.scalars(select(MappingRecord)).all()
    assert all(
        (row.relation.value if hasattr(row.relation, "value") else str(row.relation))
        != "complex"
        for row in rows
    )


@pytest.mark.phase4
@pytest.mark.resolve
def test_verse_end_before_start_invalid(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """TC-RESOLVE-028: verse_end before verse_start is invalid."""
    response = _resolve(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        ref="PSA 3:8-0",
        from_versification=eng_org["eng_id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 400
    assert_error_envelope(response.json(), code="bad_request")


@pytest.mark.phase4
@pytest.mark.server
def test_resolve_pivots_not_in_body(
    api_client: TestClient,
    seeded_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """TC-SERVER-013: Resolve pivot diagnostics stay out of the response body."""
    settings = get_settings()
    monkeypatch.setattr(settings, "resolve_trace_pivots", True)

    left_scheme = upload_ingredient_json(
        api_client, f"pv-l-{uuid4().hex[:8]}", complex_left_ingredient()
    )
    right_scheme = upload_ingredient_json(
        api_client, f"pv-r-{uuid4().hex[:8]}", complex_right_ingredient()
    )
    left = create_translation(api_client, name=f"PvL-{uuid4().hex[:8]}")
    right = create_translation(api_client, name=f"PvR-{uuid4().hex[:8]}")
    associate(api_client, left["id"], left_scheme["id"])
    associate(api_client, right["id"], right_scheme["id"])

    response = _resolve(
        api_client,
        from_translation=left["id"],
        to_translation=right["id"],
        ref="GEN 1:1",
        from_versification=left_scheme["id"],
        to_versification=right_scheme["id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["relation"] == "complex"
    assert "pivots" not in body
    assert "diagnostics" not in body
    assert "trace" not in body
    # Allowed response keys stay within the ResolveResult contract.
    assert set(body.keys()) <= {
        "source_spans",
        "target_spans",
        "relation",
        "edges",
    }
