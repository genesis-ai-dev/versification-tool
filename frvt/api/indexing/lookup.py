"""Look up pre-created resolve results for a ready index pair."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from frvt.api.indexing.keys import index_key
from frvt.api.logging_config import get_logger
from frvt.api.models import INDEX_STATUS_READY, IndexMapping, TranslationIndex
from frvt.api.schemas import ResolveResult

logger = get_logger(__name__)


@dataclass(frozen=True)
class IndexedPair:
    """Ready index ids for one ordered translation/versification pair."""

    source_index_id: UUID
    target_index_id: UUID


def find_ready_pair(
    session: Session,
    *,
    from_translation: UUID,
    from_scheme_id: UUID,
    to_translation: UUID,
    to_scheme_id: UUID,
) -> IndexedPair | None:
    """Return the pair only when both indexes exist and are ``ready``.

    Any other combination falls back to live resolve, which is the safety
    invariant that makes partial and stale indexes slow rather than wrong.
    """
    logger.trace(  # type: ignore[attr-defined]
        "Looking up ready index pair from=%s/%s to=%s/%s",
        from_translation,
        from_scheme_id,
        to_translation,
        to_scheme_id,
    )
    source = session.scalar(
        select(TranslationIndex).where(
            TranslationIndex.translation_id == from_translation,
            TranslationIndex.scheme_id == from_scheme_id,
            TranslationIndex.status == INDEX_STATUS_READY,
        )
    )
    target = session.scalar(
        select(TranslationIndex).where(
            TranslationIndex.translation_id == to_translation,
            TranslationIndex.scheme_id == to_scheme_id,
            TranslationIndex.status == INDEX_STATUS_READY,
        )
    )
    if source is None or target is None:
        return None
    return IndexedPair(source.id, target.id)


def load_payloads(
    session: Session, pair: IndexedPair, refs: list[str]
) -> dict[str, ResolveResult]:
    """Bulk-load stored results keyed by normalized source ref.

    Malformed payloads are omitted (and logged) so that one bad row falls back
    to live resolve instead of failing the request.
    """
    keys = [key for ref in refs if (key := index_key(ref)) is not None]
    logger.trace(  # type: ignore[attr-defined]
        "Loading %s index payloads for pair %s -> %s",
        len(keys),
        pair.source_index_id,
        pair.target_index_id,
    )
    if not keys:
        return {}
    rows = session.execute(
        select(IndexMapping.source_ref, IndexMapping.payload).where(
            IndexMapping.source_index_id == pair.source_index_id,
            IndexMapping.target_index_id == pair.target_index_id,
            IndexMapping.source_ref.in_(keys),
        )
    ).all()
    loaded: dict[str, ResolveResult] = {}
    for source_ref, payload in rows:
        try:
            loaded[source_ref] = ResolveResult.model_validate(payload)
        except Exception:
            logger.error(
                "Malformed index payload pair=%s->%s ref=%s",
                pair.source_index_id,
                pair.target_index_id,
                source_ref,
                exc_info=True,
            )
    return loaded
