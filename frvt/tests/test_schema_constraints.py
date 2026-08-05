"""Database constraint smoke tests for the core relational schema."""

from __future__ import annotations

import uuid

import pytest
from frvt.api.models import (
    RelationType,
    Translation,
    TranslationVersification,
    VerseSpan,
    VersificationScheme,
)
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session


def test_duplicate_case_insensitive_name_rejected(db_session: Session) -> None:
    """Case-insensitive unique index rejects a second translation with the same name."""
    db_session.add(Translation(name="Alpha", language="en", source_format="usx"))
    db_session.flush()
    db_session.add(Translation(name="alpha", language="en", source_format="usx"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_duplicate_preferred_association_rejected(db_session: Session) -> None:
    """Partial unique index allows only one preferred scheme per translation."""
    translation = Translation(name="Beta", language="en", source_format="usx")
    scheme_a = VersificationScheme(
        name="scheme-a",
        based_on_name=None,
        based_on_id=None,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["1"]}},
    )
    scheme_b = VersificationScheme(
        name="scheme-b",
        based_on_name=None,
        based_on_id=None,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["1"]}},
    )
    db_session.add_all([translation, scheme_a, scheme_b])
    db_session.flush()
    db_session.add(
        TranslationVersification(
            translation_id=translation.id,
            scheme_id=scheme_a.id,
            preferred=True,
        )
    )
    db_session.flush()
    db_session.add(
        TranslationVersification(
            translation_id=translation.id,
            scheme_id=scheme_b.id,
            preferred=True,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_invalid_translation_source_format_rejected(db_session: Session) -> None:
    """The database rejects provenance formats outside the closed vocabulary."""
    db_session.add(Translation(name="Format", language="en", source_format="txt"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_invalid_verse_coordinates_rejected(db_session: Session) -> None:
    """The database rejects malformed book ids and negative scripture coordinates."""
    translation = Translation(name="Coords", language="en", source_format="usx")
    db_session.add(translation)
    db_session.flush()
    db_session.add(
        VerseSpan(
            translation_id=translation.id,
            seq=0,
            book="BAD!",
            chapter=0,
            verse=-1,
            part=None,
            content="invalid",
        )
    )
    with pytest.raises((DataError, IntegrityError, ValueError)):
        db_session.flush()


def test_smoke_insert_mapping_record(db_session: Session) -> None:
    """A minimal scheme plus mapping row inserts cleanly inside the rollback session."""
    scheme = VersificationScheme(
        id=uuid.uuid4(),
        name="smoke",
        based_on_name="org",
        based_on_id=None,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["31"]}, "mappedVerses": {}},
    )
    db_session.add(scheme)
    db_session.flush()
    from frvt.api.models import MappingRecord

    db_session.add(
        MappingRecord(
            scheme_id=scheme.id,
            source_ref="GEN 31:55",
            base_ref="GEN 32:1",
            part=None,
            relation=RelationType.renumber,
            ordinal=0,
        )
    )
    db_session.flush()
    assert db_session.get(VersificationScheme, scheme.id) is not None
