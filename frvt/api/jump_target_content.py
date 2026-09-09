"""Hide jump rows whose resolved targets land in books with no stored content."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import TYPE_CHECKING, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from frvt.api.jump_cancel import JumpCancelContext, resolve_navigation_dto
from frvt.api.logging_config import get_logger
from frvt.api.models import Translation, VerseSpan
from frvt.resolver.parse_ref import parse_ref
from frvt.resolver.types import ResolutionDTO

if TYPE_CHECKING:
    pass

logger = get_logger(__name__)

_RowT = TypeVar("_RowT")


def translation_books_with_content(
    session: Session, translation_id: UUID
) -> frozenset[str]:
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


def target_content_books_or_unfiltered(
    session: Session, translation_id: UUID
) -> frozenset[str] | None:
    """Return stored books, or ``None`` to skip filtering for numbering-space anchors.

    Anchors store no verse text. Treating that empty set as “unreachable” would
    hide every jump whose composed target is org (or another numbering space).
    """
    translation = session.get(Translation, translation_id)
    if translation is not None and translation.is_anchor:
        logger.debug(
            "Skipping target-content filter for numbering-space anchor translation=%s",
            translation_id,
        )
        return None
    return translation_books_with_content(session, translation_id)


def target_books_from_resolution(dto: ResolutionDTO) -> frozenset[str]:
    """Collect distinct target-side book codes from a resolve result."""
    books: set[str] = set()
    for span in dto.target_spans:
        try:
            books.add(parse_ref(span.ref).book)
        except ReferenceError:
            logger.debug(
                "Skipping unparseable target ref=%s during jump filter", span.ref
            )
    return frozenset(books)


def is_unreachable_jump_entry(
    context: JumpCancelContext,
    navigation_ref: str,
    part: str | None,
    target_books: frozenset[str] | None,
) -> bool:
    """Return whether a jump entry should be hidden for missing target content.

    Entries with no target spans (for example ``exclude``) are kept. Resolve
    failures fail open so the entry stays visible, matching cancel filtering.
    ``target_books is None`` means “do not filter” (numbering-space anchors).
    """
    if target_books is None:
        return False
    dto = resolve_navigation_dto(context, navigation_ref, part)
    if dto is None:
        return False
    resolved_targets = target_books_from_resolution(dto)
    if not resolved_targets:
        return False
    return resolved_targets.isdisjoint(target_books)


def filter_unreachable_jump_rows(
    rows: Sequence[_RowT],
    context: JumpCancelContext,
    target_books: frozenset[str] | None,
    navigation_for_row: Callable[[_RowT], tuple[str, str | None]],
) -> list[_RowT]:
    """Drop rows whose resolved targets have no stored content on the to side.

    ``target_books is None`` skips filtering so numbering-space anchors still
    expose scheme differences.
    """
    if not rows or target_books is None:
        return list(rows)
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
