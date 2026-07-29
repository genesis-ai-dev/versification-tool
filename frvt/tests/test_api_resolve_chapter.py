"""HTTP contract tests for GET /api/resolve/chapter."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from frvt.api.models import MappingRecord, RelationType, VerseSpan
from frvt.api.resolve_chapter import alignment_fingerprint
from frvt.testops.fixtures.api_setup import (
    associate,
    eng_org_resolve_context,
    upload_ingredient_json,
)
from frvt.testops.fixtures.synthetic_schemes import (
    merge_ingredient,
    unequal_range_ingredient,
)
from frvt.testops.http_client import assert_error_envelope, basic_auth_header
from httpx import Response
from sqlalchemy import select
from sqlalchemy.orm import Session


def _auth() -> dict[str, str]:
    """Build HTTP Basic headers from settings."""
    return basic_auth_header()


def _resolve_chapter(
    api_client: TestClient,
    *,
    from_translation: str,
    to_translation: str,
    book: str,
    chapter: int,
    from_versification: str | None = None,
    to_versification: str | None = None,
) -> Response:
    """Issue GET /api/resolve/chapter with the common query shape."""
    params: dict[str, str | int] = {
        "from_translation": from_translation,
        "to_translation": to_translation,
        "book": book,
        "chapter": chapter,
    }
    if from_versification is not None:
        params["from_versification"] = from_versification
    if to_versification is not None:
        params["to_versification"] = to_versification
    return api_client.get("/api/resolve/chapter", headers=_auth(), params=params)


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
def test_chapter_resolve_happy_path(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """Multiple stored verses yield unique alignment items."""
    response = _resolve_chapter(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        book="JHN",
        chapter=3,
        from_versification=eng_org["eng_id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == len(body["items"])
    assert body["total"] >= 1


@pytest.mark.phase4
@pytest.mark.resolve
def test_chapter_resolve_merge_emit_once(
    api_client: TestClient, eng_org: dict[str, str], seeded_session: Session
) -> None:
    """Merge hull appears once when member verses are walked separately."""
    scheme = upload_ingredient_json(
        api_client, f"merge-ch-{uuid4().hex[:8]}", merge_ingredient()
    )
    associate(api_client, eng_org["translation_id"], scheme["id"])
    _seed_mapping(
        seeded_session,
        scheme["id"],
        source_ref="GEN 1:1-2",
        base_ref="GEN 1:1",
        relation=RelationType.merge,
    )
    response = _resolve_chapter(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        book="GEN",
        chapter=1,
        from_versification=scheme["id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    merge_items = [item for item in body["items"] if item["relation"] == "merge"]
    assert len(merge_items) == 1
    assert len(merge_items[0]["source_spans"]) > 1


@pytest.mark.phase4
@pytest.mark.resolve
def test_chapter_resolve_uses_stored_verse_spans_only(
    api_client: TestClient, eng_org: dict[str, str], seeded_session: Session
) -> None:
    """Enumeration follows ``verse_span`` rows, not navigation metadata."""
    translation_id = eng_org["translation_id"]
    verses = seeded_session.scalars(
        select(VerseSpan.verse).where(
            VerseSpan.translation_id == translation_id,
            VerseSpan.book == "GEN",
            VerseSpan.chapter == 1,
            VerseSpan.part.is_(None),
        )
    ).all()
    assert len(verses) >= 1

    response = _resolve_chapter(
        api_client,
        from_translation=translation_id,
        to_translation=eng_org["org_translation_id"],
        book="GEN",
        chapter=1,
        from_versification=eng_org["eng_id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == len(body["items"])
    assert body["total"] <= len(verses)


@pytest.mark.phase4
@pytest.mark.resolve
def test_chapter_resolve_missing_translation_404(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """Missing translation id returns the standard not_found envelope."""
    response = _resolve_chapter(
        api_client,
        from_translation=str(uuid4()),
        to_translation=eng_org["org_translation_id"],
        book="GEN",
        chapter=1,
    )
    assert response.status_code == 404
    assert_error_envelope(response.json(), code="not_found")


@pytest.mark.phase4
@pytest.mark.resolve
def test_alignment_fingerprint_stable_for_same_hull() -> None:
    """Fingerprint helper treats identical hulls as equal keys."""
    from frvt.api.schemas import RelationType, ResolvedSpan, ResolveResult

    span_a = ResolvedSpan(
        ref="GEN 1:1", book="GEN", chapter=1, verse=1, seq=1, part=None
    )
    span_b = ResolvedSpan(
        ref="GEN 1:2", book="GEN", chapter=1, verse=2, seq=2, part=None
    )
    target = ResolvedSpan(
        ref="GEN 1:1", book="GEN", chapter=1, verse=1, seq=3, part=None
    )
    first = ResolveResult(
        source_spans=[span_a, span_b],
        target_spans=[target],
        relation=RelationType.merge,
    )
    second = ResolveResult(
        source_spans=[span_b, span_a],
        target_spans=[target],
        relation=RelationType.merge,
    )
    assert alignment_fingerprint(first) == alignment_fingerprint(second)


@pytest.mark.phase4
@pytest.mark.resolve
def test_chapter_resolve_range_emit_once(
    api_client: TestClient, eng_org: dict[str, str]
) -> None:
    """Unequal range hull appears once when member verses are walked separately."""
    scheme = upload_ingredient_json(
        api_client, f"range-ch-{uuid4().hex[:8]}", unequal_range_ingredient()
    )
    associate(api_client, eng_org["translation_id"], scheme["id"])
    response = _resolve_chapter(
        api_client,
        from_translation=eng_org["translation_id"],
        to_translation=eng_org["org_translation_id"],
        book="GEN",
        chapter=1,
        from_versification=scheme["id"],
        to_versification=eng_org["org_id"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    range_items = [item for item in body["items"] if item["relation"] == "range"]
    assert len(range_items) == 1
    assert len(range_items[0]["source_spans"]) == 3
    assert len(range_items[0]["target_spans"]) == 2


@pytest.mark.phase4
@pytest.mark.resolve
def test_alignment_fingerprint_includes_axis_fields() -> None:
    """Fingerprint helper distinguishes complex hulls by axis summary fields."""
    from frvt.api.schemas import RelationType, ResolvedSpan, ResolveResult

    span_a = ResolvedSpan(
        ref="GEN 1:1", book="GEN", chapter=1, verse=1, seq=1, part=None
    )
    span_b = ResolvedSpan(
        ref="GEN 1:10", book="GEN", chapter=1, verse=10, seq=2, part=None
    )
    target = ResolvedSpan(
        ref="GEN 1:1", book="GEN", chapter=1, verse=1, seq=3, part=None
    )
    merge_axis = ResolveResult(
        source_spans=[span_a, span_b],
        target_spans=[target],
        relation=RelationType.complex,
        source_rel=RelationType.merge,
        target_rel=RelationType.split,
    )
    split_axis = ResolveResult(
        source_spans=[span_a, span_b],
        target_spans=[target],
        relation=RelationType.complex,
        source_rel=RelationType.split,
        target_rel=RelationType.merge,
    )
    assert alignment_fingerprint(merge_axis) != alignment_fingerprint(split_axis)
