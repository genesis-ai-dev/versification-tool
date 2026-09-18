"""Equivalence tests for the preloaded span finder versus database lookup."""

from __future__ import annotations

from uuid import uuid4

import pytest
from frvt.api.models import Translation, VerseSpan
from frvt.api.ports.span_lookup import find_stored_span, preloaded_span_finder
from sqlalchemy.orm import Session

pytestmark = [pytest.mark.phase6, pytest.mark.resolve]


def _span_id(span: VerseSpan | None) -> object:
    """Compare spans by primary key so preloaded and live rows match."""
    return None if span is None else span.id


def test_preloaded_finder_matches_database_lookup(db_session: Session) -> None:
    """Exact hits, part fallback, verse 0, covering milestones, and misses agree."""
    translation = Translation(
        name=f"span_finder_{uuid4().hex[:8]}",
        language="eng",
        text_direction="ltr",
        source_format="usx",
        is_anchor=False,
    )
    db_session.add(translation)
    db_session.flush()

    combined = VerseSpan(
        translation_id=translation.id,
        seq=0,
        book="GEN",
        chapter=1,
        verse=1,
        part=None,
        verse_label="1-2",
        verse_range="GEN 1:1-2",
        content="Combined",
    )
    titled = VerseSpan(
        translation_id=translation.id,
        seq=1,
        book="PSA",
        chapter=3,
        verse=0,
        part=None,
        content="Title",
    )
    whole = VerseSpan(
        translation_id=translation.id,
        seq=2,
        book="GEN",
        chapter=2,
        verse=1,
        part=None,
        content="Whole",
    )
    partial = VerseSpan(
        translation_id=translation.id,
        seq=3,
        book="GEN",
        chapter=2,
        verse=1,
        part="a",
        content="Part a",
    )
    db_session.add_all([combined, titled, whole, partial])
    db_session.flush()

    finder = preloaded_span_finder(db_session, translation.id)
    probes: list[tuple[str, int, int, str | None]] = [
        ("GEN", 1, 1, None),
        ("GEN", 1, 2, None),
        ("PSA", 3, 0, None),
        ("GEN", 2, 1, None),
        ("GEN", 2, 1, "a"),
        ("GEN", 2, 1, "b"),
        ("GEN", 9, 9, None),
        ("EXO", 1, 1, None),
    ]
    for book, chapter, verse, part in probes:
        live = find_stored_span(
            db_session,
            translation.id,
            book=book,
            chapter=chapter,
            verse=verse,
            part=part,
        )
        cached = finder(
            translation.id,
            book=book,
            chapter=chapter,
            verse=verse,
            part=part,
        )
        assert _span_id(cached) == _span_id(live)


def test_preloaded_finder_survives_commit(db_session: Session) -> None:
    """Chunk commits must not expire preloaded spans out from under a build."""
    translation = Translation(
        name=f"span_finder_commit_{uuid4().hex[:8]}",
        language="eng",
        text_direction="ltr",
        source_format="usx",
        is_anchor=False,
    )
    db_session.add(translation)
    db_session.flush()
    stored = VerseSpan(
        translation_id=translation.id,
        seq=0,
        book="GEN",
        chapter=1,
        verse=1,
        part=None,
        content="One",
    )
    db_session.add(stored)
    db_session.flush()
    finder = preloaded_span_finder(db_session, translation.id)
    db_session.commit()
    cached = finder(translation.id, book="GEN", chapter=1, verse=1, part=None)
    assert cached is not None
    assert cached.id == stored.id
    assert cached.verse_label is None
