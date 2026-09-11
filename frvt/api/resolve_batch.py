"""Batch verse-mapping: expand stored ranges and resolve many refs at once."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.models import VerseSpan
from frvt.api.ports.resolver_port import (
    ResolvePath,
    build_resolve_path,
    resolve_single_with_path,
)
from frvt.api.schemas import (
    BatchResolveEntry,
    BatchResolveError,
    BatchResolveOut,
)
from frvt.api.scheme_select import (
    MAX_LIMIT,
    batch_scheme_ref,
    clamp_page,
    require_translation,
)
from frvt.api.usx_book_order import usx_book_sort_key
from frvt.api.verse_range import range_window, verse_key
from frvt.resolver.parse_ref import parse_ref
from frvt.resolver.types import SchemeRef

logger = get_logger(__name__)


@dataclass(frozen=True)
class BatchTarget:
    """Translation pair and optional scheme overrides for one batch request."""

    # Source translation whose stored spans (range) or refs (set) are mapped.
    from_translation: UUID
    # Target translation to map into.
    to_translation: UUID
    # Optional from-side scheme override; ``None`` means preferred then org.
    from_versification: UUID | None = None
    # Optional to-side scheme override; ``None`` means preferred then org.
    to_versification: UUID | None = None


def expand_stored_range(
    session: Session,
    translation_id: UUID,
    *,
    from_ref: str,
    to_ref: str,
) -> list[str]:
    """Return ordered ``BOOK C:V`` strings covered by stored spans in the window.

    Fills the interval from ``verse_span`` rows of ``translation_id`` (whole
    verses only), including combined-milestone constituents from ``verse_range``.
    Edge filtering is done in Python: the interval is a lexicographic
    ``(book order, chapter, verse)`` comparison whose book ordering is a Python
    constant, so the SQL restriction to the book window keeps the fetch bounded
    while the tuple comparison stays obviously correct.

    Returns an empty list when the translation covers nothing in the window.
    Raises ``AppError`` from ``range_window`` when the bounds are invalid.
    """
    logger.debug(
        "Expanding stored range translation=%s from=%s to=%s",
        translation_id,
        from_ref,
        to_ref,
    )
    window = range_window(from_ref, to_ref)
    stmt = select(
        VerseSpan.book,
        VerseSpan.chapter,
        VerseSpan.verse,
        VerseSpan.verse_range,
    ).where(
        VerseSpan.translation_id == translation_id,
        VerseSpan.book.in_(window.books),
        VerseSpan.part.is_(None),
    )
    covered: set[tuple[str, int, int]] = set()
    for book, chapter, verse, stored_range in session.execute(stmt).all():
        covered.add((book, chapter, verse))
        if stored_range is None:
            continue
        try:
            parsed = parse_ref(stored_range)
        except ReferenceError:
            logger.error(
                "Skipping malformed verse_range %r at %s %s:%s",
                stored_range,
                book,
                chapter,
                verse,
                exc_info=True,
            )
            continue
        for member in range(parsed.verse_start, parsed.verse_end + 1):
            covered.add((parsed.book, parsed.chapter, member))
    inside = [
        coord for coord in covered if window.lower <= verse_key(*coord) <= window.upper
    ]
    inside.sort(key=lambda coord: (usx_book_sort_key(coord[0]), coord[1], coord[2]))
    return [f"{book} {chapter}:{verse}" for book, chapter, verse in inside]


def _prepare(
    session: Session, target: BatchTarget
) -> tuple[SchemeRef, SchemeRef, ResolvePath]:
    """Validate translations, select batch schemes, and build one hop path.

    Raises ``AppError`` ``404`` / ``409`` / ``422`` for request-level failures.
    """
    logger.debug(
        "Preparing batch resolve from=%s to=%s",
        target.from_translation,
        target.to_translation,
    )
    require_translation(session, target.from_translation)
    require_translation(session, target.to_translation)
    source_scheme = batch_scheme_ref(
        session, target.from_translation, target.from_versification
    )
    target_scheme = batch_scheme_ref(
        session, target.to_translation, target.to_versification
    )
    path = build_resolve_path(
        session,
        source_scheme=source_scheme,
        target_scheme=target_scheme,
    )
    return source_scheme, target_scheme, path


def _resolve_entries(
    session: Session,
    refs: list[str],
    *,
    target: BatchTarget,
    path: ResolvePath,
) -> list[BatchResolveEntry]:
    """Resolve each ref against ``path``, recording per-member errors."""
    entries: list[BatchResolveEntry] = []
    for ref in refs:
        try:
            result = resolve_single_with_path(
                session,
                from_translation=target.from_translation,
                to_translation=target.to_translation,
                ref=ref,
                part=None,
                path=path,
            )
            entries.append(BatchResolveEntry(ref=ref, result=result, error=None))
        except AppError as exc:
            logger.error("Batch member failed ref=%s", ref, exc_info=True)
            entries.append(
                BatchResolveEntry(
                    ref=ref,
                    result=None,
                    error=BatchResolveError(code=exc.code, detail=exc.detail),
                )
            )
        except Exception:
            logger.error("Batch member unexpected failure ref=%s", ref, exc_info=True)
            entries.append(
                BatchResolveEntry(
                    ref=ref,
                    result=None,
                    error=BatchResolveError(
                        code="internal_error",
                        detail="Unexpected error resolving reference.",
                    ),
                )
            )
    return entries


def resolve_verse_set(
    session: Session,
    target: BatchTarget,
    refs: list[str],
) -> BatchResolveOut:
    """Resolve an explicit list of references in request order.

    Raises ``AppError`` ``422`` when ``refs`` is empty or longer than
    ``MAX_LIMIT``. Duplicate refs are preserved. Request-level scheme/chain
    failures propagate; per-member failures become entry ``error`` values.
    """
    logger.debug(
        "Batch verse set from=%s to=%s count=%s",
        target.from_translation,
        target.to_translation,
        len(refs),
    )
    if not refs or len(refs) > MAX_LIMIT:
        raise AppError(
            422,
            f"refs must contain between 1 and {MAX_LIMIT} items.",
            code="validation_failed",
        )
    source_scheme, target_scheme, path = _prepare(session, target)
    entries = _resolve_entries(session, refs, target=target, path=path)
    return BatchResolveOut(
        items=entries,
        total=len(entries),
        from_versification=source_scheme.scheme_id,
        to_versification=target_scheme.scheme_id,
    )


def resolve_verse_range(
    session: Session,
    target: BatchTarget,
    *,
    from_ref: str,
    to_ref: str,
    limit: int | None = None,
    offset: int | None = None,
) -> BatchResolveOut:
    """Expand a stored-span window, page it, and resolve the page.

    ``total`` is the unsliced expansion size. Raises ``AppError`` from
    ``clamp_page``, ``range_window``, or ``_prepare``.
    """
    logger.debug(
        "Batch verse range from=%s to=%s from_ref=%s to_ref=%s",
        target.from_translation,
        target.to_translation,
        from_ref,
        to_ref,
    )
    page_limit, page_offset = clamp_page(limit, offset)
    source_scheme, target_scheme, path = _prepare(session, target)
    all_refs = expand_stored_range(
        session,
        target.from_translation,
        from_ref=from_ref,
        to_ref=to_ref,
    )
    total = len(all_refs)
    page_refs = all_refs[page_offset : page_offset + page_limit]
    entries = _resolve_entries(session, page_refs, target=target, path=path)
    return BatchResolveOut(
        items=entries,
        total=total,
        from_versification=source_scheme.scheme_id,
        to_versification=target_scheme.scheme_id,
    )
