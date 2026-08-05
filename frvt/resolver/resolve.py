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
from frvt.resolver.compose import compose, dominant_relation
from frvt.resolver.normalize import normalize_same_bcv
from frvt.resolver.parse_ref import expand, format_bcv, parse_ref
from frvt.resolver.range_hull import build_range_hull, find_range_trigger
from frvt.resolver.types import (
    Hop,
    ResolutionDTO,
    ResolutionEdgeDTO,
    SchemeRef,
    VerseId,
)
from frvt.resolver.walk import (
    apply_hops_downward,
    apply_hops_forward,
    down_set,
    edge_legs,
    edge_relation,
    is_contiguous,
    piv_of_target,
    sort_verses,
    src_of_pivot,
    to_span,
    up_set,
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
            for pivot in up_set(node, src_hops):
                worklist.append(("pivot", pivot))
        elif kind == "pivot":
            pivots.add(node)
            for source in src_of_pivot(node, src_hops):
                worklist.append(("source", source))
            for target in down_set(node, tgt_hops):
                worklist.append(("target", target))
        else:
            targets.add(node)
            for pivot in piv_of_target(node, tgt_hops):
                worklist.append(("pivot", pivot))

    source_list = sort_verses(sources)
    target_list = sort_verses(targets)

    if get_settings().resolve_trace_pivots:
        logger.trace(  # type: ignore[attr-defined]
            "Hull pivots=%s sources=%s targets=%s",
            [format_bcv(p) for p in sort_verses(pivots)],
            [format_bcv(s) for s in source_list],
            [format_bcv(t) for t in target_list],
        )

    if not target_list:
        return ResolutionDTO(
            source_spans=tuple(to_span(s) for s in source_list or members),
            target_spans=(),
            relation="exclude",
            edges=(),
        )

    if len(source_list) <= 1 and len(target_list) <= 1:
        rel = "one_to_one"
        if source_list and target_list and pivots:
            rel = edge_relation(
                source_list[0], next(iter(pivots)), target_list[0], src_hops, tgt_hops
            )
        return ResolutionDTO(
            source_spans=tuple(to_span(s) for s in source_list),
            target_spans=tuple(to_span(t) for t in target_list),
            relation=rel,
            edges=(),
        )

    if len(source_list) == 1 and len(target_list) > 1:
        return ResolutionDTO(
            source_spans=tuple(to_span(s) for s in source_list),
            target_spans=tuple(to_span(t) for t in target_list),
            relation="split",
            edges=(),
        )
    if len(source_list) > 1 and len(target_list) == 1:
        return ResolutionDTO(
            source_spans=tuple(to_span(s) for s in source_list),
            target_spans=tuple(to_span(t) for t in target_list),
            relation="merge",
            edges=(),
        )

    edges: list[ResolutionEdgeDTO] = []
    up_rels: list[str] = []
    down_rels: list[str] = []
    seen_edge: set[tuple[int, int]] = set()
    source_index = {v: i for i, v in enumerate(source_list)}
    target_index = {v: i for i, v in enumerate(target_list)}
    for pivot in pivots:
        for source in src_of_pivot(pivot, src_hops):
            if source not in source_index:
                continue
            for target in down_set(pivot, tgt_hops):
                if target not in target_index:
                    continue
                pair = (source_index[source], target_index[target])
                if pair in seen_edge:
                    continue
                seen_edge.add(pair)
                up_rel, down_rel, composed = edge_legs(
                    source, pivot, target, src_hops, tgt_hops
                )
                up_rels.append(up_rel)
                down_rels.append(down_rel)
                edges.append(
                    ResolutionEdgeDTO(
                        source_index=pair[0],
                        target_index=pair[1],
                        relation=composed,
                    )
                )

    return ResolutionDTO(
        source_spans=tuple(to_span(s) for s in source_list),
        target_spans=tuple(to_span(t) for t in target_list),
        relation="complex",
        edges=tuple(edges),
        source_rel=dominant_relation(up_rels),
        target_rel=dominant_relation(down_rels),
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
        pivots, up_rel, up_ex, merge_sibs = apply_hops_forward([member], src_hops)
        member_sources = {member, *merge_sibs}
        if merge_sibs:
            all_sources.update(merge_sibs)
        if up_ex and not pivots:
            member_relations.add("exclude")
            continue
        targets, down_rel, down_ex = apply_hops_downward(pivots, tgt_hops)
        if down_ex and not targets:
            member_relations.add("exclude")
            continue
        member_relation = compose(up_rel, down_rel)
        member_relations.add(member_relation)
        if up_rel in ("split", "merge") or down_rel in ("split", "merge"):
            return build_hull(members, src_hops, tgt_hops)
        if len(member_sources) > 1 and len(targets) > 1:
            return build_hull(members, src_hops, tgt_hops)
        all_targets.update(targets)

    source_list = sort_verses(all_sources)
    target_list = sort_verses(all_targets)

    if member_relations == {"exclude"}:
        return ResolutionDTO(
            source_spans=tuple(to_span(s) for s in source_list),
            target_spans=(),
            relation="exclude",
            edges=(),
        )

    if (
        len(member_relations) != 1
        or not is_contiguous(source_list)
        or not is_contiguous(target_list)
    ):
        return build_hull(members, src_hops, tgt_hops)

    relation = next(iter(member_relations), "one_to_one")
    if len(source_list) == 1 and len(target_list) > 1:
        relation = "split"
    elif len(source_list) > 1 and len(target_list) == 1:
        relation = "merge"

    return ResolutionDTO(
        source_spans=tuple(to_span(s) for s in source_list),
        target_spans=tuple(to_span(t) for t in target_list),
        relation=relation,
        edges=(),
    )


def assemble(
    members: list[VerseId],
    src_hops: list[Hop],
    tgt_hops: list[Hop],
) -> ResolutionDTO:
    """Resolve members and apply post-assembly normalization (single entry point)."""
    logger.debug("Assembling resolve for %s member(s)", len(members))
    trigger = find_range_trigger(members, src_hops, tgt_hops)
    if trigger is not None:
        hull = build_hull(members, src_hops, tgt_hops)
        if hull.relation == "complex":
            return hull
        ranged = build_range_hull(trigger, members, src_hops, tgt_hops)
        if ranged is not None:
            return normalize_same_bcv(ranged)
    return normalize_same_bcv(_atomic_result(members, src_hops, tgt_hops))


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

    return assemble(members, src_hops, tgt_hops)
