"""Add translation_index, index_mapping, and index_reclaim for pre-created mappings."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the index registry, its mapping store, and the reclamation queue."""
    op.create_table(
        "translation_index",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "translation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("translation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "scheme_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("versification_scheme.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "scheme_explicit",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "status", sa.Text(), nullable=False, server_default=sa.text("'pending'")
        ),
        sa.Column(
            "cancel_requested",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("content_fingerprint", sa.Text(), nullable=True),
        sa.Column("pending_reason", sa.Text(), nullable=True),
        sa.Column("build_notes", sa.Text(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "pairs_total", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "pairs_completed", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "translation_id", "scheme_id", name="uq_translation_index_pair"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'building', 'ready', 'failed', 'cancelled')",
            name="ck_translation_index_status",
        ),
    )
    op.create_index(
        "ix_translation_index_status",
        "translation_index",
        ["status", "requested_at"],
    )

    # No foreign keys to translation_index on purpose: removing an index must not
    # cascade hundreds of thousands of rows inside an HTTP request. Orphans are
    # reclaimed by the background worker and are unreadable in the meantime.
    op.create_table(
        "index_mapping",
        sa.Column("source_index_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("target_index_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_ref", sa.Text(), primary_key=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
    )
    op.create_index("ix_index_mapping_target", "index_mapping", ["target_index_id"])

    op.create_table(
        "index_reclaim",
        sa.Column("index_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    """Drop the index tables in reverse dependency order."""
    op.drop_table("index_reclaim")
    op.drop_index("ix_index_mapping_target", table_name="index_mapping")
    op.drop_table("index_mapping")
    op.drop_index("ix_translation_index_status", table_name="translation_index")
    op.drop_table("translation_index")
