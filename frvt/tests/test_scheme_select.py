"""Tests for preferred-scheme selection and the batch org fallback."""

from __future__ import annotations

from uuid import uuid4

import pytest
from frvt.api.errors import AppError
from frvt.api.models import Translation, TranslationVersification, VersificationScheme
from frvt.api.scheme_select import batch_scheme_ref, org_scheme_ref, selected_scheme_ref
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def _canonical_scheme(session: Session, name: str) -> VersificationScheme:
    """Load a bootstrapped canonical scheme by lowercase name."""
    scheme = session.scalar(
        select(VersificationScheme).where(
            func.lower(VersificationScheme.name) == name.lower(),
            VersificationScheme.canonical.is_(True),
        )
    )
    assert scheme is not None
    return scheme


def _new_translation(session: Session) -> Translation:
    """Insert a metadata-only translation with no associations."""
    translation = Translation(
        name=f"SchemeSelect-{uuid4().hex[:8]}",
        language="en",
        source_format="usx",
        is_anchor=False,
    )
    session.add(translation)
    session.flush()
    return translation


@pytest.mark.phase6
@pytest.mark.resolve
def test_batch_scheme_ref_uses_preferred(seeded_session: Session) -> None:
    """A preferred association is selected when no override is given."""
    translation = _new_translation(seeded_session)
    eng = _canonical_scheme(seeded_session, "eng")
    seeded_session.add(
        TranslationVersification(
            translation_id=translation.id,
            scheme_id=eng.id,
            preferred=True,
        )
    )
    seeded_session.flush()
    selected = batch_scheme_ref(seeded_session, translation.id, None)
    assert selected.scheme_id == eng.id


@pytest.mark.phase6
@pytest.mark.resolve
def test_batch_scheme_ref_falls_back_to_org(seeded_session: Session) -> None:
    """No association resolves to the canonical org scheme."""
    translation = _new_translation(seeded_session)
    selected = batch_scheme_ref(seeded_session, translation.id, None)
    assert selected.scheme_id == org_scheme_ref(seeded_session).scheme_id


@pytest.mark.phase6
@pytest.mark.resolve
def test_batch_scheme_ref_honors_associated_override(seeded_session: Session) -> None:
    """An associated override wins over the preferred scheme."""
    translation = _new_translation(seeded_session)
    eng = _canonical_scheme(seeded_session, "eng")
    org = _canonical_scheme(seeded_session, "org")
    seeded_session.add_all(
        [
            TranslationVersification(
                translation_id=translation.id,
                scheme_id=eng.id,
                preferred=True,
            ),
            TranslationVersification(
                translation_id=translation.id,
                scheme_id=org.id,
                preferred=False,
            ),
        ]
    )
    seeded_session.flush()
    selected = batch_scheme_ref(seeded_session, translation.id, org.id)
    assert selected.scheme_id == org.id


@pytest.mark.phase6
@pytest.mark.resolve
def test_batch_scheme_ref_unassociated_override_409(seeded_session: Session) -> None:
    """An override that is not associated still raises 409."""
    translation = _new_translation(seeded_session)
    eng = _canonical_scheme(seeded_session, "eng")
    with pytest.raises(AppError) as raised:
        batch_scheme_ref(seeded_session, translation.id, eng.id)
    assert raised.value.status_code == 409


@pytest.mark.phase6
@pytest.mark.resolve
def test_selected_scheme_ref_still_409_without_preferred(
    seeded_session: Session,
) -> None:
    """Existing selector still raises 409 when there is no preferred scheme."""
    translation = _new_translation(seeded_session)
    with pytest.raises(AppError) as raised:
        selected_scheme_ref(seeded_session, translation.id, None)
    assert raised.value.status_code == 409
