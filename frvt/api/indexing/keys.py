"""Normalize verse references to the keys stored on index mapping rows."""

from __future__ import annotations

from frvt.api.logging_config import get_logger
from frvt.resolver.parse_ref import format_bcv, parse_ref
from frvt.resolver.types import VerseId

logger = get_logger(__name__)


def index_key(ref: str) -> str | None:
    """Return the single-verse ``BOOK C:V`` key for ``ref``, or ``None``.

    Both the builder and the read path use this function so stored keys and
    lookup keys cannot drift. Multi-verse ranges and unparseable strings return
    ``None``; those requests fall back to live resolve per entry.
    """
    logger.trace("Normalizing index key for ref=%s", ref)  # type: ignore[attr-defined]
    try:
        parsed = parse_ref(ref.strip())
    except ReferenceError:
        return None
    if parsed.verse_start != parsed.verse_end:
        return None
    return format_bcv(
        VerseId(
            book=parsed.book,
            chapter=parsed.chapter,
            verse=parsed.verse_start,
            part=None,
        )
    )
