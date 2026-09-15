"""Tests for stored-range expansion used by batch resolve."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from frvt.api.errors import AppError
from frvt.api.models import Translation, TranslationVersification, VersificationScheme
from frvt.api.resolve_batch import (
    BatchTarget,
    expand_stored_range,
    resolve_verse_range,
    resolve_verse_set,
)
from frvt.api.scheme_select import org_scheme_ref
from frvt.testops.fixtures.api_setup import (
    associate,
    canonical_scheme_ids,
    create_translation,
    insert_verse_span,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def _seed_range_spans(session: Session, translation_id: str) -> None:
    """Insert GEN/EXO/PSA spans covering the expansion cases below."""
    insert_verse_span(
        session,
        translation_id,
        book="GEN",
        chapter=1,
        verse=1,
        verse_label="1-2",
        verse_range="GEN 1:1-2",
    )
    insert_verse_span(session, translation_id, book="GEN", chapter=1, verse=3)
    for verse in (1, 2, 3, 4):
        insert_verse_span(session, translation_id, book="GEN", chapter=2, verse=verse)
    insert_verse_span(
        session,
        translation_id,
        book="GEN",
        chapter=2,
        verse=3,
        part="a",
        content="[part]",
    )
    for verse in (1, 2, 3):
        insert_verse_span(session, translation_id, book="GEN", chapter=3, verse=verse)
    insert_verse_span(session, translation_id, book="GEN", chapter=4, verse=1)
    for verse in (1, 2, 3):
        insert_verse_span(session, translation_id, book="EXO", chapter=1, verse=verse)
    insert_verse_span(session, translation_id, book="PSA", chapter=3, verse=0)


@pytest.fixture
def range_translation(
    api_client: TestClient, seeded_session: Session
) -> tuple[UUID, Session]:
    """Translation with the GEN/EXO/PSA fixture spans."""
    created = create_translation(api_client)
    _seed_range_spans(seeded_session, created["id"])
    return UUID(created["id"]), seeded_session


@pytest.mark.phase6
@pytest.mark.resolve
def test_expand_whole_book(range_translation: tuple[UUID, Session]) -> None:
    """GEN to GEN returns every covered whole verse of that book in order."""
    translation_id, session = range_translation
    refs = expand_stored_range(session, translation_id, from_ref="GEN", to_ref="GEN")
    assert refs == [
        "GEN 1:1",
        "GEN 1:2",
        "GEN 1:3",
        "GEN 2:1",
        "GEN 2:2",
        "GEN 2:3",
        "GEN 2:4",
        "GEN 3:1",
        "GEN 3:2",
        "GEN 3:3",
        "GEN 4:1",
    ]


@pytest.mark.phase6
@pytest.mark.resolve
def test_expand_chapter_bounds(range_translation: tuple[UUID, Session]) -> None:
    """GEN 2 to GEN 3 excludes chapters 1 and 4."""
    translation_id, session = range_translation
    refs = expand_stored_range(
        session, translation_id, from_ref="GEN 2", to_ref="GEN 3"
    )
    assert refs[0] == "GEN 2:1"
    assert refs[-1] == "GEN 3:3"
    assert all(ref.startswith("GEN 2:") or ref.startswith("GEN 3:") for ref in refs)
    assert "GEN 1:3" not in refs
    assert "GEN 4:1" not in refs


@pytest.mark.phase6
@pytest.mark.resolve
def test_expand_verse_bounds(range_translation: tuple[UUID, Session]) -> None:
    """GEN 2:3 to GEN 3:2 includes both endpoints and excludes neighbors."""
    translation_id, session = range_translation
    refs = expand_stored_range(
        session, translation_id, from_ref="GEN 2:3", to_ref="GEN 3:2"
    )
    assert refs[0] == "GEN 2:3"
    assert refs[-1] == "GEN 3:2"
    assert "GEN 2:2" not in refs
    assert "GEN 3:3" not in refs


@pytest.mark.phase6
@pytest.mark.resolve
def test_expand_cross_book(range_translation: tuple[UUID, Session]) -> None:
    """A window that crosses GEN into EXO lists EXO after GEN in USX order."""
    translation_id, session = range_translation
    refs = expand_stored_range(
        session, translation_id, from_ref="GEN 4:1", to_ref="EXO 1:2"
    )
    assert refs == ["GEN 4:1", "EXO 1:1", "EXO 1:2"]


@pytest.mark.phase6
@pytest.mark.resolve
def test_expand_combined_milestone(range_translation: tuple[UUID, Session]) -> None:
    """A GEN 1:1-2 milestone yields both constituent verses."""
    translation_id, session = range_translation
    refs = expand_stored_range(
        session, translation_id, from_ref="GEN 1", to_ref="GEN 1"
    )
    assert "GEN 1:1" in refs
    assert "GEN 1:2" in refs


@pytest.mark.phase6
@pytest.mark.resolve
def test_combined_milestone_constituents_share_result(
    range_translation: tuple[UUID, Session],
) -> None:
    """Constituents of a combined milestone resolve through the stored anchor."""
    translation_id, session = range_translation
    org = _org_translation(session)
    out = resolve_verse_range(
        session,
        _target(translation_id, org.id),
        from_ref="GEN 1",
        to_ref="GEN 1",
    )
    by_ref = {item.ref: item for item in out.items}
    first = by_ref["GEN 1:1"]
    second = by_ref["GEN 1:2"]
    assert first.error is None and first.result is not None
    assert second.error is None and second.result is not None
    assert first.result == second.result
    sibling = by_ref["GEN 1:3"]
    assert sibling.result is not None
    assert sibling.result != first.result


@pytest.mark.phase6
@pytest.mark.resolve
def test_expand_ignores_part_duplicate(range_translation: tuple[UUID, Session]) -> None:
    """A non-null part row does not add a second entry for the same verse."""
    translation_id, session = range_translation
    refs = expand_stored_range(
        session, translation_id, from_ref="GEN 2", to_ref="GEN 2"
    )
    assert refs.count("GEN 2:3") == 1


@pytest.mark.phase6
@pytest.mark.resolve
def test_expand_includes_verse_zero(range_translation: tuple[UUID, Session]) -> None:
    """Psalm-title verse 0 is included when it falls inside the window."""
    translation_id, session = range_translation
    refs = expand_stored_range(session, translation_id, from_ref="PSA", to_ref="PSA")
    assert refs == ["PSA 3:0"]


@pytest.mark.phase6
@pytest.mark.resolve
def test_expand_empty_window(range_translation: tuple[UUID, Session]) -> None:
    """A window with no stored verses returns an empty list."""
    translation_id, session = range_translation
    refs = expand_stored_range(
        session, translation_id, from_ref="GEN 50", to_ref="GEN 50"
    )
    assert refs == []


@pytest.mark.phase6
@pytest.mark.resolve
def test_expand_metadata_only_translation(
    api_client: TestClient, seeded_session: Session
) -> None:
    """A translation with no spans expands to an empty list."""
    created = create_translation(api_client)
    refs = expand_stored_range(
        seeded_session,
        UUID(created["id"]),
        from_ref="GEN",
        to_ref="GEN",
    )
    assert refs == []


def _org_translation(session: Session) -> Translation:
    """Load the canonical org anchor translation."""
    translation = session.scalar(
        select(Translation).where(func.lower(Translation.name) == "org")
    )
    assert translation is not None
    return translation


def _target(
    from_translation: UUID,
    to_translation: UUID,
    *,
    from_versification: UUID | None = None,
    to_versification: UUID | None = None,
) -> BatchTarget:
    """Build a ``BatchTarget`` for driver tests."""
    return BatchTarget(
        from_translation=from_translation,
        to_translation=to_translation,
        from_versification=from_versification,
        to_versification=to_versification,
    )


@pytest.mark.phase6
@pytest.mark.resolve
def test_verse_set_preserves_order_and_duplicates(
    range_translation: tuple[UUID, Session],
) -> None:
    """Set results follow request order and keep duplicated refs."""
    translation_id, session = range_translation
    org = _org_translation(session)
    out = resolve_verse_set(
        session,
        _target(translation_id, org.id),
        ["GEN 1:3", "GEN 2:1", "GEN 1:3"],
    )
    assert [item.ref for item in out.items] == ["GEN 1:3", "GEN 2:1", "GEN 1:3"]
    assert all(item.result is not None and item.error is None for item in out.items)


@pytest.mark.phase6
@pytest.mark.resolve
def test_verse_set_malformed_member_is_entry_error(
    range_translation: tuple[UUID, Session],
) -> None:
    """A malformed ref becomes an entry error; siblings still resolve."""
    translation_id, session = range_translation
    org = _org_translation(session)
    out = resolve_verse_set(
        session,
        _target(translation_id, org.id),
        ["GEN 1:3", "GEN 1:1a"],
    )
    assert len(out.items) == 2
    assert out.items[0].result is not None
    assert out.items[0].error is None
    assert out.items[1].result is None
    assert out.items[1].error is not None
    assert out.items[1].error.code == "bad_request"


@pytest.mark.phase6
@pytest.mark.resolve
def test_verse_set_accepts_same_chapter_range(
    range_translation: tuple[UUID, Session],
) -> None:
    """A same-chapter range string in refs resolves rather than erroring."""
    translation_id, session = range_translation
    org = _org_translation(session)
    out = resolve_verse_set(
        session,
        _target(translation_id, org.id),
        ["GEN 1:1-3"],
    )
    assert len(out.items) == 1
    assert out.items[0].error is None
    assert out.items[0].result is not None


@pytest.mark.phase6
@pytest.mark.resolve
def test_verse_range_limit_offset(
    range_translation: tuple[UUID, Session],
) -> None:
    """limit/offset slice the expansion while total reports the full size."""
    translation_id, session = range_translation
    org = _org_translation(session)
    full = expand_stored_range(session, translation_id, from_ref="GEN", to_ref="GEN")
    out = resolve_verse_range(
        session,
        _target(translation_id, org.id),
        from_ref="GEN",
        to_ref="GEN",
        limit=3,
        offset=2,
    )
    assert out.total == len(full)
    assert [item.ref for item in out.items] == full[2:5]


@pytest.mark.phase6
@pytest.mark.resolve
def test_verse_set_echoes_preferred_scheme(
    api_client: TestClient, range_translation: tuple[UUID, Session]
) -> None:
    """A preferred association is echoed when no override is given."""
    translation_id, session = range_translation
    org = _org_translation(session)
    eng_id = UUID(canonical_scheme_ids(api_client)["eng"])
    associate(api_client, str(translation_id), str(eng_id))
    out = resolve_verse_set(
        session,
        _target(translation_id, org.id),
        ["GEN 1:3"],
    )
    assert out.from_versification == eng_id


@pytest.mark.phase6
@pytest.mark.resolve
def test_verse_set_falls_back_to_org(
    range_translation: tuple[UUID, Session],
) -> None:
    """No preferred association echoes the canonical org scheme id."""
    translation_id, session = range_translation
    org = _org_translation(session)
    out = resolve_verse_set(
        session,
        _target(translation_id, org.id),
        ["GEN 1:3"],
    )
    assert out.from_versification == org_scheme_ref(session).scheme_id


@pytest.mark.phase6
@pytest.mark.resolve
def test_verse_set_no_shared_ancestor_422(seeded_session: Session) -> None:
    """Chain failure is a single request-level 422, not per-entry errors."""
    orphan_a = Translation(
        name=f"batch-orphan-a-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    orphan_b = Translation(
        name=f"batch-orphan-b-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    seeded_session.add_all([orphan_a, orphan_b])
    seeded_session.flush()
    scheme_a = VersificationScheme(
        name=f"batch-scheme-a-{uuid4().hex[:8]}",
        based_on_name=None,
        based_on_id=None,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["1"]}},
    )
    scheme_b = VersificationScheme(
        name=f"batch-scheme-b-{uuid4().hex[:8]}",
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
    with pytest.raises(AppError) as raised:
        resolve_verse_set(
            seeded_session,
            _target(orphan_a.id, orphan_b.id),
            ["GEN 1:1"],
        )
    assert raised.value.status_code == 422
