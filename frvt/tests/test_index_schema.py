"""Database constraint and cascade tests for the translation index tables."""

from __future__ import annotations

import uuid

import pytest
from frvt.api.models import (
    IndexMapping,
    Translation,
    TranslationIndex,
    VersificationScheme,
)
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

pytestmark = [pytest.mark.phase6, pytest.mark.resolve]


def _index_exists(session: Session, index_id: uuid.UUID) -> bool:
    """Ask the database whether an index row survives, bypassing the identity map.

    ``Session.get`` would answer from cached state, and refreshing a row deleted
    by a database cascade raises rather than returning ``None``.
    """
    session.expunge_all()
    found = session.scalar(
        select(TranslationIndex.id).where(TranslationIndex.id == index_id)
    )
    return found is not None


def _translation(session: Session, name: str) -> Translation:
    """Insert and flush a bare translation for index fixtures."""
    row = Translation(name=name, language="en", source_format="usx")
    session.add(row)
    session.flush()
    return row


def _scheme(session: Session, name: str) -> VersificationScheme:
    """Insert and flush a root scheme for index fixtures."""
    row = VersificationScheme(
        name=name,
        based_on_name=None,
        based_on_id=None,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["1"]}},
    )
    session.add(row)
    session.flush()
    return row


def test_duplicate_index_pair_rejected(db_session: Session) -> None:
    """A translation/versification combination may only be indexed once."""
    translation = _translation(db_session, "Index-Dup")
    scheme = _scheme(db_session, "index-dup-scheme")
    db_session.add(TranslationIndex(translation_id=translation.id, scheme_id=scheme.id))
    db_session.flush()
    db_session.add(TranslationIndex(translation_id=translation.id, scheme_id=scheme.id))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_invalid_index_status_rejected(db_session: Session) -> None:
    """The check constraint keeps the lifecycle vocabulary closed."""
    translation = _translation(db_session, "Index-Status")
    scheme = _scheme(db_session, "index-status-scheme")
    db_session.add(
        TranslationIndex(
            translation_id=translation.id,
            scheme_id=scheme.id,
            status="halfway",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_duplicate_mapping_key_rejected(db_session: Session) -> None:
    """The composite primary key rejects a second row for the same pair and ref."""
    source_id = uuid.uuid4()
    target_id = uuid.uuid4()
    db_session.add(
        IndexMapping(
            source_index_id=source_id,
            target_index_id=target_id,
            source_ref="GEN 1:1",
            payload={"relation": "one_to_one"},
        )
    )
    db_session.flush()
    db_session.add(
        IndexMapping(
            source_index_id=source_id,
            target_index_id=target_id,
            source_ref="GEN 1:1",
            payload={"relation": "shift"},
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_deleting_translation_removes_its_indexes(db_session: Session) -> None:
    """Acceptance criterion 3.2: removing a translation removes its indexes."""
    translation = _translation(db_session, "Index-Cascade-Translation")
    scheme = _scheme(db_session, "index-cascade-translation-scheme")
    index_row = TranslationIndex(translation_id=translation.id, scheme_id=scheme.id)
    db_session.add(index_row)
    db_session.flush()
    index_id = index_row.id

    db_session.delete(translation)
    db_session.flush()

    assert not _index_exists(db_session, index_id)


def test_deleting_scheme_removes_its_indexes(db_session: Session) -> None:
    """Acceptance criterion 3.2: removing a versification removes its indexes."""
    translation = _translation(db_session, "Index-Cascade-Scheme")
    scheme = _scheme(db_session, "index-cascade-scheme")
    index_row = TranslationIndex(translation_id=translation.id, scheme_id=scheme.id)
    db_session.add(index_row)
    db_session.flush()
    index_id = index_row.id

    db_session.delete(scheme)
    db_session.flush()

    assert not _index_exists(db_session, index_id)


def test_mapping_rows_survive_index_delete(db_session: Session) -> None:
    """Mapping rows are orphaned rather than cascaded, so deletes stay cheap."""
    translation = _translation(db_session, "Index-Orphan")
    scheme = _scheme(db_session, "index-orphan-scheme")
    index_row = TranslationIndex(translation_id=translation.id, scheme_id=scheme.id)
    db_session.add(index_row)
    db_session.flush()
    index_id = index_row.id
    db_session.add(
        IndexMapping(
            source_index_id=index_id,
            target_index_id=uuid.uuid4(),
            source_ref="GEN 1:1",
            payload={"relation": "one_to_one"},
        )
    )
    db_session.flush()

    db_session.delete(index_row)
    db_session.flush()

    remaining = db_session.scalars(
        select(IndexMapping).where(IndexMapping.source_index_id == index_id)
    ).all()
    assert len(remaining) == 1
