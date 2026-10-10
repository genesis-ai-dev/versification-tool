"""Read a Paratext .vrs file the way the divergence engine needs it.

``parse_vrs_pairs`` matches the prototype: ``#!`` lines are kept, other ``#``
lines are comments, and a leading ``&`` is stripped. ``read_vrs_document``
builds an engine document from the same text, including ``#! *`` partials.
"""

from __future__ import annotations

import re
from typing import Any

from frvt.divergence.refs import parse

_BOOK_LINE = re.compile(r"^([A-Z1-6]{3})(?:\s+(\d+:\d+(?:\s+\d+:\d+)*))?$")
_PARTIAL = re.compile(r"^\*([^,]+),(.*)$")


def parse_vrs_pairs(text: str) -> list[tuple[str, str]]:
    """Every mapping line, including ``#!`` and ``&`` forms, as ``(lhs, rhs)``."""
    pairs: list[tuple[str, str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("#!"):
            line = line[2:].strip()
        elif line.startswith("#"):
            continue
        line = line.split("#", 1)[0].strip()
        if "=" not in line:
            continue
        if line.startswith("&"):
            line = line[1:].strip()
        left, right = (part.strip() for part in line.split("=", 1))
        if parse(left) and parse(right):
            pairs.append((left, right))
    return pairs


def supplement_if_consistent(
    doc: dict[str, Any], pairs: list[tuple[str, str]] | None
) -> list[tuple[str, str]] | None:
    """Return ``pairs`` when every JSON mapping appears in them, else None.

    ``None`` means the side has no supplement. An empty pair list is not
    consistent with a document that has mappings.
    """
    if pairs is None:
        return None
    present = set(pairs)
    for key, value in doc.get("mappedVerses", {}).items():
        if (key, value) not in present:
            return None
    return pairs


def read_vrs_document(text: str) -> tuple[dict[str, Any], list[tuple[str, str]]]:
    """Build an engine document and its supplement pairs from .vrs text.

    Book lines become ``maxVerses``. ``-REF`` lines become exclusions. Plain
    mapping lines become ``mappedVerses``, last one wins, part letters kept.
    ``#! *REF,seg,...`` lines become ``partialVerses``. The supplement is every
    mapping line ``parse_vrs_pairs`` would keep, so it is consistent by construction.
    """
    max_verses: dict[str, list[str]] = {}
    mapped: dict[str, str] = {}
    excluded: list[str] = []
    partials: dict[str, list[str]] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("#!"):
            body = line[2:].strip()
            partial = _PARTIAL.match(body)
            if partial:
                ref = partial.group(1).strip()
                partials[ref] = [part.strip() for part in partial.group(2).split(",")]
            continue
        if not line or line.startswith("#"):
            continue
        line = line.split("#", 1)[0].strip()
        if line.startswith("-") and "=" not in line:
            excluded.append(line[1:].strip())
            continue
        if "=" in line:
            left, right = (part.strip() for part in line.split("=", 1))
            if left.startswith("&"):
                left = left[1:].strip()
            mapped[left] = right
            continue
        book_match = _BOOK_LINE.match(line)
        if book_match and ":" in line:
            book = book_match.group(1)
            rest = book_match.group(2) or ""
            maxima = []
            ok = True
            for token in rest.split():
                if ":" not in token:
                    ok = False
                    break
                maxima.append(token.split(":", 1)[1])
            if ok and maxima:
                max_verses[book] = maxima
    document: dict[str, Any] = {
        "maxVerses": max_verses,
        "mappedVerses": mapped,
        "excludedVerses": excluded,
        "partialVerses": partials,
    }
    return document, parse_vrs_pairs(text)
