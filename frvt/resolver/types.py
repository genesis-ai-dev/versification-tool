"""Internal BCV coordinate types and resolver contract DTOs."""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID


@dataclass(frozen=True)
class VerseId:
    """A single addressable verse (or sub-verse) coordinate."""

    # USFM three-character book id (pattern ``^[A-Z1-6]{3}$``).
    book: str
    # Chapter number within the book.
    chapter: int
    # Verse number; ``0`` denotes a Psalm-title span.
    verse: int
    # Optional sub-verse part id; never embedded in BCV strings.
    part: str | None = None


@dataclass(frozen=True)
class RefRange:
    """A same-chapter inclusive verse range expressed in BCV grammar."""

    # USFM three-character book id.
    book: str
    # Chapter shared by every verse in the range.
    chapter: int
    # Inclusive lower verse bound.
    verse_start: int
    # Inclusive upper verse bound (equals ``verse_start`` for a single verse).
    verse_end: int


@dataclass(frozen=True)
class SchemeRef:
    """Identifies a scheme for resolution: its id and base-translation FK."""

    # Versification scheme primary key.
    scheme_id: UUID
    # Numbering-space translation this scheme is based on; null for a root.
    based_on_id: UUID | None
    # Display / provenance name of the base translation when known.
    based_on_name: str | None = None


@dataclass(frozen=True)
class ResolvedSpanDTO:
    """One denormalized single-verse span emitted by the resolver."""

    # Single-verse BCV string; never a range and never carries a part suffix.
    ref: str
    # Sub-verse part id when this span is partial; null for whole verses.
    part: str | None


@dataclass(frozen=True)
class ResolutionEdgeDTO:
    """One connector in a ``complex`` hull (indices into source/target span lists)."""

    # Index into ``ResolutionDTO.source_spans``.
    source_index: int
    # Index into ``ResolutionDTO.target_spans``.
    target_index: int
    # Per-connector atomic (or composed) relation for UI coloring/labels.
    relation: str


@dataclass(frozen=True)
class ResolutionDTO:
    """Coordinate-only resolve result; seq/content are attached by the API port."""

    # Queried verse(s) plus merge/hull siblings on the source side.
    source_spans: tuple[ResolvedSpanDTO, ...]
    # Counterpart spans; empty for ``exclude``.
    target_spans: tuple[ResolvedSpanDTO, ...]
    # Atomic relation or resolve-time-only ``complex``.
    relation: str
    # Populated only when ``relation == "complex"``.
    edges: tuple[ResolutionEdgeDTO, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class MappingView:
    """In-memory mapping row used for cover search (no ORM dependency)."""

    # Reference or range on the scheme side.
    source_ref: str
    # Counterpart on the base side; null for exclusions.
    base_ref: str | None
    # Part id for ``partial`` rows; null otherwise.
    part: str | None
    # Atomic relation type string.
    relation: str
    # Stable ordinal for tie-breaking during cover search.
    ordinal: int


@dataclass(frozen=True)
class Hop:
    """One scheme hop: mappings that transform toward ``based_on_id`` numbering."""

    # Scheme whose mappings are applied on this hop.
    scheme_id: UUID
    # Translation id reached after applying this hop; null at a root scheme.
    based_on_id: UUID | None
    # Mapping rows for this scheme, loaded once per resolve.
    mappings: tuple[MappingView, ...]
