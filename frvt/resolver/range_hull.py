"""Unequal-length zip range hull detection and assembly."""

from __future__ import annotations

from dataclasses import dataclass

from frvt.api.logging_config import get_logger
from frvt.resolver.compose import compose, dominant_relation
from frvt.resolver.cover import find_covering_record, project_verse, unequal_zip_cover
from frvt.resolver.parse_ref import expand
from frvt.resolver.types import (
    Hop,
    MappingView,
    RefRange,
    ResolutionDTO,
    ResolutionEdgeDTO,
    VerseId,
)
from frvt.resolver.walk import (
    apply_hops_downward,
    apply_hops_forward,
    piv_of_target,
    sort_verses,
    src_of_pivot,
    to_span,
)

logger = get_logger(__name__)


@dataclass(frozen=True)
class RangeTrigger:
    """One unequal zip cover that may promote a resolve to a range hull."""

    # ``source`` when the trigger hop is on ``src_hops``; ``target`` on ``tgt_hops``.
    side: str
    # Index of the triggering hop on its hop list.
    hop_index: int
    # Hop-local cover range for the unequal zip row.
    cover: RefRange
    # Hop-local output range for the unequal zip row.
    output: RefRange
    # Cover width used for narrowest-cover tie-break (§6.3).
    width: int
    # Mapping row ordinal for secondary tie-break.
    ordinal: int


@dataclass(frozen=True)
class ParticipantWalk:
    """Full hop walk for one range-hull participant source verse."""

    # Pivot verses after climbing ``src_hops``.
    pivots: tuple[VerseId, ...]
    # Target verses after descending ``tgt_hops``.
    targets: tuple[VerseId, ...]
    # Composed relation across source hops only.
    up_rel: str
    # Composed relation across target hops only.
    down_rel: str
    # ``compose(up_rel, down_rel)`` for connector labeling.
    composed: str


def _trigger_order(trigger: RangeTrigger) -> tuple[int, int, int, int]:
    """Sort key: width, ordinal, prefer source side, then hop proximity."""
    side_rank = 0 if trigger.side == "source" else 1
    hop_rank = trigger.hop_index if trigger.side == "source" else -trigger.hop_index
    return (trigger.width, trigger.ordinal, side_rank, hop_rank)


def _candidate_from_record(
    record: MappingView,
    *,
    side: str,
    hop_index: int,
    upward: bool,
) -> RangeTrigger | None:
    """Build a trigger candidate from one covering record, or None."""
    pair = unequal_zip_cover(record, upward=upward)
    if pair is None:
        return None
    cover, output = pair
    return RangeTrigger(
        side=side,
        hop_index=hop_index,
        cover=cover,
        output=output,
        width=cover.verse_end - cover.verse_start,
        ordinal=record.ordinal,
    )


def find_range_trigger(
    members: list[VerseId],
    src_hops: list[Hop],
    tgt_hops: list[Hop],
) -> RangeTrigger | None:
    """Return the narrowest unequal zip cover on the resolve path, or None."""
    if any(member.part for member in members):
        return None

    candidates: list[RangeTrigger] = []
    current = list(members)
    for hop_index, hop in enumerate(src_hops):
        for verse in current:
            record = find_covering_record(hop.mappings, verse, upward=True)
            if record is None:
                continue
            candidate = _candidate_from_record(
                record, side="source", hop_index=hop_index, upward=True
            )
            if candidate is not None:
                candidates.append(candidate)
        next_current: list[VerseId] = []
        for verse in current:
            projection = project_verse(verse, hop.mappings, upward=True)
            if projection.excluded:
                continue
            next_current.extend(projection.verses)
        current = sort_verses(set(next_current))
        if not current:
            break

    pivots = current
    current = list(pivots)
    for hop_index, hop in enumerate(tgt_hops):
        for verse in current:
            record = find_covering_record(hop.mappings, verse, upward=False)
            if record is None:
                continue
            candidate = _candidate_from_record(
                record, side="target", hop_index=hop_index, upward=False
            )
            if candidate is not None:
                candidates.append(candidate)
        next_current = []
        for verse in current:
            projection = project_verse(verse, hop.mappings, upward=False)
            if projection.excluded:
                continue
            next_current.extend(projection.verses)
        current = sort_verses(set(next_current))
        if not current:
            break

    if not candidates:
        return None
    chosen = min(candidates, key=_trigger_order)
    logger.debug(
        "Range trigger side=%s hop_index=%s cover=%s:%s-%s",
        chosen.side,
        chosen.hop_index,
        chosen.cover.book,
        chosen.cover.chapter,
        f"{chosen.cover.verse_start}-{chosen.cover.verse_end}",
    )
    return chosen


def _participants_for_trigger(
    trigger: RangeTrigger,
    src_hops: list[Hop],
    tgt_hops: list[Hop],
) -> set[VerseId]:
    """Map the trigger cover back to query-side source coordinates."""
    cover_verses = expand(trigger.cover)
    participants: set[VerseId] = set()
    prefix_src = src_hops[: trigger.hop_index]
    prefix_tgt = tgt_hops[: trigger.hop_index]
    for verse in cover_verses:
        if trigger.side == "source":
            for pivot in src_of_pivot(verse, prefix_src):
                participants.add(pivot)
        else:
            for pivot in piv_of_target(verse, prefix_tgt):
                for source in src_of_pivot(pivot, src_hops):
                    participants.add(source)
    return participants


def _walk_participant(
    source: VerseId,
    src_hops: list[Hop],
    tgt_hops: list[Hop],
) -> ParticipantWalk | None:
    """Walk one participant through full chains, or None when excluded."""
    pivots, up_rel, up_ex, _ = apply_hops_forward([source], src_hops)
    if up_ex and not pivots:
        return None
    targets, down_rel, down_ex = apply_hops_downward(pivots, tgt_hops)
    if down_ex and not targets:
        return None
    return ParticipantWalk(
        pivots=tuple(pivots),
        targets=tuple(targets),
        up_rel=up_rel,
        down_rel=down_rel,
        composed=compose(up_rel, down_rel),
    )


def _walk_has_fanout(walk: ParticipantWalk) -> bool:
    """Return whether a participant walk fans out via split or merge."""
    return (
        len(walk.targets) > 1
        or walk.up_rel in ("split", "merge")
        or walk.down_rel in ("split", "merge")
    )


def _source_axis_only_fanout(walk: ParticipantWalk) -> bool:
    """Return whether fan-out stays on the source climb with one target."""
    return (
        walk.up_rel in ("split", "merge")
        and len(walk.targets) == 1
        and walk.down_rel not in ("split", "merge")
    )


def _interior_requires_complex(
    trigger: RangeTrigger,
    interior_walks: list[ParticipantWalk],
) -> bool:
    """Return whether interior split/merge must surface as ``complex``."""
    for walk in interior_walks:
        if not _walk_has_fanout(walk):
            continue
        if len(walk.targets) > 1 or walk.down_rel in ("split", "merge"):
            return True
        if _source_axis_only_fanout(walk) and trigger.side == "source":
            continue
        return True
    return False


def _composed_axis_labels(
    trigger: RangeTrigger,
    walks: list[ParticipantWalk],
) -> tuple[str | None, str | None]:
    """Build hub axis labels for unequal zip composed with split/merge."""
    up_rels = [walk.up_rel for walk in walks]
    down_rels = [walk.down_rel for walk in walks]
    if trigger.side == "source":
        return "range", dominant_relation(down_rels)
    return dominant_relation(up_rels), "range"


def _corner_edges(
    source_list: list[VerseId],
    target_list: list[VerseId],
    walks: dict[VerseId, ParticipantWalk],
) -> tuple[ResolutionEdgeDTO, ...]:
    """Emit connector edges for hull corners only (× corner fan-out)."""
    source_index = {verse: index for index, verse in enumerate(source_list)}
    target_index = {verse: index for index, verse in enumerate(target_list)}
    corners = (source_list[0], source_list[-1])
    edges: list[ResolutionEdgeDTO] = []
    seen: set[tuple[int, int]] = set()
    for source in corners:
        walk = walks[source]
        for target in walk.targets:
            pair = (source_index[source], target_index[target])
            if pair in seen:
                continue
            seen.add(pair)
            edges.append(
                ResolutionEdgeDTO(
                    source_index=pair[0],
                    target_index=pair[1],
                    relation=walk.composed,
                )
            )
    return tuple(edges)


def build_range_hull(
    trigger: RangeTrigger,
    members: list[VerseId],
    src_hops: list[Hop],
    tgt_hops: list[Hop],
) -> ResolutionDTO | None:
    """Build the unequal-zip hull, or None to decline back to the atomic path."""
    logger.debug("Building range hull for trigger side=%s", trigger.side)
    participants = _participants_for_trigger(trigger, src_hops, tgt_hops)
    member_set = set(members)

    if len(participants) < 2:
        logger.debug("Range hull declined: fewer than two participants")
        return None
    if not member_set.issubset(participants):
        logger.debug("Range hull declined: query members outside participant cover")
        return None

    source_list = sort_verses(participants)
    walks: dict[VerseId, ParticipantWalk] = {}
    all_targets: set[VerseId] = set()

    for source in source_list:
        walk = _walk_participant(source, src_hops, tgt_hops)
        if walk is None:
            logger.debug("Range hull declined: excluded participant %s", source)
            return None
        walks[source] = walk
        all_targets.update(walk.targets)

    target_list = sort_verses(all_targets)
    if not target_list:
        logger.debug("Range hull declined: empty target set")
        return None

    corner_sources = (source_list[0], source_list[-1])
    corner_walks = [walks[source] for source in corner_sources]
    interior_sources = source_list[1:-1]
    interior_walks = [walks[source] for source in interior_sources]
    corner_fanout = any(_walk_has_fanout(walk) for walk in corner_walks)
    interior_complex = _interior_requires_complex(trigger, interior_walks)
    escalate_complex = corner_fanout or interior_complex

    if len(source_list) == len(target_list) and not escalate_complex:
        logger.debug("Range hull declined: equal source/target cardinality")
        return None

    edges = _corner_edges(source_list, target_list, walks)
    if escalate_complex:
        label_walks = list(walks[source] for source in source_list)
        source_rel, target_rel = _composed_axis_labels(trigger, label_walks)
        logger.debug(
            "Range hull escalated to complex source_rel=%s target_rel=%s "
            "(corner_fanout=%s interior_complex=%s)",
            source_rel,
            target_rel,
            corner_fanout,
            interior_complex,
        )
        return ResolutionDTO(
            source_spans=tuple(to_span(source) for source in source_list),
            target_spans=tuple(to_span(target) for target in target_list),
            relation="complex",
            edges=edges,
            source_rel=source_rel,
            target_rel=target_rel,
        )

    return ResolutionDTO(
        source_spans=tuple(to_span(s) for s in source_list),
        target_spans=tuple(to_span(t) for t in target_list),
        relation="range",
        edges=edges,
    )
