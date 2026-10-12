"""Divergence types, severities, and layers.

The order of ``TYPE_IDS`` is the integer stored on each event. Do not reorder it.
"""

from __future__ import annotations

# Severity 1 is a small numbering quirk. Severity 5 is a whole book on one side.
SEVERITY: dict[str, int] = {
    "VERSE0_TITLE": 1,
    "BRIDGE": 1,
    "RENUMBER": 2,
    "MERGE": 3,
    "SPLIT": 3,
    "SEGMENT": 3,
    "CHAPTER_MOVE": 4,
    "ORDER_INVERSION": 4,
    "CROSS_BOOK": 4,
    "EXCLUDED": 4,
    "ONE_SIDED": 4,
    "BOOK_ONE_SIDED": 5,
}

# Which viewer layer a type belongs to. The dialog toggles these four.
LAYER: dict[str, str] = {
    "VERSE0_TITLE": "scheme",
    "RENUMBER": "scheme",
    "MERGE": "scheme",
    "SPLIT": "scheme",
    "CHAPTER_MOVE": "scheme",
    "ORDER_INVERSION": "scheme",
    "CROSS_BOOK": "scheme",
    "ONE_SIDED": "scheme",
    "SEGMENT": "segment",
    "BRIDGE": "text",
    "EXCLUDED": "text",
    "BOOK_ONE_SIDED": "canon",
}

# Wire-format order. Event rows store the index into this tuple.
TYPE_IDS: tuple[str, ...] = tuple(SEVERITY)

# Bumped when the payload shape or classification changes.
ENGINE_VERSION = "1"
