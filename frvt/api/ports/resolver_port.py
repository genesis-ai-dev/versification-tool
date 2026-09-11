"""Adapter that selects schemes, calls ``assemble``, and attaches structured coords."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.orm import Session

from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.models import VerseSpan
from frvt.api.ports.span_lookup import find_stored_span
from frvt.api.schemas import RelationType, ResolvedSpan, ResolveEdge, ResolveResult
from frvt.api.scheme_select import require_translation, selected_scheme_ref
from frvt.resolver import assemble
from frvt.resolver.chains import (
    build_chain,
    hops_from_ancestor,
    hops_to_ancestor,
    nearest_shared_translation,
)
from frvt.resolver.parse_ref import expand, format_bcv, parse_ref
from frvt.resolver.types import Hop, ResolutionDTO, ResolvedSpanDTO, SchemeRef, VerseId

logger = get_logger(__name__)


def _resolved_from_stored(
    span: VerseSpan | None,
    *,
    book: str,
    chapter: int,
    verse: int,
    part: str | None,
) -> ResolvedSpan:
    """Build a ``ResolvedSpan`` from a stored row or bare coordinates."""
    if span is None:
        ref = format_bcv(VerseId(book=book, chapter=chapter, verse=verse, part=part))
        return ResolvedSpan(
            ref=ref,
            book=book,
            chapter=chapter,
            verse=verse,
            seq=None,
            part=part,
        )
    ref = format_bcv(
        VerseId(book=span.book, chapter=span.chapter, verse=span.verse, part=part)
    )
    return ResolvedSpan(
        ref=ref,
        book=span.book,
        chapter=span.chapter,
        verse=span.verse,
        seq=span.seq,
        part=part,
        verse_label=span.verse_label,
        verse_range=span.verse_range,
    )


def _enrich_span(
    session: Session,
    translation_id: UUID,
    dto: ResolvedSpanDTO,
) -> ResolvedSpan:
    """Map resolver coordinates onto stored spans, including combined milestones."""
    ref_range = parse_ref(dto.ref)
    book = ref_range.book
    chapter = ref_range.chapter
    verse = ref_range.verse_start
    span = find_stored_span(
        session,
        translation_id,
        book=book,
        chapter=chapter,
        verse=verse,
        part=dto.part,
    )
    return _resolved_from_stored(
        span,
        book=book,
        chapter=chapter,
        verse=verse if span is None else span.verse,
        part=dto.part,
    )


def _span_dedupe_key(
    span: ResolvedSpan,
) -> tuple[int | None, str, int, int, str | None]:
    """Return a stable key for deduplicating enriched spans by stored identity."""
    return (span.seq, span.book, span.chapter, span.verse, span.part)


def _dedupe_enriched(spans: list[ResolvedSpan]) -> list[ResolvedSpan]:
    """Drop duplicate enriched spans that collapse onto the same stored row."""
    seen: set[tuple[int | None, str, int, int, str | None]] = set()
    out: list[ResolvedSpan] = []
    for span in spans:
        key = _span_dedupe_key(span)
        if key in seen:
            continue
        seen.add(key)
        out.append(span)
    return out


def _relation_after_dedupe(
    source_spans: list[ResolvedSpan],
    target_spans: list[ResolvedSpan],
    relation: RelationType,
) -> RelationType:
    """Recompute top-level relation from post-dedupe cardinalities when not complex."""
    if relation == RelationType.complex:
        return relation
    if not target_spans:
        return RelationType.exclude
    if len(source_spans) == 1 and len(target_spans) == 1:
        if (
            source_spans[0].book == target_spans[0].book
            and source_spans[0].chapter == target_spans[0].chapter
            and source_spans[0].verse == target_spans[0].verse
            and (source_spans[0].part or "") == (target_spans[0].part or "")
        ):
            return RelationType.one_to_one
        return relation
    if len(source_spans) > 1 and len(target_spans) == 1:
        return RelationType.merge
    if len(source_spans) == 1 and len(target_spans) > 1:
        return RelationType.split
    return relation


def _canonicalize_query_ref(
    session: Session,
    translation_id: UUID,
    ref: str,
    part: str | None,
) -> tuple[str, str | None]:
    """Rewrite a query ref to a combined-milestone anchor when coverage applies.

    Does not expand to ``verse_range``: multi-verse correspondence is carried by
    explicit ``split`` mapping rows on the source scheme (ingest ``splitVerses``),
    not by inventing per-verse query members that lack stored source spans.
    """
    ref_range = parse_ref(ref)
    if ref_range.verse_start != ref_range.verse_end:
        return ref, part
    span = find_stored_span(
        session,
        translation_id,
        book=ref_range.book,
        chapter=ref_range.chapter,
        verse=ref_range.verse_start,
        part=part,
    )
    if span is None or span.verse == ref_range.verse_start:
        return ref, part
    canonical = format_bcv(
        VerseId(
            book=span.book,
            chapter=span.chapter,
            verse=span.verse,
            part=None,
        )
    )
    logger.debug(
        "Canonicalized resolve query %s -> %s for translation=%s",
        ref,
        canonical,
        translation_id,
    )
    return canonical, part


@dataclass(frozen=True)
class ResolvePath:
    """Precomputed hop lists for one source/target scheme pair in one request.

    Valid only for the scheme pair it was built from. Reuse it for every member
    of a batch; do not cache it across requests or scheme changes.
    """

    # Source-side hops toward the shared ancestor.
    source_hops: list[Hop]
    # Target-side hops away from the shared ancestor.
    target_hops: list[Hop]


def build_resolve_path(
    session: Session,
    *,
    source_scheme: SchemeRef,
    target_scheme: SchemeRef,
) -> ResolvePath:
    """Load both scheme chains once and return hops for repeated ``assemble`` calls.

    Raises ``AppError`` ``422 validation_failed`` when the chains contain a cycle
    or share no ancestor (the same failures ``resolve()`` surfaces as
    ``LookupError``).
    """
    logger.debug(
        "Building resolve path source_scheme=%s target_scheme=%s",
        source_scheme.scheme_id,
        target_scheme.scheme_id,
    )
    try:
        src_chain = build_chain(session, source_scheme)
        tgt_chain = build_chain(session, target_scheme)
        ancestor = nearest_shared_translation(session, src_chain, tgt_chain)
        return ResolvePath(
            source_hops=hops_to_ancestor(src_chain, ancestor),
            target_hops=hops_from_ancestor(tgt_chain, ancestor),
        )
    except LookupError as exc:
        logger.error("Resolver path LookupError", exc_info=True)
        raise AppError(422, str(exc), code="validation_failed") from exc


def resolve_single_with_path(
    session: Session,
    *,
    from_translation: UUID,
    to_translation: UUID,
    ref: str,
    part: str | None,
    path: ResolvePath,
) -> ResolveResult:
    """Resolve one reference using a precomputed hop path (no chain SQL).

    Raises ``AppError`` ``400`` for bad BCV grammar and ``422`` for unexpected
    resolver ``LookupError`` during assemble.
    """
    source_scheme_id = path.source_hops[0].scheme_id if path.source_hops else None
    target_scheme_id = path.target_hops[0].scheme_id if path.target_hops else None
    logger.debug(
        "Resolving ref=%s part=%s source_scheme=%s target_scheme=%s",
        ref,
        part,
        source_scheme_id,
        target_scheme_id,
    )
    try:
        parse_ref(ref)
    except ReferenceError as exc:
        logger.error("Invalid resolve reference", exc_info=True)
        raise AppError(400, str(exc), code="bad_request") from exc

    resolve_ref, resolve_part = _canonicalize_query_ref(
        session,
        from_translation,
        ref,
        part,
    )

    try:
        members = expand(parse_ref(resolve_ref))
        if resolve_part is not None:
            members = [
                VerseId(
                    book=m.book,
                    chapter=m.chapter,
                    verse=m.verse,
                    part=resolve_part,
                )
                for m in members
            ]
        dto = assemble(members, path.source_hops, path.target_hops)
    except ReferenceError as exc:
        logger.error("Resolver ReferenceError", exc_info=True)
        raise AppError(400, str(exc), code="bad_request") from exc
    except LookupError as exc:
        logger.error("Resolver LookupError", exc_info=True)
        raise AppError(422, str(exc), code="validation_failed") from exc

    return _to_result(session, from_translation, to_translation, dto)


def resolve_single_with_schemes(
    session: Session,
    *,
    from_translation: UUID,
    to_translation: UUID,
    ref: str,
    part: str | None,
    source_scheme: SchemeRef,
    target_scheme: SchemeRef,
) -> ResolveResult:
    """Resolve one reference using pre-selected schemes (chapter batch path)."""
    logger.debug(
        "Resolving with schemes ref=%s from=%s to=%s",
        ref,
        from_translation,
        to_translation,
    )
    path = build_resolve_path(
        session,
        source_scheme=source_scheme,
        target_scheme=target_scheme,
    )
    return resolve_single_with_path(
        session,
        from_translation=from_translation,
        to_translation=to_translation,
        ref=ref,
        part=part,
        path=path,
    )


def _to_result(
    session: Session,
    source_translation: UUID,
    target_translation: UUID,
    dto: ResolutionDTO,
) -> ResolveResult:
    """Map a resolver DTO onto the HTTP ``ResolveResult`` contract."""
    source_rel = RelationType(dto.source_rel) if dto.source_rel is not None else None
    target_rel = RelationType(dto.target_rel) if dto.target_rel is not None else None
    source_spans = _dedupe_enriched(
        [_enrich_span(session, source_translation, s) for s in dto.source_spans]
    )
    target_spans = _dedupe_enriched(
        [_enrich_span(session, target_translation, t) for t in dto.target_spans]
    )
    relation = _relation_after_dedupe(
        source_spans,
        target_spans,
        RelationType(dto.relation),
    )
    return ResolveResult(
        source_spans=source_spans,
        target_spans=target_spans,
        relation=relation,
        edges=[
            ResolveEdge(
                source_index=e.source_index,
                target_index=e.target_index,
                relation=RelationType(e.relation),
            )
            for e in dto.edges
        ],
        source_rel=source_rel,
        target_rel=target_rel,
    )


def resolve_reference(
    session: Session,
    *,
    from_translation: UUID,
    to_translation: UUID,
    ref: str,
    part: str | None = None,
    from_versification: UUID | None = None,
    to_versification: UUID | None = None,
) -> ResolveResult:
    """Run resolve pre-checks, call the coordinate resolver, and enrich spans."""
    logger.debug(
        "Resolver port ref=%s from=%s to=%s",
        ref,
        from_translation,
        to_translation,
    )
    require_translation(session, from_translation)
    require_translation(session, to_translation)
    source_scheme = selected_scheme_ref(session, from_translation, from_versification)
    target_scheme = selected_scheme_ref(session, to_translation, to_versification)

    return resolve_single_with_schemes(
        session,
        from_translation=from_translation,
        to_translation=to_translation,
        ref=ref,
        part=part,
        source_scheme=source_scheme,
        target_scheme=target_scheme,
    )
