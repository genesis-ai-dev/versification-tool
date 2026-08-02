"""Pydantic request and response models for the HTTP API."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Any, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints, model_serializer
from pydantic_core.core_schema import SerializerFunctionWrapHandler

# Item type carried by the reusable paginated response envelope.
PageItem = TypeVar("PageItem")
# Trimmed, non-empty operator-provided metadata text.
NonBlankText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class RelationType(StrEnum):
    """Relation vocabulary shared by resolve results and jump-menu entries."""

    one_to_one = "one_to_one"
    shift = "shift"
    renumber = "renumber"
    # Name must stay ``split`` to match the relation vocabulary.
    split = "split"  # type: ignore[assignment]
    merge = "merge"
    exclude = "exclude"
    partial = "partial"
    complex = "complex"
    # Resolve-time only, like ``complex``; never stored on a mapping_record.
    range = "range"


class TranslationCreate(BaseModel):
    """Body for creating a metadata-only translation (content arrives via ingest)."""

    # Display name; must be unique case-insensitively.
    name: NonBlankText
    # Free-text language label.
    language: NonBlankText
    # Original upload format recorded for provenance.
    source_format: Literal["usx", "usfm"]


class TranslationUpdate(BaseModel):
    """Partial update body for translation name and/or language."""

    # Optional new display name.
    name: NonBlankText | None = None
    # Optional new language label.
    language: NonBlankText | None = None


class TranslationOut(BaseModel):
    """Public translation representation (anchors are excluded from listings)."""

    # Translation primary key.
    id: UUID
    # Display name.
    name: str
    # Language tag (BCP 47 / ISO 639-3).
    language: str
    # Scripture column text direction for the viewer.
    text_direction: Literal["ltr", "rtl"]
    # Provenance format (``usx`` or ``usfm``).
    source_format: str
    # Creation timestamp (UTC).
    created_at: datetime
    # Last-update timestamp (UTC).
    updated_at: datetime

    model_config = {"from_attributes": True}


class VerseSpanOut(BaseModel):
    """One scripture span returned for column rendering."""

    # Span primary key.
    id: UUID
    # Document-order index for stable reading order.
    seq: int
    # USFM book id.
    book: str
    # Chapter number.
    chapter: int
    # Verse number (``0`` = Psalm title).
    verse: int
    # Sub-verse part when present.
    part: str | None
    # USX display label for combined milestones.
    verse_label: str | None = None
    # Normalized ``parse_ref`` range for combined milestones.
    verse_range: str | None = None
    # Verse text for display.
    content: str

    model_config = {"from_attributes": True}


class VersificationOut(BaseModel):
    """Scheme summary without the full ingredient payload."""

    # Scheme primary key.
    id: UUID
    # Display name.
    name: str
    # Base translation display name from the ingredient.
    based_on_name: str | None
    # Base translation FK used for chain walking.
    based_on_id: UUID | None
    # True for shipped canonical schemes.
    canonical: bool
    # Creation timestamp (UTC).
    created_at: datetime
    # Last-update timestamp (UTC).
    updated_at: datetime
    # Non-anchor translation names linked via associations; populated on list.
    associated_translation_names: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class VersificationDetailOut(VersificationOut):
    """Scheme detail including the stored Copenhagen ingredient."""

    # Full ingredient document (system of record).
    ingredient: dict[str, object]


class VersificationUpdate(BaseModel):
    """Partial update body for renaming a scheme."""

    # Optional new display name.
    name: NonBlankText | None = None


class AssociationCreate(BaseModel):
    """Body for associating an existing scheme with a translation."""

    # Scheme to associate.
    scheme_id: UUID


class AssociationOut(BaseModel):
    """Association row including whether it is the preferred default."""

    # Association primary key.
    id: UUID
    # Translation side of the association.
    translation_id: UUID
    # Scheme side of the association.
    scheme_id: UUID
    # True when this is the translation's default scheme.
    preferred: bool

    model_config = {"from_attributes": True}


class ResolvedSpan(BaseModel):
    """Denormalized single-verse span with structured coordinates for the UI."""

    # Single-verse BCV string (never a range; never a part suffix).
    ref: str
    # Book component of ``ref``.
    book: str
    # Chapter component of ``ref``.
    chapter: int
    # Verse component of ``ref``.
    verse: int
    # Stored ``verse_span.seq`` when a matching span exists.
    seq: int | None = None
    # Sub-verse part when present.
    part: str | None = None
    # USX display label when this span represents a combined milestone.
    verse_label: str | None = None
    # Normalized ``parse_ref`` range for combined milestones.
    verse_range: str | None = None


class ResolveEdge(BaseModel):
    """One connector for a ``complex`` or ``range`` resolve result."""

    # Index into ``source_spans``.
    source_index: int
    # Index into ``target_spans``.
    target_index: int
    # Per-connector relation for UI coloring/labels.
    relation: RelationType


class ResolveResult(BaseModel):
    """HTTP resolve response with denormalized spans and optional complex edges."""

    # Source-side spans (query verse plus merge/hull siblings).
    source_spans: list[ResolvedSpan]
    # Target-side spans (empty for exclude).
    target_spans: list[ResolvedSpan]
    # Top-level relation classification.
    relation: RelationType
    # Populated when ``relation`` is ``complex`` or ``range``.
    edges: list[ResolveEdge] = Field(default_factory=list)
    # Dominant non-identity source-axis relation; key omitted when absent.
    source_rel: RelationType | None = None
    # Dominant non-identity target-axis relation; key omitted when absent.
    target_rel: RelationType | None = None

    @model_serializer(mode="wrap")
    def _omit_absent_axes(
        self, handler: SerializerFunctionWrapHandler
    ) -> dict[str, Any]:
        """Drop axis keys entirely when unset so clients can test for presence."""
        data: dict[str, Any] = handler(self)
        for key in ("source_rel", "target_rel"):
            if data.get(key) is None:
                data.pop(key, None)
        return data


class ChapterResolveOut(BaseModel):
    """Unique alignments for one drive chapter after emit-once dedupe."""

    # Distinct resolve results for stored whole verses in the chapter.
    items: list[ResolveResult]
    # ``len(items)`` after dedupe (not raw verse count).
    total: int


class NavBook(BaseModel):
    """Book with available chapter numbers for navigation selectors."""

    # USFM book id.
    book: str
    # Chapter numbers present from stored verse spans for this book.
    chapters: list[int]


class NavRef(BaseModel):
    """Structured single-verse navigation target (UI never parses ranges)."""

    # USFM book id.
    book: str
    # Chapter number.
    chapter: int
    # Verse number.
    verse: int
    # Optional part for partial jump targets.
    part: str | None = None


class DeltaEntry(BaseModel):
    """One explicit mapping delta between two selected schemes."""

    # Display-only source label (may be a range string).
    source_ref: str
    # Display-only base label (may be a range string).
    base_ref: str | None
    # Atomic relation for this delta.
    relation: RelationType
    # Discrete single-verse BCV jump target (range lower bound).
    navigation_ref: str
    # Structured form of ``navigation_ref``.
    navigation: NavRef


class MisalignmentEntry(BaseModel):
    """Categorized misalignment entry for the jump menu."""

    # Category from the fixed vocabulary (for example ``psalm_title``).
    category: str
    # Display-only source label (may be a range string).
    source_ref: str
    # Atomic relation for this entry.
    relation: RelationType
    # Discrete single-verse BCV jump target.
    navigation_ref: str
    # Structured form of ``navigation_ref``.
    navigation: NavRef


class JumpMenuEntries(BaseModel):
    """Deltas and misalignments for the jump menu in one response."""

    # Explicit mapping deltas between the selected schemes.
    deltas: Page[DeltaEntry]
    # Categorized misalignments derived from the same filtered rows.
    misalignments: Page[MisalignmentEntry]


class JumpBooksOut(BaseModel):
    """Distinct from-side books with jump-relevant mapping differences."""

    # USFM book codes in USX order after cancel filtering.
    books: list[str]


class Page(BaseModel, Generic[PageItem]):
    """Paginated collection envelope ``{items, total}``."""

    # Page of result items.
    items: list[PageItem]
    # Total matching rows before pagination.
    total: int


class ProjectIngestOut(BaseModel):
    """Success body for project ingest (translation plus preferred scheme)."""

    # Created translation summary.
    translation: TranslationOut
    # Created/preferred versification summary.
    versification: VersificationOut
