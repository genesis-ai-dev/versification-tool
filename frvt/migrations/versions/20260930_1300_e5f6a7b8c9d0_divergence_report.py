"""Cache divergence comparisons keyed by the two translation-and-scheme sides."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e5f6a7b8c9d0"
down_revision: str | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the report table with cascading foreign keys and a status check."""
    op.create_table(
        "divergence_report",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("from_translation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_scheme_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("to_translation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("to_scheme_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("fingerprint", sa.Text(), nullable=False, server_default=""),
        sa.Column("stage", sa.Text(), nullable=True),
        sa.Column("stage_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["from_translation_id"], ["translation.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["from_scheme_id"], ["versification_scheme.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["to_translation_id"], ["translation.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["to_scheme_id"], ["versification_scheme.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "from_translation_id",
            "from_scheme_id",
            "to_translation_id",
            "to_scheme_id",
            name="uq_divergence_report_key",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'ready', 'failed')",
            name="ck_divergence_report_status",
        ),
    )


def downgrade() -> None:
    """Drop the cached divergence report table."""
    op.drop_table("divergence_report")
