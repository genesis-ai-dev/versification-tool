"""Ingest DTOs exchanged with the API persistence layer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from frvt.ingest.metadata_parse import ProjectMetadata


@dataclass(frozen=True)
class ParsedSpan:
    """One scripture span produced by USX (or USFM→USX) parsing."""

    # Document-order index assigned during parse for stable column rendering.
    seq: int
    # USFM three-character book id.
    book: str
    # Chapter number within the book.
    chapter: int
    # Verse number; ``0`` denotes a Psalm-title span.
    verse: int
    # Sub-verse part id when present; null for whole verses.
    part: str | None
    # Verse text for this span (notes stripped).
    content: str
    # USX display label for combined milestones (``1,2`` / ``1-2``); null for simple verses.
    verse_label: str | None = None
    # Normalized ``parse_ref`` range for combined milestones; null for simple verses.
    verse_range: str | None = None


@dataclass(frozen=True)
class ParsedScheme:
    """A validated Copenhagen/Burrito ingredient ready for persistence."""

    # Display name for the scheme (filename stem, override, or basedOn).
    name: str
    # Ingredient ``basedOn`` name; defaults to ``org`` for uploads when absent.
    based_on: str | None
    # Always false from ingest; canonical roots come only from bootstrap.
    canonical: bool
    # Validated ingredient document (system of record).
    ingredient: dict[str, Any]


@dataclass(frozen=True)
class IngestIssue:
    """Blocking problem discovered while parsing or validating ingest input."""

    # ``missing`` maps to HTTP 400; ``invalid`` maps to HTTP 422.
    kind: Literal["missing", "invalid"]
    # Field or file name the issue refers to.
    field: str
    # Human-readable explanation suitable for the API ``errors`` array.
    message: str


@dataclass(frozen=True)
class ProjectIngestResult:
    """Pure result of unzipping and parsing a Paratext-style project archive."""

    # Spans parsed from the USX tree (empty when issues are non-empty).
    spans: tuple[ParsedSpan, ...]
    # Scheme parsed from the required ``.vrs`` (placeholder when issues block).
    scheme: ParsedScheme | None
    # Optional bundle metadata from ``metadata.xml`` when parseable.
    metadata: ProjectMetadata | None
    # Blocking issues; any non-empty tuple means reject and persist nothing.
    issues: tuple[IngestIssue, ...]


@dataclass(frozen=True)
class MappingRecordDTO:
    """One derived mapping row ready for insert (scheme id assigned by the API)."""

    # Reference or range in this scheme; parts are never embedded.
    source_ref: str
    # Counterpart in the base scheme; null for an exclusion.
    base_ref: str | None
    # Sub-verse part for ``partial`` rows; null otherwise.
    part: str | None
    # Atomic relation type string (never ``complex``).
    relation: str
    # Stable ordering for deterministic output.
    ordinal: int
