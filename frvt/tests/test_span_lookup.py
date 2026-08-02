"""Tests for stored-span lookup including combined-milestone coverage."""

from __future__ import annotations

from uuid import uuid4

import pytest
from frvt.api.models import Translation, VerseSpan
from frvt.api.ports.span_lookup import find_stored_span
from sqlalchemy.orm import Session


@pytest.mark.phase6
def test_find_stored_span_exact_and_covering(db_session: Session) -> None:
    """Coverage lookup returns the combined-milestone anchor span."""
    translation = Translation(
        name=f"span_lookup_{uuid4().hex[:8]}",
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
        book="JHN",
        chapter=4,
        verse=1,
        part=None,
        verse_label="1,2",
        verse_range="JHN 4:1-2",
        content="Combined text",
    )
    discrete = VerseSpan(
        translation_id=translation.id,
        seq=1,
        book="JHN",
        chapter=4,
        verse=3,
        part=None,
        verse_label=None,
        verse_range=None,
        content="Verse three",
    )
    db_session.add_all([combined, discrete])
    db_session.flush()

    assert find_stored_span(
        db_session,
        translation.id,
        book="JHN",
        chapter=4,
        verse=1,
        part=None,
    ) is combined
    assert find_stored_span(
        db_session,
        translation.id,
        book="JHN",
        chapter=4,
        verse=2,
        part=None,
    ) is combined
    assert find_stored_span(
        db_session,
        translation.id,
        book="JHN",
        chapter=4,
        verse=3,
        part=None,
    ) is discrete
    assert find_stored_span(
        db_session,
        translation.id,
        book="JHN",
        chapter=4,
        verse=99,
        part=None,
    ) is None
