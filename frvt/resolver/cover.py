"""Covering-record lookup and range projection for a single hop."""

from __future__ import annotations

from dataclasses import dataclass

from frvt.api.logging_config import get_logger
from frvt.ingest.normalize import strip_part_suffix
from frvt.resolver.compose import invert_relation
from frvt.resolver.parse_ref import (
    covers,
    expand,
    format_bcv,
    index_in_range,
    parse_ref,
)
from frvt.resolver.types import MappingView, RefRange, VerseId

logger = get_logger(__name__)

# Zip-class relations that may trigger an unequal-length range hull.
ZIP_RANGE_RELATIONS: frozenset[str] = frozenset({"one_to_one", "shift", "renumber"})


def _range_length(ref_range: RefRange) -> int:
    """Return the inclusive verse count of ``ref_range``."""
    return ref_range.verse_end - ref_range.verse_start + 1


@dataclass(frozen=True)
class Projection:
    """Result of projecting one verse through a covering mapping record."""

    # Output verses after projection (empty when excluded).
    verses: tuple[VerseId, ...]
    # Relation contributed by this hop.
    relation: str
    # True when the hop is an exclusion with no counterpart.
    excluded: bool
    # Source-side siblings collected for a merge (emit with the queried verse).
    merge_siblings: tuple[VerseId, ...] = ()


def _parse_ref_plain(value: str) -> RefRange:
    """Parse a stored ref after stripping any legacy embedded part suffix."""
    plain, _ = strip_part_suffix(value)
    return parse_ref(plain)


def _record_range(record: MappingView, *, upward: bool) -> RefRange | None:
    """Return the cover side of ``record`` (source upward, base downward)."""
    raw = record.source_ref if upward else record.base_ref
    if raw is None:
        return None
    try:
        return _parse_ref_plain(raw)
    except ReferenceError:
        logger.error("Unparseable mapping ref %s", raw, exc_info=True)
        return None


def find_covering_record(
    mappings: tuple[MappingView, ...],
    verse: VerseId,
    *,
    upward: bool,
) -> MappingView | None:
    """Return the narrowest covering record for ``verse``, or None for identity.

    Prefer exact ``partial`` part matches when ``verse.part`` is set. Ties break
    on the smallest range length, then lowest ``ordinal``.
    """
    logger.trace(  # type: ignore[attr-defined]
        "Cover search verse=%s upward=%s", format_bcv(verse), upward
    )
    candidates: list[tuple[int, int, MappingView]] = []
    for record in mappings:
        if record.relation == "partial":
            # Whole-verse queries skip part rows; part queries need an exact match.
            if verse.part is None or record.part != verse.part:
                continue
        cover = _record_range(record, upward=upward)
        if cover is None:
            if not upward and record.relation == "exclude":
                continue
            continue
        probe = VerseId(
            book=verse.book, chapter=verse.chapter, verse=verse.verse, part=None
        )
        if not covers(cover, probe):
            continue
        width = cover.verse_end - cover.verse_start
        candidates.append((width, record.ordinal, record))

    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], item[1]))
    return candidates[0][2]


def unequal_zip_cover(
    record: MappingView,
    *,
    upward: bool,
) -> tuple[RefRange, RefRange] | None:
    """Return cover/output ranges when ``record`` is an unequal zip-class row.

    Cover is ``source_ref`` when climbing and ``base_ref`` when descending,
    matching ``find_covering_record``. ``partial`` rows never trigger a hull.
    """
    if record.relation not in ZIP_RANGE_RELATIONS:
        return None
    cover = _record_range(record, upward=upward)
    output = _record_range(record, upward=not upward)
    if cover is None or output is None:
        return None
    if _range_length(cover) == _range_length(output):
        return None
    return cover, output


def _zip_project(
    verse: VerseId,
    source_range: RefRange,
    base_range: RefRange,
    relation: str,
    part: str | None,
) -> Projection:
    """Zip ``verse`` by index from ``source_range`` into ``base_range`` (*Interim*)."""
    idx = index_in_range(source_range, verse)
    base_len = base_range.verse_end - base_range.verse_start + 1
    if idx >= base_len:
        idx = base_len - 1
        logger.debug(
            "Clamping zip index for %s into base range ending %s",
            format_bcv(verse),
            base_range.verse_end,
        )
    if (
        base_range.book != source_range.book
        or base_range.chapter != source_range.chapter
    ):
        # Cross-chapter / cross-book base: still zip within the base range length.
        out_verse = base_range.verse_start + idx
        if out_verse > base_range.verse_end:
            out_verse = base_range.verse_end
        target = VerseId(
            book=base_range.book,
            chapter=base_range.chapter,
            verse=out_verse,
            part=part,
        )
    else:
        target = VerseId(
            book=base_range.book,
            chapter=base_range.chapter,
            verse=base_range.verse_start + idx,
            part=part,
        )
    return Projection(verses=(target,), relation=relation, excluded=False)


def project_through(
    verse: VerseId,
    record: MappingView,
    *,
    upward: bool,
) -> Projection:
    """Project ``verse`` through ``record`` (swap sides when ``upward`` is false)."""
    relation = record.relation if upward else invert_relation(record.relation)
    src_raw = record.source_ref if upward else record.base_ref
    base_raw = record.base_ref if upward else record.source_ref

    if relation == "exclude":
        return Projection(verses=(), relation="exclude", excluded=True)

    assert src_raw is not None
    if base_raw is None:
        if relation != "merge":
            return Projection(verses=(), relation="exclude", excluded=True)
        # A base-less merge collapses onto the first coordinate in its own range.
        source = _parse_ref_plain(src_raw)
        base_raw = format_bcv(
            VerseId(
                book=source.book,
                chapter=source.chapter,
                verse=source.verse_start,
            )
        )
    source_range = _parse_ref_plain(src_raw)
    base_range = _parse_ref_plain(base_raw)

    if relation == "merge":
        # All source verses collapse to the first base verse; collect siblings.
        siblings = tuple(
            VerseId(book=v.book, chapter=v.chapter, verse=v.verse, part=verse.part)
            for v in expand(source_range)
        )
        target = VerseId(
            book=base_range.book,
            chapter=base_range.chapter,
            verse=base_range.verse_start,
            part=verse.part,
        )
        return Projection(
            verses=(target,),
            relation="merge",
            excluded=False,
            merge_siblings=siblings,
        )

    if relation == "split":
        targets = tuple(
            VerseId(book=v.book, chapter=v.chapter, verse=v.verse, part=verse.part)
            for v in expand(base_range)
        )
        return Projection(verses=targets, relation="split", excluded=False)

    if relation == "partial":
        part = record.part if upward else verse.part or record.part
        return _zip_project(verse, source_range, base_range, "partial", part)

    return _zip_project(verse, source_range, base_range, relation, verse.part)


def apply_identity(verse: VerseId) -> Projection:
    """Return an identity projection when no covering record exists."""
    return Projection(verses=(verse,), relation="one_to_one", excluded=False)


def project_verse(
    verse: VerseId,
    mappings: tuple[MappingView, ...],
    *,
    upward: bool,
) -> Projection:
    """Find a covering record (or identity) and project ``verse`` through it."""
    record = find_covering_record(mappings, verse, upward=upward)
    if record is None:
        return apply_identity(verse)
    return project_through(verse, record, upward=upward)
