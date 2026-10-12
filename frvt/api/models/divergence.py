"""ORM rows for versification sources and divergence reports.

These tables sit beside ``VersificationScheme``. The source row is the system of
record for what was uploaded; the scheme ingredient remains a derived view.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from frvt.api.models import Base


class VersificationSource(Base):
    """Verbatim versification upload, or the packaged canonical file plus its .vrs.

    One row per scheme. Deletes cascade with the scheme. Readers that need the
    original part letters or multi-target lines load this row; the resolver does
    not.
    """

    __tablename__ = "versification_source"
    __table_args__ = (
        CheckConstraint(
            "format IN ('copenhagen_json', 'vrs')",
            name="ck_versification_source_format",
        ),
    )

    # Scheme this document belongs to. Deleting the scheme removes the source.
    scheme_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("versification_scheme.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # ``copenhagen_json`` for a JSON upload or canonical, ``vrs`` for a .vrs upload.
    format: Mapped[str] = mapped_column(Text, nullable=False)
    # Original file text, including part letters and comment lines.
    document_text: Mapped[str] = mapped_column(Text, nullable=False)
    # Bundled or accompanying .vrs used only as a multi-target supplement.
    companion_vrs_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Filename the upload or the package used, for the detail response.
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    # Digest of the document and companion, so unchanged restarts skip the write.
    sha256: Mapped[str] = mapped_column(Text, nullable=False)
    # When this row was first written or last replaced.
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class DivergenceReport(Base):
    """Cached comparison of two translation-and-scheme sides.

    The payload is text rather than JSONB so a reader can return it without
    reordering keys. Rows cascade away when either translation or scheme goes.
    """

    __tablename__ = "divergence_report"
    __table_args__ = (
        UniqueConstraint(
            "from_translation_id",
            "from_scheme_id",
            "to_translation_id",
            "to_scheme_id",
            name="uq_divergence_report_key",
        ),
        CheckConstraint(
            "status IN ('pending', 'running', 'ready', 'failed')",
            name="ck_divergence_report_status",
        ),
    )

    # Server-generated id returned to the dialog.
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Translation whose numbering is side A.
    from_translation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("translation.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Versification selected for side A.
    from_scheme_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("versification_scheme.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Translation whose numbering is side B.
    to_translation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("translation.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Versification selected for side B.
    to_scheme_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("versification_scheme.id", ondelete="CASCADE"),
        nullable=False,
    )
    # ``pending``, ``running``, ``ready``, or ``failed``.
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    # Digest of both index fingerprints, source digests, and the engine version.
    fingerprint: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Current compute stage name, null before work starts.
    stage: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 1-based stage number inside the six-stage pipeline.
    stage_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Units finished inside the current stage.
    completed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Units expected inside the current stage; 0 when unknown.
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Last time the compute loop reported progress. Stale values are rescheduled.
    heartbeat_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Wire-format JSON document, stored as text and returned unchanged.
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Failure explanation when status is ``failed``.
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # When the row was first claimed.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # When status or progress last changed.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
