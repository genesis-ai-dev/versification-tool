"""Navigation, deltas, and misalignment jump-menu endpoints."""

from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from frvt.api.db import get_session
from frvt.api.jump_books import jump_difference_books
from frvt.api.jump_cancel import (
    JumpCancelContext,
    filter_canceling_jump_rows,
    is_canceling_jump_entry,
    resolve_navigation_dto,
    resolved_target_ref_for_jump,
    resolved_target_ref_from_dto,
)
from frvt.api.jump_target_content import (
    filter_unreachable_jump_rows,
    is_unreachable_jump_entry,
    target_content_books_or_unfiltered,
)
from frvt.api.logging_config import get_logger
from frvt.api.models import MappingRecord, VerseSpan
from frvt.api.schemas import (
    DeltaEntry,
    JumpBooksOut,
    JumpMenuEntries,
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
from frvt.api.usx_book_order import USX_BOOK_ORDER, usx_book_sort_key
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


def jump_navigation_ref(row: JumpMapping) -> tuple[str, str | None]:
    """Return the discrete resolve ref and part for a jump row."""
    nav_ref, _navigation = navigation_target(row.source_ref, row.part)
    return nav_ref, row.part


def jump_source_bcv_sort_key(
    row: JumpMapping,
) -> tuple[int, str, int, int, str, str, str]:
    """Sort jump rows by the from-side starting BCV (range lower bound).

    Uses the same coordinate as ``navigation`` / ``navigation_ref`` so range
    entries such as ``PSA 62:1-12`` order by ``PSA 62:1``. Unknown or
    unparseable refs sort after known USX books, with ``source_ref`` /
    ``relation`` as stable tiebreakers.
    """
    try:
        _nav_ref, navigation = navigation_target(row.source_ref, row.part)
    except (ReferenceError, ValueError, TypeError):
        logger.debug(
            "Jump BCV sort falling back for unparseable source_ref=%s",
            row.source_ref,
        )
        return (
            len(USX_BOOK_ORDER),
            row.source_ref,
            0,
            0,
            row.part or "",
            row.source_ref,
            row.relation,
        )
    book_index, book_code = usx_book_sort_key(navigation.book)
    return (
        book_index,
        book_code,
        navigation.chapter,
        navigation.verse,
        navigation.part or "",
        row.source_ref,
        row.relation,
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
    if relation in {"renumber", "range"}:
        return "chapter_count"
    return "other"


def pair_misalignment_category(
    context: JumpCancelContext,
    navigation_ref: str,
    part: str | None,
    *,
    scheme_name: str | None = None,
) -> str:
    """Assign a misalignment category from composed pair resolve for jump menus.

    Uses the same resolve path as cancel filtering and delta labels so category
    labels match what the overlay shows after navigation.
    """
    dto = resolve_navigation_dto(context, navigation_ref, part)
    if dto is None:
        return "other"
    if not dto.target_spans:
        return categorize_delta(
            navigation_ref,
            None,
            dto.relation,
            scheme_name=scheme_name,
        )
    resolved_target = resolved_target_ref_from_dto(dto)
    if resolved_target is None:
        return "other"
    return categorize_delta(
        navigation_ref,
        resolved_target,
        dto.relation,
        scheme_name=scheme_name,
    )


def _mapping_entries(
    session: Session,
    scheme_id: UUID,
    book: str | None,
) -> list[MappingRecord]:
    """Load mapping rows for jump menus, optionally filtered by book prefix."""
    stmt = select(MappingRecord).where(MappingRecord.scheme_id == scheme_id)
    if book is not None:
        stmt = stmt.where(MappingRecord.source_ref.like(f"{book} %"))
    stmt = stmt.order_by(MappingRecord.ordinal)
    return list(session.scalars(stmt).all())


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
            _mapping_entries(session, from_scheme_id, book)
            if from_scheme.based_on_id is not None
            else []
        )
        if _mapping_signature(row)[3] != "one_to_one"
    ]
    to_rows = [
        row
        for row in (
            _mapping_entries(session, to_scheme_id, book)
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
    return differences


def _scheme_diff_filtered_jump_mappings(
    session: Session,
    from_translation: UUID,
    to_translation: UUID,
    book: str | None,
    from_versification: UUID | None,
    to_versification: UUID | None,
) -> tuple[list[JumpMapping], JumpCancelContext]:
    """Return cancel-filtered scheme-difference rows for one translation direction."""
    to_scheme = selected_scheme_ref(session, to_translation, to_versification)
    from_scheme = selected_scheme_ref(session, from_translation, from_versification)
    rows = _scheme_differences(
        session, from_scheme.scheme_id, to_scheme.scheme_id, book
    )
    cancel_context = JumpCancelContext(
        session=session,
        from_translation=from_translation,
        to_translation=to_translation,
        source_scheme=from_scheme,
        target_scheme=to_scheme,
    )
    kept = filter_canceling_jump_rows(
        rows,
        cancel_context,
        jump_navigation_ref,
    )
    target_books = target_content_books_or_unfiltered(session, to_translation)
    kept = filter_unreachable_jump_rows(
        kept,
        cancel_context,
        target_books,
        jump_navigation_ref,
    )
    return kept, cancel_context


def _reciprocal_jump_mappings(
    session: Session,
    from_translation: UUID,
    to_translation: UUID,
    book: str | None,
    from_versification: UUID | None,
    to_versification: UUID | None,
    context: JumpCancelContext,
    existing_nav: set[tuple[str, str | None]],
) -> list[JumpMapping]:
    """Discover from-side jumps from the counterpart direction's pair-visible targets.

    When a scheme-diff row survives cancel filtering in the ``to → from`` direction
    but its composed target on the from side is not already listed, expose a
    reciprocal row so both columns can navigate to the same pair-visible delta.
    """
    counterpart_rows, counterpart_context = _scheme_diff_filtered_jump_mappings(
        session,
        to_translation,
        from_translation,
        book,
        to_versification,
        from_versification,
    )
    target_books = target_content_books_or_unfiltered(session, to_translation)
    reciprocals: list[JumpMapping] = []
    for row in counterpart_rows:
        nav_ref, part = jump_navigation_ref(row)
        composed_target = resolved_target_ref_for_jump(
            counterpart_context,
            nav_ref,
            part,
        )
        if composed_target is None or ", " in composed_target:
            continue
        reciprocal_nav = composed_target.strip()
        reciprocal_key = (reciprocal_nav, part)
        if reciprocal_key in existing_nav:
            continue
        if is_canceling_jump_entry(context, reciprocal_nav, part):
            continue
        if is_unreachable_jump_entry(context, reciprocal_nav, part, target_books):
            continue
        dto = resolve_navigation_dto(context, reciprocal_nav, part)
        if dto is None:
            continue
        reciprocals.append(
            JumpMapping(
                source_ref=reciprocal_nav,
                base_ref=resolved_target_ref_for_jump(context, reciprocal_nav, part),
                part=part,
                relation=dto.relation,
                scheme_name=row.scheme_name,
            )
        )
        existing_nav.add(reciprocal_key)
    return reciprocals


def _cancel_filtered_jump_mappings(
    session: Session,
    from_translation: UUID,
    to_translation: UUID,
    book: str | None,
    from_versification: UUID | None,
    to_versification: UUID | None,
) -> tuple[list[JumpMapping], JumpCancelContext]:
    """Return jump rows after scheme-diff, cancel, unreachable, and reciprocal."""
    kept, cancel_context = _scheme_diff_filtered_jump_mappings(
        session,
        from_translation,
        to_translation,
        book,
        from_versification,
        to_versification,
    )
    existing_nav = {jump_navigation_ref(row) for row in kept}
    reciprocals = _reciprocal_jump_mappings(
        session,
        from_translation,
        to_translation,
        book,
        from_versification,
        to_versification,
        cancel_context,
        existing_nav,
    )
    if reciprocals:
        kept = kept + reciprocals
    return sorted(kept, key=jump_source_bcv_sort_key), cancel_context


def _delta_entry(
    row: JumpMapping,
    *,
    cancel_context: JumpCancelContext | None = None,
) -> DeltaEntry:
    """Build one delta entry from a filtered jump mapping row."""
    nav_ref, navigation = navigation_target(row.source_ref, row.part)
    display_base = row.base_ref
    if cancel_context is not None:
        resolved = resolved_target_ref_for_jump(cancel_context, nav_ref, row.part)
        if resolved is not None:
            display_base = resolved
    return DeltaEntry(
        source_ref=row.source_ref,
        base_ref=display_base,
        relation=RelationType(row.relation),
        navigation_ref=nav_ref,
        navigation=navigation,
    )


def _misalignment_entry(
    row: JumpMapping,
    *,
    cancel_context: JumpCancelContext,
) -> MisalignmentEntry:
    """Build one misalignment entry from a filtered jump mapping row."""
    nav_ref, navigation = navigation_target(row.source_ref, row.part)
    cat = pair_misalignment_category(
        cancel_context,
        nav_ref,
        row.part,
        scheme_name=row.scheme_name,
    )
    return MisalignmentEntry(
        category=cat,
        source_ref=row.source_ref,
        relation=RelationType(row.relation),
        navigation_ref=nav_ref,
        navigation=navigation,
    )


@router.get(
    "/api/translations/{translation_id}/navigation",
    response_model=list[NavBook],
)
def translation_navigation(
    translation_id: UUID,
    versification: UUID | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[NavBook]:
    """Return books and chapters that have stored verse spans for the translation.

    Validates the selected scheme (override, else preferred) for the same
    ``404``/``409`` rules as other coordinate endpoints, but builds the tree
    from ``verse_span`` only — never from scheme ``maxVerses`` — so partial
    translations (e.g. NT-only) do not list empty scheme books.
    """
    logger.debug("Navigation for translation=%s", translation_id)
    require_translation(session, translation_id)
    selected_scheme_ref(session, translation_id, versification)
    span_rows = session.execute(
        select(VerseSpan.book, VerseSpan.chapter)
        .where(VerseSpan.translation_id == translation_id)
        .distinct()
    ).all()
    books: dict[str, set[int]] = {}
    for book, chapter in span_rows:
        books.setdefault(book, set()).add(int(chapter))
    return [
        NavBook(book=book, chapters=sorted(chapters))
        for book, chapters in sorted(
            books.items(), key=lambda item: usx_book_sort_key(item[0])
        )
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
    deltas, cancel_context = _cancel_filtered_jump_mappings(
        session,
        from_translation,
        to_translation,
        book,
        from_versification,
        to_versification,
    )
    page_limit, page_offset = clamp_page(limit, offset)
    page = deltas[page_offset : page_offset + page_limit]
    items = [_delta_entry(row, cancel_context=cancel_context) for row in page]
    return Page[DeltaEntry](items=items, total=len(deltas))


@router.get("/api/resolve/misalignments", response_model=Page[MisalignmentEntry])
def resolve_misalignments(
    from_translation: UUID = Query(...),
    to_translation: UUID = Query(...),
    category: str | None = Query(default=None),
    book: str | None = Query(default=None),
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
    from_versification: UUID | None = Query(default=None),
    to_versification: UUID | None = Query(default=None),
    session: Session = Depends(get_session),
) -> Page[MisalignmentEntry]:
    """List categorized misalignments derived from from-scheme mapping rows."""
    logger.debug(
        "Misalignments from=%s to=%s category=%s book=%s",
        from_translation,
        to_translation,
        category,
        book,
    )
    require_translation(session, from_translation)
    require_translation(session, to_translation)
    rows, cancel_context = _cancel_filtered_jump_mappings(
        session,
        from_translation,
        to_translation,
        book,
        from_versification,
        to_versification,
    )
    entries: list[MisalignmentEntry] = []
    for row in rows:
        entry = _misalignment_entry(row, cancel_context=cancel_context)
        if category is not None and entry.category != category:
            continue
        entries.append(entry)
    page_limit, page_offset = clamp_page(limit, offset)
    page = entries[page_offset : page_offset + page_limit]
    return Page[MisalignmentEntry](items=page, total=len(entries))


@router.get("/api/resolve/jump-menu", response_model=JumpMenuEntries)
def resolve_jump_menu(
    from_translation: UUID = Query(...),
    to_translation: UUID = Query(...),
    book: str | None = Query(default=None),
    limit: int | None = Query(default=None),
    offset: int | None = Query(default=None),
    from_versification: UUID | None = Query(default=None),
    to_versification: UUID | None = Query(default=None),
    session: Session = Depends(get_session),
) -> JumpMenuEntries:
    """Return deltas and misalignments for the jump menu in one filtered pass."""
    logger.debug(
        "Jump menu from=%s to=%s book=%s",
        from_translation,
        to_translation,
        book,
    )
    require_translation(session, from_translation)
    require_translation(session, to_translation)
    rows, cancel_context = _cancel_filtered_jump_mappings(
        session,
        from_translation,
        to_translation,
        book,
        from_versification,
        to_versification,
    )
    page_limit, page_offset = clamp_page(limit, offset)
    page = rows[page_offset : page_offset + page_limit]
    delta_items = [_delta_entry(row, cancel_context=cancel_context) for row in page]
    mis_items = [
        _misalignment_entry(row, cancel_context=cancel_context) for row in page
    ]
    return JumpMenuEntries(
        deltas=Page[DeltaEntry](items=delta_items, total=len(rows)),
        misalignments=Page[MisalignmentEntry](items=mis_items, total=len(rows)),
    )


@router.get("/api/resolve/jump-books", response_model=JumpBooksOut)
def resolve_jump_books(
    from_translation: UUID = Query(...),
    to_translation: UUID = Query(...),
    from_versification: UUID | None = Query(default=None),
    to_versification: UUID | None = Query(default=None),
    session: Session = Depends(get_session),
) -> JumpBooksOut:
    """List distinct from-side books with cancel-filtered jump differences."""
    logger.debug(
        "Jump books from=%s to=%s from_vers=%s to_vers=%s",
        from_translation,
        to_translation,
        from_versification,
        to_versification,
    )
    require_translation(session, from_translation)
    require_translation(session, to_translation)
    rows, _cancel_context = _cancel_filtered_jump_mappings(
        session,
        from_translation,
        to_translation,
        book=None,
        from_versification=from_versification,
        to_versification=to_versification,
    )
    return JumpBooksOut(books=jump_difference_books(rows))
