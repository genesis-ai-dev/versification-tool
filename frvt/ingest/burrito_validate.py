"""Structural validation of Copenhagen/Burrito versification ingredients."""

from __future__ import annotations

import json
import re
from importlib import resources
from typing import Any

from frvt.api.logging_config import get_logger
from frvt.ingest.types import IngestIssue
from frvt.resolver.parse_ref import parse_ref

logger = get_logger(__name__)

_BCV = re.compile(r"^[A-Z1-6]{3} [0-9]+:[0-9]+$")
_BCV_RANGE = re.compile(r"^[A-Z1-6]{3} [0-9]+:[0-9]+(-[0-9]+)?$")
_BOOK = re.compile(r"^[A-Z1-6]{3}$")
_BASED_ON = re.compile(r"^[a-z][a-z0-9]*$")


def _valid_ref(value: object, *, allow_range: bool) -> bool:
    """Check both the Copenhagen ref pattern and semantic range ordering."""
    text = str(value)
    pattern = _BCV_RANGE if allow_range else _BCV
    if not pattern.fullmatch(text):
        return False
    try:
        parsed = parse_ref(text)
    except ReferenceError:
        logger.error("Invalid ingredient reference %s", text, exc_info=True)
        return False
    return allow_range or parsed.verse_start == parsed.verse_end


def load_schema() -> dict[str, Any]:
    """Load the packaged Copenhagen versification schema for reference checks."""
    logger.trace("Loading packaged versification schema")  # type: ignore[attr-defined]
    package = resources.files("frvt.resources")
    raw = package.joinpath("versification_schema.json").read_text(encoding="utf-8")
    loaded: dict[str, Any] = json.loads(raw)
    return loaded


def validate_ingredient(ingredient: dict[str, Any]) -> tuple[IngestIssue, ...]:
    """Validate required structure and patterns; returns blocking issues if any.

    Checks mirror the packaged schema roughly: ``maxVerses`` is required, book
    keys and BCV strings must match the grammar, and unknown top-level keys are
    rejected. Verse maxima may be ints or digit-strings (as in shipped samples).
    """
    logger.debug("Validating ingredient keys=%s", sorted(ingredient.keys()))
    issues: list[IngestIssue] = []
    schema = load_schema()
    allowed = set(schema.get("properties", {}).keys())

    unknown = sorted(set(ingredient.keys()) - allowed)
    for key in unknown:
        issues.append(
            IngestIssue(
                kind="invalid",
                field=key,
                message=f"Unknown ingredient field {key!r}",
            )
        )

    if "maxVerses" not in ingredient:
        issues.append(
            IngestIssue(
                kind="invalid",
                field="maxVerses",
                message="Ingredient requires maxVerses",
            )
        )
        return tuple(issues)

    max_verses = ingredient["maxVerses"]
    if not isinstance(max_verses, dict):
        issues.append(
            IngestIssue(
                kind="invalid",
                field="maxVerses",
                message="maxVerses must be an object",
            )
        )
    else:
        for book, chapters in max_verses.items():
            if not _BOOK.match(str(book)):
                issues.append(
                    IngestIssue(
                        kind="invalid",
                        field="maxVerses",
                        message=f"Invalid book id {book!r}",
                    )
                )
            if not isinstance(chapters, list) or not chapters:
                issues.append(
                    IngestIssue(
                        kind="invalid",
                        field="maxVerses",
                        message=f"maxVerses[{book}] must be a non-empty array",
                    )
                )
                continue
            for value in chapters:
                if isinstance(value, bool) or not isinstance(value, (int, str)):
                    issues.append(
                        IngestIssue(
                            kind="invalid",
                            field="maxVerses",
                            message=(
                                f"maxVerses[{book}] entry must be int or digit string"
                            ),
                        )
                    )
                elif isinstance(value, str) and not value.isdigit():
                    issues.append(
                        IngestIssue(
                            kind="invalid",
                            field="maxVerses",
                            message=f"maxVerses[{book}] string entries must be digits",
                        )
                    )
                elif isinstance(value, int) and value < 0:
                    issues.append(
                        IngestIssue(
                            kind="invalid",
                            field="maxVerses",
                            message=f"maxVerses[{book}] entries must be >= 0",
                        )
                    )

    based_on = ingredient.get("basedOn")
    if based_on is not None and (
        not isinstance(based_on, str) or not _BASED_ON.match(based_on)
    ):
        issues.append(
            IngestIssue(
                kind="invalid",
                field="basedOn",
                message="basedOn must match ^[a-z][a-z0-9]*$",
            )
        )

    mapped = ingredient.get("mappedVerses")
    if mapped is not None:
        if not isinstance(mapped, dict):
            issues.append(
                IngestIssue(
                    kind="invalid",
                    field="mappedVerses",
                    message="mappedVerses must be an object",
                )
            )
        else:
            for key, value in mapped.items():
                if not _valid_ref(key, allow_range=True) or not _valid_ref(
                    value, allow_range=True
                ):
                    issues.append(
                        IngestIssue(
                            kind="invalid",
                            field="mappedVerses",
                            message=f"Invalid mappedVerses entry {key!r} -> {value!r}",
                        )
                    )

    excluded = ingredient.get("excludedVerses")
    if excluded is not None:
        if not isinstance(excluded, list):
            issues.append(
                IngestIssue(
                    kind="invalid",
                    field="excludedVerses",
                    message="excludedVerses must be an array",
                )
            )
        else:
            for ref in excluded:
                if not _valid_ref(ref, allow_range=False):
                    issues.append(
                        IngestIssue(
                            kind="invalid",
                            field="excludedVerses",
                            message=f"Invalid excluded verse {ref!r}",
                        )
                    )

    merged = ingredient.get("mergedVerses")
    if merged is not None:
        if not isinstance(merged, list):
            issues.append(
                IngestIssue(
                    kind="invalid",
                    field="mergedVerses",
                    message="mergedVerses must be an array",
                )
            )
        else:
            for ref in merged:
                if not _valid_ref(ref, allow_range=True):
                    issues.append(
                        IngestIssue(
                            kind="invalid",
                            field="mergedVerses",
                            message=f"Invalid mergedVerses entry {ref!r}",
                        )
                    )

    partials = ingredient.get("partialVerses")
    if partials is not None:
        if not isinstance(partials, dict):
            issues.append(
                IngestIssue(
                    kind="invalid",
                    field="partialVerses",
                    message="partialVerses must be an object",
                )
            )
        else:
            for ref, parts in partials.items():
                if not _valid_ref(ref, allow_range=False):
                    issues.append(
                        IngestIssue(
                            kind="invalid",
                            field="partialVerses",
                            message=f"Invalid partialVerses key {ref!r}",
                        )
                    )
                if not isinstance(parts, list) or not parts:
                    issues.append(
                        IngestIssue(
                            kind="invalid",
                            field="partialVerses",
                            message=f"partialVerses[{ref}] must be a non-empty array",
                        )
                    )
                elif any(not isinstance(part, str) or not part for part in parts):
                    issues.append(
                        IngestIssue(
                            kind="invalid",
                            field="partialVerses",
                            message=(
                                f"partialVerses[{ref}] parts must be non-empty strings"
                            ),
                        )
                    )

    return tuple(issues)
