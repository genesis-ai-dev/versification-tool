"""Derive ``mapping_record`` DTOs from a validated Copenhagen ingredient."""

from __future__ import annotations

from typing import Any

from frvt.api.logging_config import get_logger
from frvt.ingest.normalize import strip_part_suffix
from frvt.ingest.types import MappingRecordDTO, ParsedScheme
from frvt.resolver.parse_ref import parse_ref

logger = get_logger(__name__)


def classify_mapped(source_ref: str, base_ref: str) -> str:
    """Classify a ``mappedVerses`` pair as shift, renumber, or one_to_one."""
    source_plain, _ = strip_part_suffix(source_ref)
    base_plain, _ = strip_part_suffix(base_ref)
    source = parse_ref(source_plain)
    base = parse_ref(base_plain)
    if source.book != base.book:
        return "renumber"
    if source.chapter != base.chapter:
        return "renumber"
    src_len = source.verse_end - source.verse_start + 1
    base_len = base.verse_end - base.verse_start + 1
    if src_len == 1 and base_len == 1 and source.verse_start == base.verse_start:
        return "one_to_one"
    if src_len == base_len and source.verse_start != base.verse_start:
        return "shift"
    if src_len != base_len:
        return "renumber"
    return "shift"


def derive_mapping_records(scheme: ParsedScheme) -> tuple[MappingRecordDTO, ...]:
    """Flatten ``scheme.ingredient`` into ordered mapping DTOs (pure / rebuildable)."""
    logger.debug("Deriving mapping records for scheme=%s", scheme.name)
    ingredient: dict[str, Any] = scheme.ingredient
    rows: list[MappingRecordDTO] = []
    ordinal = 0

    mapped = ingredient.get("mappedVerses") or {}
    merged_list = ingredient.get("mergedVerses") or []
    # Keys listed in ``mergedVerses`` are emitted only as ``merge`` rows below;
    # skipping them here avoids a duplicate renumber/shift row for the same ref.
    merged_keys = (
        {str(ref) for ref in merged_list} if isinstance(merged_list, list) else set()
    )
    if isinstance(mapped, dict):
        for key, value in mapped.items():
            if str(key) in merged_keys:
                continue
            try:
                relation = classify_mapped(str(key), str(value))
            except ReferenceError:
                # Trusted canonical resources can contain malformed legacy rows;
                # omit them because an unusable coordinate must never reach resolve.
                logger.error(
                    "Skipping unparseable mappedVerses pair %s -> %s",
                    key,
                    value,
                    exc_info=True,
                )
                continue
            rows.append(
                MappingRecordDTO(
                    source_ref=str(key),
                    base_ref=str(value),
                    part=None,
                    relation=relation,
                    ordinal=ordinal,
                )
            )
            ordinal += 1

    excluded = ingredient.get("excludedVerses") or []
    if isinstance(excluded, list):
        for ref in excluded:
            rows.append(
                MappingRecordDTO(
                    source_ref=str(ref),
                    base_ref=None,
                    part=None,
                    relation="exclude",
                    ordinal=ordinal,
                )
            )
            ordinal += 1

    merged = merged_list
    if isinstance(merged, list):
        for ref in merged:
            ref_s = str(ref)
            base = mapped.get(ref_s) if isinstance(mapped, dict) else None
            if base is None and isinstance(mapped, dict):
                # Interim: match a mappedVerses entry whose source range equals ref.
                for mapped_key, mapped_value in mapped.items():
                    if str(mapped_key) == ref_s:
                        base = mapped_value
                        break
            rows.append(
                MappingRecordDTO(
                    source_ref=ref_s,
                    base_ref=str(base) if base is not None else None,
                    part=None,
                    relation="merge",
                    ordinal=ordinal,
                )
            )
            ordinal += 1

    partials = ingredient.get("partialVerses") or {}
    if isinstance(partials, dict):
        for ref, parts in partials.items():
            if not isinstance(parts, list):
                continue
            for part in parts:
                rows.append(
                    MappingRecordDTO(
                        source_ref=str(ref),
                        base_ref=str(ref),
                        part=str(part),
                        relation="partial",
                        ordinal=ordinal,
                    )
                )
                ordinal += 1

    return tuple(rows)
