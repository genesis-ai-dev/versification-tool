"""SQLAlchemy ORM models for translations, schemes, spans, and mappings."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CHAR,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Declarative base shared by all FRVT ORM models."""


class RelationType(enum.StrEnum):
    """Atomic mapping relation values that may be stored on ``mapping_record``.

    ``complex`` is resolve-time only and is intentionally omitted from this enum
    so the database cannot persist it.
    """

    one_to_one = "one_to_one"
    shift = "shift"
    renumber = "renumber"
    # Name must stay ``split`` to match the relation vocabulary; ignore str.split clash.
    split = "split"  # type: ignore[assignment]
    merge = "merge"
    exclude = "exclude"
    partial = "partial"


class Translation(Base):
    """A Bible translation (or numbering-space anchor) loaded into the tool."""

    __tablename__ = "translation"
    __table_args__ = (
        Index("uq_translation_name_ci", text("lower(name)"), unique=True),
        CheckConstraint(
            "source_format IN ('usx', 'usfm')",
            name="ck_translation_source_format",
        ),
    )

    # Server-generated primary key for the translation row.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Display name; uniqueness is enforced case-insensitively via index.
    name: Mapped[str] = mapped_column(Text, nullable=False)
    # Free-text language label shown to operators and the UI.
    language: Mapped[str] = mapped_column(Text, nullable=False)
    # Original upload format (``usx`` or ``usfm``); content is always stored as spans.
    source_format: Mapped[str] = mapped_column(Text, nullable=False)
    # True for bootstrapped canonical numbering-space anchors excluded from listings.
    is_anchor: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Creation timestamp maintained by the database default.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Last-update timestamp refreshed on write.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Ordered verse spans belonging to this translation.
    spans: Mapped[list[VerseSpan]] = relationship(
        back_populates="translation", cascade="all, delete-orphan"
    )
    # Scheme associations for this translation (including the preferred one).
    versifications: Mapped[list[TranslationVersification]] = relationship(
        back_populates="translation", cascade="all, delete-orphan"
    )


class VerseSpan(Base):
    """One addressable scripture span (whole verse, title, or sub-verse part)."""

    __tablename__ = "verse_span"
    __table_args__ = (
        Index(
            "uq_verse_span_coords",
            "translation_id",
            "book",
            "chapter",
            "verse",
            "part",
            unique=True,
            postgresql_nulls_not_distinct=True,
        ),
        UniqueConstraint("translation_id", "seq", name="uq_verse_span_seq"),
        Index("ix_verse_span_book_chapter", "translation_id", "book", "chapter"),
        CheckConstraint("seq >= 0", name="ck_verse_span_seq_nonnegative"),
        CheckConstraint(
            "book ~ '^[A-Z1-6]{3}$'",
            name="ck_verse_span_book_format",
        ),
        CheckConstraint("chapter >= 1", name="ck_verse_span_chapter_positive"),
        CheckConstraint("verse >= 0", name="ck_verse_span_verse_nonnegative"),
    )

    # Server-generated primary key for the span row.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Owning translation; deleting the translation cascades to its spans.
    translation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("translation.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Document-order index assigned by the ingest parser for stable rendering.
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    # USFM three-character book id.
    book: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    # Chapter number within the book.
    chapter: Mapped[int] = mapped_column(Integer, nullable=False)
    # Verse number; ``0`` is reserved for Psalm-title spans.
    verse: Mapped[int] = mapped_column(Integer, nullable=False)
    # Sub-verse part id when the span is partial; null for whole verses.
    part: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Scripture text for this span (required for UI display).
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Parent translation that owns this span.
    translation: Mapped[Translation] = relationship(back_populates="spans")


class VersificationScheme(Base):
    """A versification stored as a Copenhagen/Burrito ingredient plus chain metadata."""

    __tablename__ = "versification_scheme"

    # Server-generated primary key for the scheme row.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Display name of the scheme (for example ``eng`` or a custom label).
    name: Mapped[str] = mapped_column(Text, nullable=False)
    # Ingredient ``basedOn`` display name; null for a root such as ``org``.
    based_on_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    # FK to the numbering-space translation named by ``based_on_name`` (RESTRICT).
    based_on_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("translation.id", ondelete="RESTRICT"),
        nullable=True,
    )
    # True for shipped canonical schemes; false for uploaded custom schemes.
    canonical: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Full Copenhagen/Burrito ingredient JSON (system of record for this scheme).
    ingredient: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    # Creation timestamp maintained by the database default.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Last-update timestamp refreshed on write.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Association rows that attach this scheme to translations.
    associations: Mapped[list[TranslationVersification]] = relationship(
        back_populates="scheme"
    )
    # Derived mapping rows flattened from ``ingredient`` for query-time resolve.
    mapping_records: Mapped[list[MappingRecord]] = relationship(
        back_populates="scheme", cascade="all, delete-orphan"
    )


class TranslationVersification(Base):
    """Association between a translation and a versification scheme."""

    __tablename__ = "translation_versification"
    __table_args__ = (
        UniqueConstraint(
            "translation_id", "scheme_id", name="uq_translation_versification_pair"
        ),
        Index(
            "uq_translation_versification_preferred",
            "translation_id",
            unique=True,
            postgresql_where=text("preferred"),
        ),
    )

    # Server-generated primary key for the association row.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Translation side of the association; cascades when the translation is deleted.
    translation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("translation.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Scheme side of the association; RESTRICT so in-use schemes cannot be deleted.
    scheme_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("versification_scheme.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # Marks the translation's default scheme; at most one preferred row per translation.
    preferred: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Parent translation for this association.
    translation: Mapped[Translation] = relationship(back_populates="versifications")
    # Associated versification scheme.
    scheme: Mapped[VersificationScheme] = relationship(back_populates="associations")


class MappingRecord(Base):
    """Flattened, queryable form of one ingredient relationship for a scheme."""

    __tablename__ = "mapping_record"
    __table_args__ = (
        Index("ix_mapping_record_scheme_source", "scheme_id", "source_ref"),
        Index("ix_mapping_record_scheme_relation", "scheme_id", "relation"),
    )

    # Server-generated primary key for the mapping row.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Scheme this derived row belongs to; cascades when the scheme is deleted.
    scheme_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("versification_scheme.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Reference or range in this scheme (BCV grammar; parts never embedded).
    source_ref: Mapped[str] = mapped_column(Text, nullable=False)
    # Corresponding base reference/range; null for an exclusion.
    base_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Sub-verse part for ``partial`` rows; null for every other relation.
    part: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Atomic relation type; ``complex`` is never stored.
    relation: Mapped[RelationType] = mapped_column(
        Enum(
            RelationType,
            name="relation_type",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    # Stable ordering for deterministic output and jump-menu listing.
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)

    # Parent scheme that owns this derived mapping row.
    scheme: Mapped[VersificationScheme] = relationship(back_populates="mapping_records")
