"""Idempotent seeding of canonical numbering-space anchors and schemes."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, insert, select
from sqlalchemy.orm import Session

from frvt.api.logging_config import get_logger
from frvt.api.models import (
    MappingRecord,
    RelationType,
    Translation,
    TranslationVersification,
    VersificationScheme,
)
from frvt.ingest.derive_mappings import derive_mapping_records
from frvt.ingest.normalize import normalize_ingredient
from frvt.ingest.types import ParsedScheme
from frvt.resources import CANONICAL_NAMES, load_canonical_ingredient

logger = get_logger(__name__)


def _find_translation_ci(session: Session, name: str) -> Translation | None:
    """Return an existing translation whose name matches ``name`` case-insensitively."""
    logger.trace("Looking up translation name=%s", name)  # type: ignore[attr-defined]
    return session.scalar(
        select(Translation).where(func.lower(Translation.name) == name.lower())
    )


def _find_canonical_scheme(session: Session, name: str) -> VersificationScheme | None:
    """Return an existing canonical scheme matching ``name`` case-insensitively."""
    logger.trace("Looking up canonical scheme name=%s", name)  # type: ignore[attr-defined]
    return session.scalar(
        select(VersificationScheme).where(
            func.lower(VersificationScheme.name) == name.lower(),
            VersificationScheme.canonical.is_(True),
        )
    )


def _prepare_ingredient(name: str, raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize a packaged ingredient and set ``basedOn`` for non-root schemes."""
    ingredient = normalize_ingredient(dict(raw))
    if name.lower() == "org":
        # Root numbering space: store without a base so chains terminate here.
        ingredient.pop("basedOn", None)
    else:
        ingredient["basedOn"] = "org"
    return ingredient


def _ensure_mapping_rows(
    session: Session, scheme: VersificationScheme, ingredient: dict[str, Any]
) -> None:
    """Insert derived mapping rows when the scheme has none yet (rebuild-safe)."""
    existing = session.scalar(
        select(func.count())
        .select_from(MappingRecord)
        .where(MappingRecord.scheme_id == scheme.id)
    )
    if existing and int(existing) > 0:
        logger.trace(  # type: ignore[attr-defined]
            "Scheme %s already has %s mapping rows; skipping derive",
            scheme.name,
            existing,
        )
        return
    based_on = None if scheme.name.lower() == "org" else "org"
    parsed = ParsedScheme(
        name=scheme.name,
        based_on=based_on,
        canonical=True,
        ingredient=ingredient,
    )
    # Core executemany; these derived rows are write-only, so ORM instances per
    # row would only add unit-of-work overhead to every startup and test seed.
    rows = [
        {
            "scheme_id": scheme.id,
            "source_ref": dto.source_ref,
            "base_ref": dto.base_ref,
            "part": dto.part,
            "relation": RelationType(dto.relation),
            "ordinal": dto.ordinal,
        }
        for dto in derive_mapping_records(parsed)
    ]
    if rows:
        session.execute(insert(MappingRecord), rows)


def _ensure_preferred_association(
    session: Session, translation: Translation, scheme: VersificationScheme
) -> None:
    """Ensure the anchor has a preferred association to its canonical scheme."""
    assoc = session.scalar(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == translation.id,
            TranslationVersification.scheme_id == scheme.id,
        )
    )
    others = session.scalars(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == translation.id,
            TranslationVersification.preferred.is_(True),
            TranslationVersification.scheme_id != scheme.id,
        )
    ).all()
    for other in others:
        other.preferred = False
    if others:
        # Release the partial unique index before assigning the canonical default.
        session.flush()

    if assoc is None:
        session.add(
            TranslationVersification(
                translation_id=translation.id,
                scheme_id=scheme.id,
                preferred=True,
            )
        )
        return
    if not assoc.preferred:
        assoc.preferred = True


def seed_canonical(session: Session) -> None:
    """Idempotently seed canonical anchors, schemes, associations, and mappings.

    Safe to call on every startup: keyed by case-insensitive name so re-runs never
    duplicate rows. ``org`` is created first as the null-base root; other anchors
    resolve ``based_on_id`` to the ``org`` translation.
    """
    logger.debug("Seeding canonical anchors and schemes")
    org_translation: Translation | None = None

    for name in CANONICAL_NAMES:
        raw = load_canonical_ingredient(name)
        ingredient = _prepare_ingredient(name, raw)

        translation = _find_translation_ci(session, name)
        if translation is None:
            translation = Translation(
                name=name,
                language="canonical",
                source_format="usx",
                is_anchor=True,
            )
            session.add(translation)
            session.flush()
            logger.debug("Created canonical anchor translation=%s", name)
        else:
            translation.is_anchor = True

        if name.lower() == "org":
            org_translation = translation
            based_on_name: str | None = None
            based_on_id = None
        else:
            if org_translation is None:
                org_translation = _find_translation_ci(session, "org")
            if org_translation is None:
                raise RuntimeError("Canonical org anchor missing during seed")
            based_on_name = "org"
            based_on_id = org_translation.id

        scheme = _find_canonical_scheme(session, name)
        if scheme is None:
            scheme = VersificationScheme(
                name=name,
                based_on_name=based_on_name,
                based_on_id=based_on_id,
                canonical=True,
                ingredient=ingredient,
            )
            session.add(scheme)
            session.flush()
            logger.debug("Created canonical scheme=%s", name)
        else:
            scheme.based_on_name = based_on_name
            scheme.based_on_id = based_on_id
            scheme.ingredient = ingredient
            scheme.canonical = True

        _ensure_mapping_rows(session, scheme, ingredient)
        _ensure_preferred_association(session, translation, scheme)

    session.flush()
    logger.debug("Canonical seed complete for %s anchors", len(CANONICAL_NAMES))
