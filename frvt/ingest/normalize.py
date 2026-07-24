"""Normalize ingredient quirks found in real Copenhagen / VRS samples."""

from __future__ import annotations

import re
from typing import Any

from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

# Trailing part suffix on a single-verse or range endpoint (e.g. ``ESG 1:1a``).
_PART_SUFFIX = re.compile(r"^([A-Z1-6]{3} [0-9]+:[0-9]+(?:-[0-9]+)?)([A-Za-z-]+)$")


def strip_part_suffix(value: str) -> tuple[str, str | None]:
    """Split a ref that may carry an embedded part into ``(plain_ref, part)``."""
    match = _PART_SUFFIX.match(value.strip())
    if match is None:
        return value, None
    return match.group(1), match.group(2)


def normalize_ingredient(ingredient: dict[str, Any]) -> dict[str, Any]:
    """Return a copy with part suffixes moved from mappedVerses to partialVerses.

    Shipped samples sometimes embed part letters in mappedVerses values/keys even
    though the Copenhagen schema's bcvRange pattern forbids them. Normalization
    keeps the ingredient usable without modifying research assets on disk.
    """
    logger.debug("Normalizing ingredient mappedVerses/partialVerses")
    result = dict(ingredient)
    mapped = dict(result.get("mappedVerses") or {})
    partials: dict[str, list[str]] = {
        str(key): list(
            dict.fromkeys(
                part.strip() if isinstance(part, str) else part for part in parts
            )
        )
        for key, parts in (result.get("partialVerses") or {}).items()
        if isinstance(parts, list)
    }
    normalized_mapped: dict[str, str] = {}
    for raw_key, raw_value in mapped.items():
        key, key_part = strip_part_suffix(str(raw_key))
        value, value_part = strip_part_suffix(str(raw_value))
        normalized_mapped[key] = value
        if key_part:
            bucket = partials.setdefault(key, [])
            if key_part not in bucket:
                bucket.append(key_part)
        if value_part:
            bucket = partials.setdefault(value, [])
            if value_part not in bucket:
                bucket.append(value_part)
    result["mappedVerses"] = normalized_mapped
    if partials:
        result["partialVerses"] = partials
    if "basedOn" not in result or not result["basedOn"]:
        result["basedOn"] = "org"
    return result
