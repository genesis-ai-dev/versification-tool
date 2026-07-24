"""Create core relational tables for translations, schemes, spans, and mappings."""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# Identifiers used by Alembic to order this revision in the migration graph.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Atomic relation values persisted on mapping_record (complex is resolve-time only).
_RELATION_VALUES = (
    "one_to_one",
    "shift",
    "renumber",
    "split",
    "merge",
    "exclude",
    "partial",
)


def upgrade() -> None:
    """Create the initial FRVT schema, including hand-written uniqueness rules."""
    relation_type = postgresql.ENUM(*_RELATION_VALUES, name="relation_type")
    relation_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "translation",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("language", sa.Text(), nullable=False),
        sa.Column("source_format", sa.Text(), nullable=False),
        sa.Column(
            "is_anchor",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
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
        sa.CheckConstraint(
            "source_format IN ('usx', 'usfm')",
            name="ck_translation_source_format",
        ),
    )
    op.create_index(
        "uq_translation_name_ci",
        "translation",
        [sa.text("lower(name)")],
        unique=True,
    )

    op.create_table(
        "versification_scheme",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("based_on_name", sa.Text(), nullable=True),
        sa.Column("based_on_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "canonical",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("ingredient", postgresql.JSONB(), nullable=False),
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
            ["based_on_id"],
            ["translation.id"],
            ondelete="RESTRICT",
        ),
    )

    op.create_table(
        "verse_span",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("translation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("book", sa.CHAR(length=3), nullable=False),
        sa.Column("chapter", sa.Integer(), nullable=False),
        sa.Column("verse", sa.Integer(), nullable=False),
        sa.Column("part", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["translation_id"],
            ["translation.id"],
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("seq >= 0", name="ck_verse_span_seq_nonnegative"),
        sa.CheckConstraint(
            "book ~ '^[A-Z1-6]{3}$'",
            name="ck_verse_span_book_format",
        ),
        sa.CheckConstraint(
            "chapter >= 1",
            name="ck_verse_span_chapter_positive",
        ),
        sa.CheckConstraint(
            "verse >= 0",
            name="ck_verse_span_verse_nonnegative",
        ),
        sa.UniqueConstraint("translation_id", "seq", name="uq_verse_span_seq"),
    )
    # NULLS NOT DISTINCT so two whole-verse rows (part IS NULL) cannot collide.
    op.execute(
        """
        CREATE UNIQUE INDEX uq_verse_span_coords
        ON verse_span (translation_id, book, chapter, verse, part)
        NULLS NOT DISTINCT
        """
    )
    op.create_index(
        "ix_verse_span_book_chapter",
        "verse_span",
        ["translation_id", "book", "chapter"],
    )

    op.create_table(
        "translation_versification",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("translation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scheme_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "preferred",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.ForeignKeyConstraint(
            ["translation_id"],
            ["translation.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["scheme_id"],
            ["versification_scheme.id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "translation_id",
            "scheme_id",
            name="uq_translation_versification_pair",
        ),
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_translation_versification_preferred
        ON translation_versification (translation_id)
        WHERE preferred
        """
    )

    op.create_table(
        "mapping_record",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("scheme_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_ref", sa.Text(), nullable=False),
        sa.Column("base_ref", sa.Text(), nullable=True),
        sa.Column("part", sa.Text(), nullable=True),
        sa.Column(
            "relation",
            postgresql.ENUM(*_RELATION_VALUES, name="relation_type", create_type=False),
            nullable=False,
        ),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["scheme_id"],
            ["versification_scheme.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_mapping_record_scheme_source",
        "mapping_record",
        ["scheme_id", "source_ref"],
    )
    op.create_index(
        "ix_mapping_record_scheme_relation",
        "mapping_record",
        ["scheme_id", "relation"],
    )


def downgrade() -> None:
    """Drop the initial FRVT schema in reverse dependency order."""
    op.drop_index("ix_mapping_record_scheme_relation", table_name="mapping_record")
    op.drop_index("ix_mapping_record_scheme_source", table_name="mapping_record")
    op.drop_table("mapping_record")
    op.execute("DROP INDEX IF EXISTS uq_translation_versification_preferred")
    op.drop_table("translation_versification")
    op.drop_index("ix_verse_span_book_chapter", table_name="verse_span")
    op.execute("DROP INDEX IF EXISTS uq_verse_span_coords")
    op.drop_table("verse_span")
    op.drop_table("versification_scheme")
    op.drop_index("uq_translation_name_ci", table_name="translation")
    op.drop_table("translation")
    op.execute("DROP TYPE IF EXISTS relation_type")
