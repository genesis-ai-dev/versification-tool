"""Materialize cartesian mapping rows for one translation index."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from frvt.api.errors import AppError
from frvt.api.indexing.fingerprint import index_fingerprint
from frvt.api.indexing.keys import index_key
from frvt.api.indexing.registry import delete_mapping_chunk
from frvt.api.logging_config import get_logger
from frvt.api.models import (
    INDEX_STATUS_BUILDING,
    INDEX_STATUS_CANCELLED,
    INDEX_STATUS_FAILED,
    INDEX_STATUS_READY,
    IndexMapping,
    TranslationIndex,
)
from frvt.api.ports.resolver_port import build_resolve_path, resolve_single_with_path
from frvt.api.ports.span_lookup import preloaded_span_finder
from frvt.api.resolve_batch import stored_verse_refs
from frvt.resolver.chains import scheme_ref_from_id
from frvt.resolver.types import SchemeRef

logger = get_logger(__name__)


@dataclass(frozen=True)
class PairBuild:
    """One ordered index pair and the schemes used to resolve it."""

    source: TranslationIndex
    target: TranslationIndex
    source_scheme: SchemeRef
    target_scheme: SchemeRef


def build_index(session: Session, index_id: UUID, *, chunk_size: int) -> None:
    """Materialize mappings between ``index_id`` and every other ready index.

    Publishes ``ready`` only while the row is still ``building`` and not cancel
    requested, so a concurrent rebuild or cancel wins. Pair-level failures are
    recorded in ``build_notes``; the index still becomes ready because the read
    path falls back per ref.
    """
    logger.debug("Building index id=%s chunk_size=%s", index_id, chunk_size)
    row = session.get(TranslationIndex, index_id)
    if row is None:
        return
    others = list(
        session.scalars(
            select(TranslationIndex).where(
                TranslationIndex.status == INDEX_STATUS_READY,
                TranslationIndex.id != index_id,
            )
        ).all()
    )
    row.pairs_total = 2 * len(others)
    row.pairs_completed = 0
    row.build_notes = None
    session.commit()
    if _stop_if_not_current(session, index_id):
        return

    while delete_mapping_chunk(session, index_id, chunk_size=chunk_size):
        session.commit()
        if _stop_if_not_current(session, index_id):
            return

    source_scheme = scheme_ref_from_id(session, row.scheme_id)
    if source_scheme is None:
        logger.error("Index %s scheme %s is missing", index_id, row.scheme_id)
        failed = session.get(TranslationIndex, index_id)
        if failed is not None and failed.status == INDEX_STATUS_BUILDING:
            failed.status = INDEX_STATUS_FAILED
            failed.last_error = f"Versification {row.scheme_id} is missing."
            session.commit()
        return

    for other in others:
        if _stop_if_not_current(session, index_id):
            return
        current = session.get(TranslationIndex, index_id)
        other_row = session.get(TranslationIndex, other.id)
        if current is None or other_row is None:
            return
        target_scheme = scheme_ref_from_id(session, other_row.scheme_id)
        if target_scheme is None:
            _append_note(
                session,
                index_id,
                f"Skipped pair with {other.id}: versification is missing.",
            )
            _increment_pairs(session, index_id, 2)
            continue
        _build_pair(
            session,
            PairBuild(current, other_row, source_scheme, target_scheme),
            chunk_size=chunk_size,
            owner_id=index_id,
        )
        if _stop_if_not_current(session, index_id):
            return
        _build_pair(
            session,
            PairBuild(other_row, current, target_scheme, source_scheme),
            chunk_size=chunk_size,
            owner_id=index_id,
        )
        _increment_pairs(session, index_id, 2)

    _finish(session, index_id, source_scheme)


def _build_pair(
    session: Session,
    build: PairBuild,
    *,
    chunk_size: int,
    owner_id: UUID,
) -> None:
    """Write one ordered pair's mapping rows, skipping an unbuildable pair."""
    logger.debug(
        "Building pair source=%s target=%s",
        build.source.id,
        build.target.id,
    )
    try:
        path = build_resolve_path(
            session,
            source_scheme=build.source_scheme,
            target_scheme=build.target_scheme,
        )
    except AppError:
        logger.error(
            "Skipping unbuildable pair source=%s target=%s",
            build.source.id,
            build.target.id,
            exc_info=True,
        )
        _append_note(
            session,
            owner_id,
            f"Skipped pair {build.source.id} -> {build.target.id}: no shared ancestor.",
        )
        return

    finder = preloaded_span_finder(
        session, build.source.translation_id, build.target.translation_id
    )
    refs = stored_verse_refs(session, build.source.translation_id)
    chunk: list[tuple[str, dict[str, object]]] = []
    for ref in refs:
        key = index_key(ref)
        if key is None:
            continue
        try:
            result = resolve_single_with_path(
                session,
                from_translation=build.source.translation_id,
                to_translation=build.target.translation_id,
                ref=ref,
                part=None,
                path=path,
                span_finder=finder,
            )
        except AppError:
            logger.error("Skipping index member ref=%s", ref, exc_info=True)
            continue
        except Exception:
            logger.error("Unexpected index member failure ref=%s", ref, exc_info=True)
            continue
        chunk.append((key, result.model_dump(mode="json")))
        if len(chunk) >= chunk_size:
            _upsert_chunk(session, build.source.id, build.target.id, chunk)
            session.commit()
            chunk = []
            if _stop_if_not_current(session, owner_id):
                return
    if chunk:
        _upsert_chunk(session, build.source.id, build.target.id, chunk)
        session.commit()


def _upsert_chunk(
    session: Session,
    source_index_id: UUID,
    target_index_id: UUID,
    chunk: list[tuple[str, dict[str, object]]],
) -> None:
    """Insert or replace mapping rows for one page of source refs."""
    values = [
        {
            "source_index_id": source_index_id,
            "target_index_id": target_index_id,
            "source_ref": ref,
            "payload": payload,
        }
        for ref, payload in chunk
    ]
    stmt = pg_insert(IndexMapping).values(values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[
            IndexMapping.source_index_id,
            IndexMapping.target_index_id,
            IndexMapping.source_ref,
        ],
        set_={"payload": stmt.excluded.payload},
    )
    session.execute(stmt)


def _stop_if_not_current(session: Session, index_id: UUID) -> bool:
    """Return True when the build should abandon, applying cancel if needed."""
    row = session.get(TranslationIndex, index_id)
    if row is None:
        return True
    if row.status != INDEX_STATUS_BUILDING:
        return True
    if row.cancel_requested:
        row.status = INDEX_STATUS_CANCELLED
        row.cancel_requested = False
        session.commit()
        return True
    return False


def _finish(session: Session, index_id: UUID, scheme: SchemeRef) -> None:
    """Mark the index ready when this build is still the current request."""
    row = session.get(TranslationIndex, index_id)
    if row is None or row.status != INDEX_STATUS_BUILDING or row.cancel_requested:
        if (
            row is not None
            and row.status == INDEX_STATUS_BUILDING
            and row.cancel_requested
        ):
            row.status = INDEX_STATUS_CANCELLED
            row.cancel_requested = False
            session.commit()
        return
    row.content_fingerprint = index_fingerprint(
        session, translation_id=row.translation_id, scheme=scheme
    )
    row.status = INDEX_STATUS_READY
    row.pending_reason = None
    row.completed_at = datetime.now(UTC)
    row.last_error = None
    session.commit()


def _append_note(session: Session, index_id: UUID, note: str) -> None:
    """Append a non-fatal warning to the index's build notes."""
    row = session.get(TranslationIndex, index_id)
    if row is None:
        return
    row.build_notes = note if not row.build_notes else f"{row.build_notes}\n{note}"
    session.flush()


def _increment_pairs(session: Session, index_id: UUID, count: int) -> None:
    """Advance pair progress after both directions of one counterpart finish."""
    row = session.get(TranslationIndex, index_id)
    if row is None:
        return
    row.pairs_completed = row.pairs_completed + count
    session.commit()
