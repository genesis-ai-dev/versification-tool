"""Tests for index invalidation, removal, and default-versification retargeting."""

from __future__ import annotations

from uuid import uuid4

import pytest
from frvt.api.indexing.invalidation import (
    drop_indexes_for_scheme,
    drop_indexes_for_translation,
    invalidate_for_translation,
    retarget_default_indexes,
)
from frvt.api.indexing.registry import create_index
from frvt.api.models import (
    INDEX_STATUS_PENDING,
    INDEX_STATUS_READY,
    IndexReclaim,
    Translation,
    TranslationIndex,
    TranslationVersification,
    VersificationScheme,
)
from frvt.api.schemas import TranslationUpdate
from frvt.api.scheme_select import org_scheme_ref
from sqlalchemy import func, select
from sqlalchemy.orm import Session

pytestmark = [pytest.mark.phase6, pytest.mark.resolve]


def _translation(session: Session) -> Translation:
    """Insert a metadata-only translation."""
    row = Translation(
        name=f"IdxInv-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    session.add(row)
    session.flush()
    return row


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


def test_invalidate_for_translation_requeues(seeded_session: Session) -> None:
    """Content changes return the index to the pending queue."""
    translation = _translation(seeded_session)
    index = create_index(seeded_session, translation_id=translation.id)
    index.status = INDEX_STATUS_READY
    seeded_session.flush()
    assert invalidate_for_translation(
        seeded_session, translation.id, reason="translation updated"
    )
    row = seeded_session.get(TranslationIndex, index.id)
    assert row is not None
    assert row.status == INDEX_STATUS_PENDING
    assert row.pending_reason == "translation updated"


def test_drop_indexes_for_translation_queues_reclaim(seeded_session: Session) -> None:
    """Removing a translation's indexes records them for mapping cleanup."""
    translation = _translation(seeded_session)
    index = create_index(seeded_session, translation_id=translation.id)
    index_id = index.id
    assert drop_indexes_for_translation(seeded_session, translation.id) == 1
    assert seeded_session.get(TranslationIndex, index_id) is None
    assert seeded_session.get(IndexReclaim, index_id) is not None


def test_drop_indexes_for_scheme_removes_rows(seeded_session: Session) -> None:
    """Removing a versification drops indexes that used it."""
    translation = _translation(seeded_session)
    index = create_index(seeded_session, translation_id=translation.id)
    scheme_id = index.scheme_id
    index_id = index.id
    assert drop_indexes_for_scheme(seeded_session, scheme_id) == 1
    assert seeded_session.get(TranslationIndex, index_id) is None


def test_retarget_moves_default_index(seeded_session: Session) -> None:
    """A defaulted index follows a change of preferred versification."""
    translation = _translation(seeded_session)
    eng = _canonical(seeded_session, "eng")
    org = _canonical(seeded_session, "org")
    seeded_session.add(
        TranslationVersification(
            translation_id=translation.id, scheme_id=org.id, preferred=True
        )
    )
    seeded_session.flush()
    index = create_index(seeded_session, translation_id=translation.id)
    assert index.scheme_explicit is False
    assert index.scheme_id == org.id
    for row in seeded_session.scalars(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == translation.id
        )
    ).all():
        row.preferred = False
    seeded_session.flush()
    seeded_session.add(
        TranslationVersification(
            translation_id=translation.id, scheme_id=eng.id, preferred=True
        )
    )
    seeded_session.flush()
    assert retarget_default_indexes(seeded_session, translation.id) == 1
    row = seeded_session.get(TranslationIndex, index.id)
    assert row is not None
    assert row.scheme_id == eng.id
    assert row.pending_reason == "preferred versification changed"


def test_retarget_skips_explicit_index(seeded_session: Session) -> None:
    """An explicitly pinned index does not follow preferred-scheme changes."""
    translation = _translation(seeded_session)
    org = _canonical(seeded_session, "org")
    seeded_session.add(
        TranslationVersification(
            translation_id=translation.id, scheme_id=org.id, preferred=True
        )
    )
    seeded_session.flush()
    index = create_index(
        seeded_session, translation_id=translation.id, scheme_id=org.id
    )
    assert index.scheme_explicit is True
    assert retarget_default_indexes(seeded_session, translation.id) == 0
    row = seeded_session.get(TranslationIndex, index.id)
    assert row is not None
    assert row.scheme_id == org.id


def test_retarget_collision_leaves_index_and_notes(seeded_session: Session) -> None:
    """A colliding retarget does not delete either index."""
    translation = _translation(seeded_session)
    eng = _canonical(seeded_session, "eng")
    org_id = org_scheme_ref(seeded_session).scheme_id
    seeded_session.add_all(
        [
            TranslationVersification(
                translation_id=translation.id, scheme_id=org_id, preferred=True
            ),
            TranslationVersification(
                translation_id=translation.id, scheme_id=eng.id, preferred=False
            ),
        ]
    )
    seeded_session.flush()
    explicit = create_index(
        seeded_session, translation_id=translation.id, scheme_id=eng.id
    )
    defaulted = create_index(seeded_session, translation_id=translation.id)
    assert defaulted.scheme_id == org_id
    for assoc in seeded_session.scalars(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == translation.id
        )
    ).all():
        assoc.preferred = False
    seeded_session.flush()
    eng_assoc = seeded_session.scalar(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == translation.id,
            TranslationVersification.scheme_id == eng.id,
        )
    )
    assert eng_assoc is not None
    eng_assoc.preferred = True
    seeded_session.flush()
    assert retarget_default_indexes(seeded_session, translation.id) == 0
    row = seeded_session.get(TranslationIndex, defaulted.id)
    assert row is not None
    assert row.scheme_id == org_id
    assert row.build_notes is not None
    assert seeded_session.get(TranslationIndex, explicit.id) is not None


def test_update_translation_hook_requeues(seeded_session: Session) -> None:
    """Renaming a translation invalidates its indexes through the router hook."""
    from frvt.api.routers.translations import update_translation

    translation = _translation(seeded_session)
    index = create_index(seeded_session, translation_id=translation.id)
    index.status = INDEX_STATUS_READY
    seeded_session.flush()
    update_translation(
        translation.id,
        TranslationUpdate(name=f"Renamed-{uuid4().hex[:8]}"),
        seeded_session,
    )
    row = seeded_session.get(TranslationIndex, index.id)
    assert row is not None
    assert row.status == INDEX_STATUS_PENDING
    assert row.pending_reason == "translation updated"
