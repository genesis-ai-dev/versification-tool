"""Tests that batch resolve uses ready indexes with identical results."""

from __future__ import annotations

from uuid import uuid4

import pytest
from frvt.api.indexing.registry import create_index
from frvt.api.indexing.worker import process_next_index
from frvt.api.models import (
    INDEX_STATUS_PENDING,
    Translation,
    TranslationIndex,
    TranslationVersification,
    VersificationScheme,
)
from frvt.api.resolve_batch import BatchTarget, resolve_verse_set
from frvt.testops.fixtures.api_setup import insert_verse_span
from sqlalchemy import func, select
from sqlalchemy.orm import Session

pytestmark = [pytest.mark.phase6, pytest.mark.resolve]


def _canonical(session: Session, name: str) -> VersificationScheme:
    """Load a bootstrapped canonical scheme by lowercase name."""
    scheme = session.scalar(
        select(VersificationScheme).where(
            func.lower(VersificationScheme.name) == name.lower(),
            VersificationScheme.canonical.is_(True),
        )
    )
    assert scheme is not None
    return scheme


def _ready_pair(session: Session) -> tuple[TranslationIndex, TranslationIndex]:
    """Build two org-indexed translations with GEN 1:1 and return ready indexes."""
    org = _canonical(session, "org")
    indexes: list[TranslationIndex] = []
    for _ in range(2):
        translation = Translation(
            name=f"IdxRead-{uuid4().hex[:8]}",
            language="en",
            source_format="usx",
            is_anchor=False,
        )
        session.add(translation)
        session.flush()
        session.add(
            TranslationVersification(
                translation_id=translation.id, scheme_id=org.id, preferred=True
            )
        )
        insert_verse_span(session, translation.id, book="GEN", chapter=1, verse=1)
        insert_verse_span(session, translation.id, book="GEN", chapter=1, verse=2)
        indexes.append(create_index(session, translation_id=translation.id))
    assert process_next_index(session, chunk_size=50)
    assert process_next_index(session, chunk_size=50)
    first = session.get(TranslationIndex, indexes[0].id)
    second = session.get(TranslationIndex, indexes[1].id)
    assert first is not None and second is not None
    return first, second


def test_indexed_batch_matches_live_results(seeded_session: Session) -> None:
    """Index-backed entries equal live-resolved entries for the same refs."""
    first, second = _ready_pair(seeded_session)
    target = BatchTarget(
        from_translation=first.translation_id,
        to_translation=second.translation_id,
    )
    indexed = resolve_verse_set(seeded_session, target, ["GEN 1:1", "GEN 1:2"])
    assert indexed.index_used is True
    first.status = INDEX_STATUS_PENDING
    seeded_session.flush()
    live = resolve_verse_set(seeded_session, target, ["GEN 1:1", "GEN 1:2"])
    assert live.index_used is False
    assert len(indexed.items) == len(live.items)
    for left, right in zip(indexed.items, live.items, strict=True):
        assert left.ref == right.ref
        assert left.result == right.result
        assert left.error == right.error


def test_index_used_false_when_either_side_not_ready(seeded_session: Session) -> None:
    """The read path ignores a pair unless both indexes are ready."""
    first, second = _ready_pair(seeded_session)
    second.status = INDEX_STATUS_PENDING
    seeded_session.flush()
    result = resolve_verse_set(
        seeded_session,
        BatchTarget(
            from_translation=first.translation_id,
            to_translation=second.translation_id,
        ),
        ["GEN 1:1"],
    )
    assert result.index_used is False


def test_range_ref_falls_back_inside_an_indexed_pair(seeded_session: Session) -> None:
    """A multi-verse ref is resolved live while siblings can still use the index."""
    first, second = _ready_pair(seeded_session)
    result = resolve_verse_set(
        seeded_session,
        BatchTarget(
            from_translation=first.translation_id,
            to_translation=second.translation_id,
        ),
        ["GEN 1:1-2", "GEN 1:1"],
    )
    assert result.index_used is True
    assert len(result.items) == 2
    assert result.items[0].result is not None
    assert result.items[1].result is not None
