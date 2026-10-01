"""Store the versification source document beside each scheme."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the verbatim source table keyed by scheme id."""
    op.create_table(
        "versification_source",
        sa.Column("scheme_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("format", sa.Text(), nullable=False),
        sa.Column("document_text", sa.Text(), nullable=False),
        sa.Column("companion_vrs_text", sa.Text(), nullable=True),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("sha256", sa.Text(), nullable=False),
        sa.Column(
            "captured_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["scheme_id"],
            ["versification_scheme.id"],
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "format IN ('copenhagen_json', 'vrs')",
            name="ck_versification_source_format",
        ),
    )


def downgrade() -> None:
    """Drop the verbatim source table."""
    op.drop_table("versification_source")
