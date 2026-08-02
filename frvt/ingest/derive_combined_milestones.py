"""Append implied split mappings for combined USX milestones at ingest."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from frvt.api.logging_config import get_logger
from frvt.api.models import Translation, VerseSpan
from frvt.ingest.types import ParsedSpan
from frvt.resolver.parse_ref import covers, expand, parse_ref
from frvt.resolver.types import RefRange, VerseId

logger = get_logger(__name__)


def apply_combined_milestone_splits(
    ingredient: dict[str, Any],
    spans: tuple[ParsedSpan, ...],
    *,
    session: Session,
    based_on_translation_id: UUID,
) -> dict[str, Any]:
    """Return ``ingredient`` with ``splitVerses`` rows for combined spans when basedOn allows.

    Each combined milestone that maps to discrete ``basedOn`` spans receives
    ``mappedVerses[anchor] = verse_range`` and ``splitVerses += anchor``. Existing
    VRS keys are never overwritten.
    """
    logger.debug("Applying combined milestone splits for %s spans", len(spans))
    mapped: dict[str, str] = dict(ingredient.get("mappedVerses") or {})
    split_list = list(ingredient.get("splitVerses") or [])
    merged_list = ingredient.get("mergedVerses") or []
    split_keys = {str(ref) for ref in split_list}
    merged_keys = (
        {str(ref) for ref in merged_list} if isinstance(merged_list, list) else set()
    )

    for span in spans:
        if span.verse_range is None:
            continue
        anchor = _anchor_ref(span)
        range_ref = span.verse_range
        if _should_skip_implied_split(
            ingredient,
            anchor=anchor,
            range_ref=range_ref,
            mapped=mapped,
            split_keys=split_keys,
            merged_keys=merged_keys,
        ):
            continue
        try:
            ref_range = parse_ref(range_ref)
        except ReferenceError:
            logger.error("Skipping unparseable verse_range %s", range_ref, exc_info=True)
            continue
        if not _based_on_has_discrete_spans(
            session,
            based_on_translation_id,
            ref_range,
        ):
            logger.debug(
                "Skipping combined split %s; basedOn lacks discrete spans",
                range_ref,
            )
            continue
        mapped[anchor] = range_ref
        split_list.append(anchor)
        split_keys.add(anchor)
        logger.debug("Added combined milestone split %s -> %s", anchor, range_ref)

    if split_list == list(ingredient.get("splitVerses") or []) and mapped == dict(
        ingredient.get("mappedVerses") or {}
    ):
        return ingredient
    updated = dict(ingredient)
    updated["mappedVerses"] = mapped
    updated["splitVerses"] = split_list
    return updated


def _anchor_ref(span: ParsedSpan) -> str:
    """Return the single-verse BCV anchor for a stored combined-milestone span."""
    return f"{span.book} {span.chapter}:{span.verse}"


def _should_skip_implied_split(
    ingredient: dict[str, Any],
    *,
    anchor: str,
    range_ref: str,
    mapped: dict[str, str],
    split_keys: set[str],
    merged_keys: set[str],
) -> bool:
    """Return whether an implied split must not be added (VRS or duplicate wins)."""
    if anchor in mapped or anchor in split_keys or anchor in merged_keys:
        return True
    if range_ref in merged_keys or range_ref in mapped:
        return True
    try:
        anchor_range = parse_ref(anchor)
    except ReferenceError:
        return True
    probe = VerseId(
        book=anchor_range.book,
        chapter=anchor_range.chapter,
        verse=anchor_range.verse_start,
        part=None,
    )
    for key in ingredient.get("mappedVerses") or {}:
        try:
            key_range = parse_ref(str(key))
        except ReferenceError:
            continue
        if covers(key_range, probe):
            return True
    return False


def _based_on_has_discrete_spans(
    session: Session,
    translation_id: UUID,
    ref_range: RefRange,
) -> bool:
    """Return whether ``basedOn`` has whole-verse rows for every verse in ``ref_range``.

    Numbering-space anchors store no verse text; for those translations the interim
    assumption that local USX numbers match basedOn coordinates is sufficient.
    """
    translation = session.get(Translation, translation_id)
    if translation is not None and translation.is_anchor:
        logger.debug(
            "Accepting combined split range %s for anchor basedOn=%s",
            ref_range,
            translation_id,
        )
        return True
    members = expand(ref_range)
    for member in members:
        row = session.scalar(
            select(VerseSpan.id).where(
                VerseSpan.translation_id == translation_id,
                VerseSpan.book == member.book,
                VerseSpan.chapter == member.chapter,
                VerseSpan.verse == member.verse,
                VerseSpan.part.is_(None),
            )
        )
        if row is None:
            return False
    return True
