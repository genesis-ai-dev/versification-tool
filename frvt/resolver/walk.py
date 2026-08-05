"""Hop walking and per-connector leg composition for reference resolution."""

from __future__ import annotations

from frvt.api.logging_config import get_logger
from frvt.resolver.compose import compose
from frvt.resolver.cover import project_verse
from frvt.resolver.parse_ref import format_bcv
from frvt.resolver.types import Hop, ResolvedSpanDTO, VerseId

logger = get_logger(__name__)


def sort_verses(verses: list[VerseId] | set[VerseId]) -> list[VerseId]:
    """Sort verses by book, chapter, verse, then part for stable emission."""
    return sorted(
        verses,
        key=lambda v: (v.book, v.chapter, v.verse, v.part or ""),
    )


def to_span(verse: VerseId) -> ResolvedSpanDTO:
    """Convert a ``VerseId`` into a resolver span DTO."""
    return ResolvedSpanDTO(ref=format_bcv(verse), part=verse.part)


def is_contiguous(verses: list[VerseId]) -> bool:
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


def apply_hops_forward(
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
        current = sort_verses(set(next_verses))
        if excluded and not current:
            break
    return current, relation, excluded, sort_verses(set(merge_siblings))


def apply_hops_downward(
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
        current = sort_verses(set(next_verses))
        if excluded and not current:
            break
    return current, relation, excluded


def up_set(verse: VerseId, hops: list[Hop]) -> set[VerseId]:
    """Pivot verses reached by walking ``verse`` upward through ``hops``."""
    out, _, excluded, _ = apply_hops_forward([verse], hops)
    return set() if excluded else set(out)


def down_set(verse: VerseId, hops: list[Hop]) -> set[VerseId]:
    """Target verses reached by walking ``verse`` downward through ``hops``."""
    out, _, excluded = apply_hops_downward([verse], hops)
    return set() if excluded else set(out)


def src_of_pivot(pivot: VerseId, hops: list[Hop]) -> set[VerseId]:
    """Source verses that map upward onto ``pivot`` (invert the upward hops)."""
    inverted = list(reversed(hops))
    return down_set(pivot, inverted)


def piv_of_target(target: VerseId, hops: list[Hop]) -> set[VerseId]:
    """Pivot verses that map downward onto ``target`` (invert the downward hops)."""
    inverted = list(reversed(hops))
    return up_set(target, inverted)


def edge_legs(
    source: VerseId,
    pivot: VerseId,
    target: VerseId,
    src_hops: list[Hop],
    tgt_hops: list[Hop],
) -> tuple[str, str, str]:
    """Return (source_leg, target_leg, composed) for one source-pivot-target path."""
    up_out, up_rel, up_ex, _ = apply_hops_forward([source], src_hops)
    if up_ex or pivot not in up_out:
        up_rel = "one_to_one"
    down_out, down_rel, down_ex = apply_hops_downward([pivot], tgt_hops)
    if down_ex or target not in down_out:
        down_rel = "one_to_one"
    return up_rel, down_rel, compose(up_rel, down_rel)


def edge_relation(
    source: VerseId,
    pivot: VerseId,
    target: VerseId,
    src_hops: list[Hop],
    tgt_hops: list[Hop],
) -> str:
    """Compose the per-connector relation for one source↔pivot↔target path."""
    return edge_legs(source, pivot, target, src_hops, tgt_hops)[2]
