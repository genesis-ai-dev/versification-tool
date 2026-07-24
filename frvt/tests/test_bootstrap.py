"""Contract tests for canonical bootstrap seeding."""

from __future__ import annotations

from frvt.api.bootstrap import seed_canonical
from frvt.api.models import (
    MappingRecord,
    Translation,
    TranslationVersification,
    VersificationScheme,
)
from frvt.resources import CANONICAL_NAMES
from sqlalchemy import func, select
from sqlalchemy.orm import Session


def test_seed_idempotent_and_complete(db_session: Session) -> None:
    """Seeding twice creates six anchors, schemes, preferred assocs, and mappings."""
    seed_canonical(db_session)
    db_session.flush()
    seed_canonical(db_session)
    db_session.flush()

    anchors = db_session.scalars(
        select(Translation).where(Translation.is_anchor.is_(True))
    ).all()
    assert {a.name.lower() for a in anchors} == set(CANONICAL_NAMES)
    assert len(anchors) == len(CANONICAL_NAMES)

    org = next(a for a in anchors if a.name.lower() == "org")
    for anchor in anchors:
        assocs = db_session.scalars(
            select(TranslationVersification).where(
                TranslationVersification.translation_id == anchor.id,
                TranslationVersification.preferred.is_(True),
            )
        ).all()
        assert len(assocs) == 1
        scheme = assocs[0].scheme
        assert scheme.canonical is True
        if anchor.name.lower() == "org":
            assert scheme.based_on_id is None
        else:
            assert scheme.based_on_id == org.id
        mapping_count = db_session.scalar(
            select(func.count())
            .select_from(MappingRecord)
            .where(MappingRecord.scheme_id == scheme.id)
        )
        # org may have few mapped rows; eng and others should have derived rows.
        assert mapping_count is not None
        if anchor.name.lower() == "eng":
            assert int(mapping_count) > 0


def test_seed_restores_canonical_preference(db_session: Session) -> None:
    """A restart restores an anchor's canonical scheme after preference drift."""
    seed_canonical(db_session)
    org = db_session.scalar(select(Translation).where(Translation.name == "org"))
    assert org is not None
    canonical_assoc = db_session.scalar(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == org.id,
            TranslationVersification.preferred.is_(True),
        )
    )
    assert canonical_assoc is not None
    alternate = VersificationScheme(
        name="temporary-org",
        based_on_name=None,
        based_on_id=None,
        canonical=False,
        ingredient={"maxVerses": {"GEN": ["31"]}},
    )
    db_session.add(alternate)
    db_session.flush()
    canonical_assoc.preferred = False
    db_session.flush()
    db_session.add(
        TranslationVersification(
            translation_id=org.id,
            scheme_id=alternate.id,
            preferred=True,
        )
    )
    db_session.flush()

    seed_canonical(db_session)
    db_session.flush()

    restored = db_session.scalar(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == org.id,
            TranslationVersification.preferred.is_(True),
        )
    )
    assert restored is not None
    assert restored.scheme.canonical is True
