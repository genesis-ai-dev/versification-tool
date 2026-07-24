"""Navigation, deltas, and misalignment jump-menu endpoints."""

from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from frvt.api.db import get_session
from frvt.api.logging_config import get_logger
from frvt.api.models import MappingRecord, VerseSpan
from frvt.api.schemas import (
    DeltaEntry,
    MisalignmentEntry,
    NavBook,
    NavRef,
    Page,
    RelationType,
)
from frvt.api.scheme_select import (
    clamp_page,
    require_scheme,
    require_translation,
    selected_scheme_ref,
)
from frvt.ingest.normalize import strip_part_suffix
from frvt.resolver.compose import invert_relation
from frvt.resolver.parse_ref import format_bcv, parse_ref
from frvt.resolver.types import VerseId

logger = get_logger(__name__)

router = APIRouter(tags=["navigation"])

# Known NT omission books used by the misalignment categorizer.
_NT_BOOKS = frozenset(
    {
        "MAT",
        "MRK",
        "LUK",
        "JHN",
        "ACT",
        "ROM",
        "1CO",
        "2CO",
        "GAL",
        "EPH",
        "PHP",
        "COL",
        "1TH",
        "2TH",
        "1TI",
        "2TI",
        "TIT",
        "PHM",
        "HEB",
        "JAS",
        "1PE",
        "2PE",
        "1JN",
        "2JN",
        "3JN",
        "JUD",
        "REV",
    }
)


@dataclass(frozen=True)
class JumpMapping:
    """One scheme difference normalized into the from-side navigation direction."""

    # Coordinate to navigate on the from side.
    source_ref: str
    # Corresponding coordinate on the to side, or null for an omission.
    base_ref: str | None
    # Optional sub-verse part carried separately from refs.
    part: str | None
    # Atomic relation in the from-to direction.
    relation: str
    # Scheme name that supplied the divergence, used for categorization.
    scheme_name: str | None


def navigation_target(source_ref: str, part: str | None = None) -> tuple[str, NavRef]:
    """Derive a discrete single-verse navigation target from a (possibly range) ref."""
    plain, embedded = strip_part_suffix(source_ref)
    try:
        ref_range = parse_ref(plain)
    except ReferenceError:
        # Fall back to the leading ``BOOK C:V`` segment for inverted/exotic samples.
        logger.debug("Falling back navigation parse for %s", source_ref)
        match = re.match(r"^([A-Z1-6]{3}) ([0-9]+):([0-9]+)", plain)
        if match is None:
            raise
        ref_range = parse_ref(f"{match.group(1)} {match.group(2)}:{match.group(3)}")
    verse = VerseId(
        book=ref_range.book,
        chapter=ref_range.chapter,
        verse=ref_range.verse_start,
        part=part or embedded,
    )
    nav_ref = format_bcv(verse)
    return nav_ref, NavRef(
        book=verse.book,
        chapter=verse.chapter,
        verse=verse.verse,
        part=verse.part,
    )


def categorize_delta(
    source_ref: str,
    base_ref: str | None,
    relation: str,
    *,
    scheme_name: str | None = None,
) -> str:
    """Assign a misalignment category from heuristics and known-divergence cues."""
    try:
        source = parse_ref(strip_part_suffix(source_ref)[0])
    except ReferenceError:
        return "other"
    base = None
    if base_ref:
        try:
            base = parse_ref(strip_part_suffix(base_ref)[0])
        except ReferenceError:
            base = None

    name = (scheme_name or "").lower()
    if source.book == "PSA" and (
        source.verse_start == 0 or (base and base.verse_start != source.verse_start)
    ):
        if "lxx" in name:
            return "lxx_psalm"
        return "psalm_title"
    if relation == "exclude" and source.book in _NT_BOOKS:
        return "nt_omission"
    if "rso" in name or "rsc" in name or "synodal" in name:
        return "synodal"
    if base and source.chapter != base.chapter:
        return "chapter_boundary"
    if relation == "renumber":
        return "chapter_count"
    return "other"


def _mapping_entries(
    session: Session,
    scheme_id: UUID,
    book: str | None,
) -> list[MappingRecord]:
    """Load mapping rows for jump menus, optionally filtered by book prefix."""
    stmt = (
        select(MappingRecord)
        .where(MappingRecord.scheme_id == scheme_id)
        .order_by(MappingRecord.ordinal)
    )
    rows = list(session.scalars(stmt).all())
    if book is None:
        return rows
    prefix = f"{book} "
    return [row for row in rows if row.source_ref.startswith(prefix)]


def _mapping_signature(row: MappingRecord) -> tuple[str, str | None, str | None, str]:
    """Return the semantic fields used to compare mapping rows across schemes."""
    relation = (
        row.relation.value if hasattr(row.relation, "value") else str(row.relation)
    )
    return row.source_ref, row.base_ref, row.part, relation


def _scheme_differences(
    session: Session,
    from_scheme_id: UUID,
    to_scheme_id: UUID,
    book: str | None,
) -> list[JumpMapping]:
    """Return mapping rows present on only one selected scheme, in from-to direction."""
    if from_scheme_id == to_scheme_id:
        return []
    from_scheme = require_scheme(session, from_scheme_id)
    to_scheme = require_scheme(session, to_scheme_id)
    from_rows = [
        row
        for row in (
            _mapping_entries(session, from_scheme_id, None)
            if from_scheme.based_on_id is not None
            else []
        )
        if _mapping_signature(row)[3] != "one_to_one"
    ]
    to_rows = [
        row
        for row in (
            _mapping_entries(session, to_scheme_id, None)
            if to_scheme.based_on_id is not None
            else []
        )
        if _mapping_signature(row)[3] != "one_to_one"
    ]
    from_signatures = {_mapping_signature(row) for row in from_rows}
    to_signatures = {_mapping_signature(row) for row in to_rows}
    from_name = from_scheme.name
    to_name = to_scheme.name
    differences: list[JumpMapping] = []

    for row in from_rows:
        signature = _mapping_signature(row)
        if signature in to_signatures:
            continue
        source_ref, base_ref, part, relation = signature
        differences.append(JumpMapping(source_ref, base_ref, part, relation, from_name))
    for row in to_rows:
        signature = _mapping_signature(row)
        if signature in from_signatures:
            continue
        target_ref, ancestor_ref, part, relation = signature
        differences.append(
            JumpMapping(
                source_ref=ancestor_ref or target_ref,
                base_ref=target_ref if ancestor_ref is not None else None,
                part=part,
                relation=invert_relation(relation),
                scheme_name=to_name,
            )
        )
    if book is None:
        return differences
    prefix = f"{book} "
    return [row for row in differences if row.source_ref.startswith(prefix)]


@router.get(
    "/api/translations/{translation_id}/navigation",
    response_model=list[NavBook],
)
def translation_navigation(
    translation_id: UUID,
    versification: UUID | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[NavBook]:
    """Return books and chapter numbers for the translation's selected scheme."""
    logger.debug("Navigation for translation=%s", translation_id)
    require_translation(session, translation_id)
    scheme_ref = selected_scheme_ref(session, translation_id, versification)
    scheme = require_scheme(session, scheme_ref.scheme_id)
    ingredient = scheme.ingredient or {}
    max_verses = ingredient.get("maxVerses") or {}
    books: dict[str, set[int]] = {}
    if isinstance(max_verses, dict):
        for book, chapters in max_verses.items():
            if isinstance(chapters, list):
                books[str(book)] = set(range(1, len(chapters) + 1))
    # Merge chapters that actually have stored spans.
    span_rows = session.execute(
        select(VerseSpan.book, VerseSpan.chapter)
        .where(VerseSpan.translation_id == translation_id)
        .distinct()
    ).all()
    for book, chapter in span_rows:
        books.setdefault(book, set()).add(int(chapter))
    return [
        NavBook(book=book, chapters=sorted(chapters))
        for book, chapters in sorted(books.items())
    ]


@router.get("/api/resolve/deltas", response_model=Page[DeltaEntry])
def resolve_deltas(
    from_translation: UUID = Query(...),
    to_translation: UUID = Query(...),
    book: str | None = Query(default=None),
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
    from_versification: UUID | None = Query(default=None),
    to_versification: UUID | None = Query(default=None),
    session: Session = Depends(get_session),
) -> Page[DeltaEntry]:
    """List explicit mapping deltas for the from-side selected scheme."""
    logger.debug("Deltas from=%s to=%s book=%s", from_translation, to_translation, book)
    require_translation(session, from_translation)
    require_translation(session, to_translation)
    to_scheme = selected_scheme_ref(session, to_translation, to_versification)
    from_scheme = selected_scheme_ref(session, from_translation, from_versification)
    deltas = _scheme_differences(
        session, from_scheme.scheme_id, to_scheme.scheme_id, book
    )
    page_limit, page_offset = clamp_page(limit, offset)
    page = deltas[page_offset : page_offset + page_limit]
    items: list[DeltaEntry] = []
    for row in page:
        nav_ref, navigation = navigation_target(row.source_ref, row.part)
        items.append(
            DeltaEntry(
                source_ref=row.source_ref,
                base_ref=row.base_ref,
                relation=RelationType(row.relation),
                navigation_ref=nav_ref,
                navigation=navigation,
            )
        )
    return Page[DeltaEntry](items=items, total=len(deltas))


@router.get("/api/resolve/misalignments", response_model=Page[MisalignmentEntry])
def resolve_misalignments(
    from_translation: UUID = Query(...),
    to_translation: UUID = Query(...),
    category: str | None = Query(default=None),
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
    from_versification: UUID | None = Query(default=None),
    to_versification: UUID | None = Query(default=None),
    session: Session = Depends(get_session),
) -> Page[MisalignmentEntry]:
    """List categorized misalignments derived from from-scheme mapping rows."""
    logger.debug(
        "Misalignments from=%s to=%s category=%s",
        from_translation,
        to_translation,
        category,
    )
    require_translation(session, from_translation)
    require_translation(session, to_translation)
    to_scheme = selected_scheme_ref(session, to_translation, to_versification)
    from_scheme = selected_scheme_ref(session, from_translation, from_versification)
    rows = _scheme_differences(
        session, from_scheme.scheme_id, to_scheme.scheme_id, None
    )
    entries: list[MisalignmentEntry] = []
    for row in rows:
        cat = categorize_delta(
            row.source_ref,
            row.base_ref,
            row.relation,
            scheme_name=row.scheme_name,
        )
        if category is not None and cat != category:
            continue
        nav_ref, navigation = navigation_target(row.source_ref, row.part)
        entries.append(
            MisalignmentEntry(
                category=cat,
                source_ref=row.source_ref,
                relation=RelationType(row.relation),
                navigation_ref=nav_ref,
                navigation=navigation,
            )
        )
    page_limit, page_offset = clamp_page(limit, offset)
    page = entries[page_offset : page_offset + page_limit]
    return Page[MisalignmentEntry](items=page, total=len(entries))
