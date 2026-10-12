"""Load engine schemes from stored sources, with a legacy ingredient fallback."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from frvt.api.errors import AppError
from frvt.api.logging_config import get_logger
from frvt.api.models import VerseSpan, VersificationScheme
from frvt.api.models.divergence import VersificationSource
from frvt.divergence.report import load_scheme
from frvt.divergence.scheme import Scheme
from frvt.divergence.text_facts import TextSpan, apply_text_facts
from frvt.divergence.vrs_reader import (
    parse_vrs_pairs,
    read_vrs_document,
    supplement_if_consistent,
)
from frvt.resolver.chains import preferred_scheme_ref

logger = get_logger(__name__)


@dataclass(frozen=True)
class LoadedSide:
    """One side of a comparison after the source and the text overlay."""

    # Engine scheme, maxima already reduced when the text is partial.
    scheme: Scheme
    # ``source`` or ``legacy``.
    fidelity: str
    # True when a consistent multi-target supplement was attached.
    multi_target: bool
    # True when the translation has at least one span.
    text_facts: bool
    # True when that supplement contains at least one mapping line.
    supplement_lines: bool


def _root_scheme(session: Session, scheme: VersificationScheme) -> VersificationScheme:
    """Walk ``based_on_id`` to the scheme that has no base."""
    seen: set[UUID] = set()
    current = scheme
    while current.based_on_id is not None:
        if current.id in seen:
            raise AppError(
                422, "Versification chain contains a cycle.", code="validation_failed"
            )
        seen.add(current.id)
        # based_on_id is the base numbering translation, not a scheme id.
        parent_ref = preferred_scheme_ref(session, current.based_on_id)
        if parent_ref is None:
            break
        parent = session.get(VersificationScheme, parent_ref.scheme_id)
        if parent is None:
            break
        current = parent
    return current


def _document(
    source: VersificationSource | None, ingredient: dict[str, Any]
) -> tuple[dict[str, Any], list[tuple[str, str]] | None, str]:
    """Return the engine document, supplement pairs, and fidelity."""
    if source is None:
        return ingredient, None, "legacy"
    if source.format == "vrs":
        vrs_document, vrs_pairs = read_vrs_document(source.document_text)
        return vrs_document, vrs_pairs, "source"
    document = json.loads(source.document_text)
    supplement: list[tuple[str, str]] | None = None
    if source.companion_vrs_text:
        supplement = supplement_if_consistent(
            document, parse_vrs_pairs(source.companion_vrs_text)
        )
    return document, supplement, "source"


def load_side(
    session: Session,
    *,
    translation_id: UUID,
    scheme_id: UUID,
    root: VersificationScheme,
) -> LoadedSide:
    """Load one side and overlay its text when the translation has spans."""
    logger.debug(
        "Loading divergence side translation=%s scheme=%s", translation_id, scheme_id
    )
    scheme_row = session.get(VersificationScheme, scheme_id)
    if scheme_row is None:
        raise AppError(404, f"Versification {scheme_id} not found.", code="not_found")
    if _root_scheme(session, scheme_row).id != root.id:
        raise AppError(
            422,
            "The two versifications do not share a root.",
            code="validation_failed",
        )
    source = session.get(VersificationSource, scheme_row.id)
    document, pairs, fidelity = _document(source, scheme_row.ingredient)
    loaded = load_scheme(scheme_row.name, document, pairs)
    span_count = session.scalar(
        select(func.count())
        .select_from(VerseSpan)
        .where(VerseSpan.translation_id == translation_id)
    )
    text_facts = bool(span_count)
    if text_facts:
        rows = session.scalars(
            select(VerseSpan).where(VerseSpan.translation_id == translation_id)
        ).all()
        apply_text_facts(
            loaded,
            tuple(
                TextSpan(
                    book=row.book,
                    chapter=row.chapter,
                    verse=row.verse,
                    part=row.part,
                    verse_range=row.verse_range,
                )
                for row in rows
            ),
        )
    return LoadedSide(
        scheme=loaded,
        fidelity=fidelity,
        multi_target=pairs is not None,
        text_facts=text_facts,
        supplement_lines=bool(pairs),
    )


def load_org(session: Session, root: VersificationScheme) -> Scheme:
    """Load the root scheme without a text overlay or a supplement.

    The org argument is the numbering space the two sides are composed through.
    Overlaying one translation's spans on it would change that space.
    """
    logger.debug("Loading divergence root scheme=%s", root.id)
    source = session.get(VersificationSource, root.id)
    document, _pairs, _fidelity = _document(source, root.ingredient)
    return load_scheme(root.name, document, None)


def shared_root(session: Session, left_id: UUID, right_id: UUID) -> VersificationScheme:
    """Return the shared root scheme, or raise 422 when the roots differ."""
    logger.debug("Resolving shared root left=%s right=%s", left_id, right_id)
    left = session.get(VersificationScheme, left_id)
    right = session.get(VersificationScheme, right_id)
    if left is None or right is None:
        missing = left_id if left is None else right_id
        raise AppError(404, f"Versification {missing} not found.", code="not_found")
    root_left = _root_scheme(session, left)
    root_right = _root_scheme(session, right)
    if root_left.id != root_right.id:
        raise AppError(
            422,
            "The two versifications do not share a root.",
            code="validation_failed",
        )
    return root_left
