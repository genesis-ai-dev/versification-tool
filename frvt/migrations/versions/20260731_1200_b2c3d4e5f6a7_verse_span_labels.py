"""Add verse_label and verse_range to verse_span for combined USX milestones."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add optional USX display label and normalized range columns."""
    op.add_column("verse_span", sa.Column("verse_label", sa.Text(), nullable=True))
    op.add_column("verse_span", sa.Column("verse_range", sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove combined-milestone label columns."""
    op.drop_column("verse_span", "verse_range")
    op.drop_column("verse_span", "verse_label")
