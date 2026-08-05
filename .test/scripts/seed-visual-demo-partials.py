#!/usr/bin/env python3
"""Insert SIR 36:13 part-a spans for visual-demo EN/ES translations (C-partial).

Uses the application DATABASE_URL (frvt DB, not frvt_test). Safe to re-run:
skips insert when a matching span already exists.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select

from frvt.api.db import get_session_factory
from frvt.api.logging_config import get_logger
from frvt.api.models import Translation, VerseSpan
from frvt.testops.fixtures.api_setup import insert_partial_verse_span

logger = get_logger(__name__)

TRANSLATION_NAMES = ("visual-demo-en", "visual-demo-es")


def _translation_id(session, name: str) -> UUID:
    """Return the id for ``name`` or raise when the translation is missing."""
    row = session.scalar(select(Translation).where(Translation.name == name))
    if row is None:
        raise SystemExit(
            f"Translation {name!r} not found. Run .test/scripts/seed-visual-demo.sh first."
        )
    return row.id


def _has_partial(session, translation_id: UUID) -> bool:
    """True when SIR 36:13 part ``a`` already exists for ``translation_id``."""
    existing = session.scalar(
        select(VerseSpan.id).where(
            VerseSpan.translation_id == translation_id,
            VerseSpan.book == "SIR",
            VerseSpan.chapter == 36,
            VerseSpan.verse == 13,
            VerseSpan.part == "a",
        )
    )
    return existing is not None


def main() -> None:
    """Insert partial spans on both visual-demo translations when absent."""
    logger.debug("Seeding visual-demo partial spans")
    with get_session_factory()() as session:
        for name in TRANSLATION_NAMES:
            translation_id = _translation_id(session, name)
            if _has_partial(session, translation_id):
                print(f"skip {name}: SIR 36:13a already present")
                continue
            insert_partial_verse_span(
                session,
                translation_id,
                book="SIR",
                chapter=36,
                verse=13,
                part="a",
                content="Sirach partial fixture",
            )
            print(f"inserted SIR 36:13a on {name} ({translation_id})")
        session.commit()
    print("Partial span seed complete.")


if __name__ == "__main__":
    main()
