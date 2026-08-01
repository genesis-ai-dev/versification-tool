"""Hide jump rows whose resolved targets land in books with no stored content."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import TYPE_CHECKING, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from frvt.api.jump_cancel import JumpCancelContext
from frvt.api.logging_config import get_logger
from frvt.api.models import VerseSpan
from frvt.resolver.parse_ref import parse_ref
from frvt.resolver.types import ResolutionDTO

if TYPE_CHECKING:
    pass

logger = get_logger(__name__)

_RowT = TypeVar("_RowT")


def translation_books_with_content(session: Session, translation_id: UUID) -> frozenset[str]:
    """Return distinct book codes that have at least one ``verse_span`` row."""
    logger.trace(  # type: ignore[attr-defined]
        "Loading stored books for translation=%s",
        translation_id,
    )
    rows = session.execute(
        select(VerseSpan.book)
        .where(VerseSpan.translation_id == translation_id)
        .distinct()
    ).all()
    return frozenset(row[0] for row in rows)


def target_books_from_resolution(dto: ResolutionDTO) -> frozenset[str]:
    """Collect distinct target-side book codes from a resolve result."""
    books: set[str] = set()
    for span in dto.target_spans:
        try:
            books.add(parse_ref(span.ref).book)
        except ReferenceError:
            logger.debug("Skipping unparseable target ref=%s during jump filter", span.ref)
    return frozenset(books)


def is_unreachable_jump_entry(
    context: JumpCancelContext,
    navigation_ref: str,
    part: str | None,
    target_books: frozenset[str],
) -> bool:
    """Return whether a jump entry should be hidden for missing target content.

    Entries with no target spans (for example ``exclude``) are kept. Resolve
    failures fail open so the entry stays visible, matching cancel filtering.
    """
    try:
        dto = context._resolve_navigation(navigation_ref, part)
    except (ReferenceError, LookupError, ValueError) as exc:
        logger.debug(
            "Target-content check resolve failed for ref=%s: %s",
            navigation_ref,
            exc,
        )
        return False
    resolved_targets = target_books_from_resolution(dto)
    if not resolved_targets:
        return False
    return resolved_targets.isdisjoint(target_books)


def filter_unreachable_jump_rows(
    rows: Sequence[_RowT],
    context: JumpCancelContext,
    target_books: frozenset[str],
    navigation_for_row: Callable[[_RowT], tuple[str, str | None]],
) -> list[_RowT]:
    """Drop rows whose resolved targets have no stored content on the to side."""
    if not rows:
        return []
    logger.debug(
        "Target-content filter evaluating %s jump rows against %s books",
        len(rows),
        len(target_books),
    )
    kept: list[_RowT] = []
    for row in rows:
        nav_ref, part = navigation_for_row(row)
        if is_unreachable_jump_entry(context, nav_ref, part, target_books):
            continue
        kept.append(row)
    logger.debug(
        "Target-content filter kept %s of %s rows",
        len(kept),
        len(rows),
    )
    return kept
