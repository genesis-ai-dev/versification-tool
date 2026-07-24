"""Coordinate-only reference resolution across versification schemes."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from frvt.api.config import get_settings
from frvt.api.logging_config import get_logger
from frvt.resolver.chains import (
    build_chain,
    hops_from_ancestor,
    hops_to_ancestor,
    nearest_shared_translation,
    preferred_scheme_ref,
)
from frvt.resolver.compose import compose
from frvt.resolver.cover import project_verse
from frvt.resolver.parse_ref import expand, format_bcv, parse_ref
from frvt.resolver.types import (
    Hop,
    ResolutionDTO,
    ResolutionEdgeDTO,
    ResolvedSpanDTO,
    SchemeRef,
    VerseId,
)

logger = get_logger(__name__)


def _select_scheme(
    session: Session,
    scheme: SchemeRef | None,
    translation_id: UUID | None,
) -> SchemeRef:
    """Resolve a concrete scheme from an explicit ref or a translation preferred."""
    if scheme is not None:
        return scheme
    if translation_id is None:
        raise LookupError("Scheme or translation id required for each resolve side")
    preferred = preferred_scheme_ref(session, translation_id)
    if preferred is None:
        raise LookupError(f"No preferred scheme for translation {translation_id}")
    return preferred


def _sort_verses(verses: list[VerseId] | set[VerseId]) -> list[VerseId]:
    """Sort verses by book, chapter, verse, then part for stable emission."""
    return sorted(
        verses,
        key=lambda v: (v.book, v.chapter, v.verse, v.part or ""),
    )


def _to_span(verse: VerseId) -> ResolvedSpanDTO:
    """Convert a ``VerseId`` into a resolver span DTO."""
    return ResolvedSpanDTO(ref=format_bcv(verse), part=verse.part)


def _is_contiguous(verses: list[VerseId]) -> bool:
    """Return whether sorted verses form one same-book, same-chapter sequence."""
    if len(verses) < 2:
        return True
    first = verses[0]
    return all(
        verse.book == first.book
        and verse.chapter == first.chapter
        and verse.verse == first.verse + index
        for index, verse in enumerate(verses)
    )


def _apply_hops_forward(
    verses: list[VerseId], hops: list[Hop]
) -> tuple[list[VerseId], str, bool, list[VerseId]]:
    """Apply upward hops; return (out, relation, excluded, merge_siblings)."""
    current = list(verses)
    relation = "one_to_one"
    excluded = False
    merge_siblings: list[VerseId] = []
    for hop in hops:
        next_verses: list[VerseId] = []
        for verse in current:
            projection = project_verse(verse, hop.mappings, upward=True)
            relation = compose(relation, projection.relation)
            if projection.excluded:
                excluded = True
                continue
            next_verses.extend(projection.verses)
            if projection.merge_siblings:
                merge_siblings.extend(projection.merge_siblings)
        current = _sort_verses(set(next_verses))
        if excluded and not current:
            break
    return current, relation, excluded, _sort_verses(set(merge_siblings))


def _apply_hops_downward(
    verses: list[VerseId], hops: list[Hop]
) -> tuple[list[VerseId], str, bool]:
    """Apply downward (inverted) hops from ancestor numbering toward the target."""
    current = list(verses)
    relation = "one_to_one"
    excluded = False
    for hop in hops:
        next_verses: list[VerseId] = []
        for verse in current:
            projection = project_verse(verse, hop.mappings, upward=False)
            relation = compose(relation, projection.relation)
            if projection.excluded:
                excluded = True
                continue
            next_verses.extend(projection.verses)
        current = _sort_verses(set(next_verses))
        if excluded and not current:
            break
    return current, relation, excluded


def _up_set(verse: VerseId, hops: list[Hop]) -> set[VerseId]:
    """Pivot verses reached by walking ``verse`` upward through ``hops``."""
    out, _, excluded, _ = _apply_hops_forward([verse], hops)
    return set() if excluded else set(out)


def _down_set(verse: VerseId, hops: list[Hop]) -> set[VerseId]:
    """Target verses reached by walking ``verse`` downward through ``hops``."""
    out, _, excluded = _apply_hops_downward([verse], hops)
    return set() if excluded else set(out)


def _src_of_pivot(pivot: VerseId, hops: list[Hop]) -> set[VerseId]:
    """Source verses that map upward onto ``pivot`` (invert the upward hops)."""
    # Invert: start from pivot, walk hops downward (base→source) in reverse.
    inverted = list(reversed(hops))
    return _down_set(pivot, inverted)


def _piv_of_target(target: VerseId, hops: list[Hop]) -> set[VerseId]:
    """Pivot verses that map downward onto ``target`` (invert the downward hops)."""
    inverted = list(reversed(hops))
    return _up_set(target, inverted)


def _edge_relation(
    source: VerseId,
    pivot: VerseId,
    target: VerseId,
    src_hops: list[Hop],
    tgt_hops: list[Hop],
) -> str:
    """Compose the per-connector relation for one source↔pivot↔target path."""
    up_out, up_rel, up_ex, _ = _apply_hops_forward([source], src_hops)
    if up_ex or pivot not in up_out:
        up_rel = "one_to_one"
    down_out, down_rel, down_ex = _apply_hops_downward([pivot], tgt_hops)
    if down_ex or target not in down_out:
        down_rel = "one_to_one"
    return compose(up_rel, down_rel)


def build_hull(
    members: list[VerseId],
    src_hops: list[Hop],
    tgt_hops: list[Hop],
) -> ResolutionDTO:
    """Build the connected many-to-many hull seeded by ``members``."""
    logger.debug("Building complex hull for %s member(s)", len(members))
    sources: set[VerseId] = set()
    pivots: set[VerseId] = set()
    targets: set[VerseId] = set()
    seen: set[tuple[str, VerseId]] = set()
    worklist: list[tuple[str, VerseId]] = [("source", m) for m in members]

    while worklist:
        kind, node = worklist.pop()
        key = (kind, node)
        if key in seen:
            continue
        seen.add(key)
        if kind == "source":
            sources.add(node)
            for pivot in _up_set(node, src_hops):
                worklist.append(("pivot", pivot))
        elif kind == "pivot":
            pivots.add(node)
            for source in _src_of_pivot(node, src_hops):
                worklist.append(("source", source))
            for target in _down_set(node, tgt_hops):
                worklist.append(("target", target))
        else:
            targets.add(node)
            for pivot in _piv_of_target(node, tgt_hops):
                worklist.append(("pivot", pivot))

    source_list = _sort_verses(sources)
    target_list = _sort_verses(targets)

    if get_settings().resolve_trace_pivots:
        logger.trace(  # type: ignore[attr-defined]
            "Hull pivots=%s sources=%s targets=%s",
            [format_bcv(p) for p in _sort_verses(pivots)],
            [format_bcv(s) for s in source_list],
            [format_bcv(t) for t in target_list],
        )

    if not target_list:
        return ResolutionDTO(
            source_spans=tuple(_to_span(s) for s in source_list or members),
            target_spans=(),
            relation="exclude",
            edges=(),
        )

    if len(source_list) <= 1 and len(target_list) <= 1:
        rel = "one_to_one"
        if source_list and target_list and pivots:
            rel = _edge_relation(
                source_list[0], next(iter(pivots)), target_list[0], src_hops, tgt_hops
            )
        return ResolutionDTO(
            source_spans=tuple(_to_span(s) for s in source_list),
            target_spans=tuple(_to_span(t) for t in target_list),
            relation=rel,
            edges=(),
        )

    # Atomic split / merge: keep cardinality without complex edges.
    if len(source_list) == 1 and len(target_list) > 1:
        return ResolutionDTO(
            source_spans=tuple(_to_span(s) for s in source_list),
            target_spans=tuple(_to_span(t) for t in target_list),
            relation="split",
            edges=(),
        )
    if len(source_list) > 1 and len(target_list) == 1:
        return ResolutionDTO(
            source_spans=tuple(_to_span(s) for s in source_list),
            target_spans=tuple(_to_span(t) for t in target_list),
            relation="merge",
            edges=(),
        )

    edges: list[ResolutionEdgeDTO] = []
    seen_edge: set[tuple[int, int]] = set()
    source_index = {v: i for i, v in enumerate(source_list)}
    target_index = {v: i for i, v in enumerate(target_list)}
    for pivot in pivots:
        for source in _src_of_pivot(pivot, src_hops):
            if source not in source_index:
                continue
            for target in _down_set(pivot, tgt_hops):
                if target not in target_index:
                    continue
                pair = (source_index[source], target_index[target])
                if pair in seen_edge:
                    continue
                seen_edge.add(pair)
                edges.append(
                    ResolutionEdgeDTO(
                        source_index=pair[0],
                        target_index=pair[1],
                        relation=_edge_relation(
                            source, pivot, target, src_hops, tgt_hops
                        ),
                    )
                )

    return ResolutionDTO(
        source_spans=tuple(_to_span(s) for s in source_list),
        target_spans=tuple(_to_span(t) for t in target_list),
        relation="complex",
        edges=tuple(edges),
    )


def _atomic_result(
    members: list[VerseId],
    src_hops: list[Hop],
    tgt_hops: list[Hop],
) -> ResolutionDTO:
    """Resolve members along a single path and emit an atomic (non-hull) result."""
    all_sources: set[VerseId] = set(members)
    all_targets: set[VerseId] = set()
    member_relations: set[str] = set()

    for member in members:
        pivots, up_rel, up_ex, merge_sibs = _apply_hops_forward([member], src_hops)
        member_sources = {member, *merge_sibs}
        if merge_sibs:
            all_sources.update(merge_sibs)
        if up_ex and not pivots:
            member_relations.add("exclude")
            continue
        targets, down_rel, down_ex = _apply_hops_downward(pivots, tgt_hops)
        if down_ex and not targets:
            member_relations.add("exclude")
            continue
        member_relation = compose(up_rel, down_rel)
        member_relations.add(member_relation)
        if len(member_sources) > 1 and len(targets) > 1:
            return build_hull(members, src_hops, tgt_hops)
        all_targets.update(targets)

    source_list = _sort_verses(all_sources)
    target_list = _sort_verses(all_targets)

    if member_relations == {"exclude"}:
        return ResolutionDTO(
            source_spans=tuple(_to_span(s) for s in source_list),
            target_spans=(),
            relation="exclude",
            edges=(),
        )

    if (
        len(member_relations) != 1
        or not _is_contiguous(source_list)
        or not _is_contiguous(target_list)
    ):
        return build_hull(members, src_hops, tgt_hops)

    relation = next(iter(member_relations), "one_to_one")
    if len(source_list) == 1 and len(target_list) > 1:
        relation = "split"
    elif len(source_list) > 1 and len(target_list) == 1:
        relation = "merge"

    return ResolutionDTO(
        source_spans=tuple(_to_span(s) for s in source_list),
        target_spans=tuple(_to_span(t) for t in target_list),
        relation=relation,
        edges=(),
    )


def resolve(
    session: Session,
    source_ref: str,
    *,
    source_scheme: SchemeRef | None = None,
    target_scheme: SchemeRef | None = None,
    source_translation: UUID | None = None,
    target_translation: UUID | None = None,
    part: str | None = None,
) -> ResolutionDTO:
    """Resolve ``source_ref`` from the source scheme to the target scheme.

    Coordinate-only: never reads verse text. Raises ``ReferenceError`` for bad
    grammar and ``LookupError`` when schemes/ancestors cannot be loaded.
    """
    logger.debug(
        "Resolving ref=%s part=%s source_scheme=%s target_scheme=%s",
        source_ref,
        part,
        getattr(source_scheme, "scheme_id", None),
        getattr(target_scheme, "scheme_id", None),
    )
    src = _select_scheme(session, source_scheme, source_translation)
    tgt = _select_scheme(session, target_scheme, target_translation)

    members = expand(parse_ref(source_ref))
    if part is not None:
        members = [
            VerseId(book=m.book, chapter=m.chapter, verse=m.verse, part=part)
            for m in members
        ]

    src_chain = build_chain(session, src)
    tgt_chain = build_chain(session, tgt)
    ancestor = nearest_shared_translation(session, src_chain, tgt_chain)
    src_hops = hops_to_ancestor(src_chain, ancestor)
    tgt_hops = hops_from_ancestor(tgt_chain, ancestor)

    return _atomic_result(members, src_hops, tgt_hops)
