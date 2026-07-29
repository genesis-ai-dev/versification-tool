"""Collect distinct from-side books from cancel-filtered jump mapping rows."""

from __future__ import annotations

from typing import TYPE_CHECKING

from frvt.api.logging_config import get_logger
from frvt.api.usx_book_order import usx_book_sort_key

if TYPE_CHECKING:
    from frvt.api.routers.navigation import JumpMapping

logger = get_logger(__name__)


def jump_difference_books(rows: list[JumpMapping]) -> list[str]:
    """Return distinct from-side books for jump rows, USX-sorted.

    Derives each row's book from its discrete navigation target (range lower
    bound), matching the book the jump menu would use for that entry.
    Unparseable refs are skipped, consistent with jump BCV sort fallbacks.
    """
    from frvt.api.routers.navigation import navigation_target

    logger.trace("Collecting jump-difference books from %d rows", len(rows))  # type: ignore[attr-defined]
    books: set[str] = set()
    for row in rows:
        try:
            _nav_ref, navigation = navigation_target(row.source_ref, row.part)
        except (ReferenceError, ValueError, TypeError):
            logger.debug(
                "Skipping jump row with unparseable source_ref=%s",
                row.source_ref,
            )
            continue
        books.add(navigation.book)
    return sorted(books, key=usx_book_sort_key)
