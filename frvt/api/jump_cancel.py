"""Filter jump-menu rows whose resolve target matches the source BCV."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import TypeVar
from uuid import UUID

from sqlalchemy.orm import Session

from frvt.api.logging_config import get_logger
from frvt.resolver.chains import (
    build_chain,
    hops_from_ancestor,
    hops_to_ancestor,
    nearest_shared_translation,
)
from frvt.resolver.normalize import spans_share_bcv
from frvt.resolver.parse_ref import expand, parse_ref
from frvt.resolver.resolve import _select_scheme, assemble
from frvt.resolver.types import Hop, ResolutionDTO, SchemeRef, VerseId

logger = get_logger(__name__)

_RowT = TypeVar("_RowT")

# Process-wide cancel results reused across jump-menu requests for the same schemes.
_PROCESS_CANCEL_CACHE: dict[tuple[UUID, UUID, str, str | None], bool] = {}
_PROCESS_CANCEL_CACHE_MAX = 8192


@dataclass
class JumpCancelContext:
    """Shared resolve inputs for cancel checks on one jump-menu request."""

    # Database session for coordinate-only resolve.
    session: Session
    # Source translation id for the from-to resolve direction.
    from_translation: UUID
    # Target translation id for the from-to resolve direction.
    to_translation: UUID
    # Selected scheme on the from side (override or preferred).
    source_scheme: SchemeRef
    # Selected scheme on the to side (override or preferred).
    target_scheme: SchemeRef
    # Memoized cancel results keyed by ``(navigation_ref, part)``.
    _cancel_cache: dict[tuple[str, str | None], bool] = field(
        default_factory=dict,
        repr=False,
        compare=False,
    )
    # Memoized pair-resolve results keyed by ``(navigation_ref, part)``.
    _resolution_cache: dict[tuple[str, str | None], ResolutionDTO | None] = field(
        default_factory=dict,
        repr=False,
        compare=False,
    )
    # Hop lists reused for every cancel check in this request.
    _src_hops: list[Hop] | None = field(default=None, repr=False, compare=False)
    _tgt_hops: list[Hop] | None = field(default=None, repr=False, compare=False)

    def _resolve_path(self) -> tuple[list[Hop], list[Hop]]:
        """Load and cache scheme hop lists for the selected translation pair."""
        if self._src_hops is None or self._tgt_hops is None:
            src = _select_scheme(
                self.session,
                self.source_scheme,
                self.from_translation,
            )
            tgt = _select_scheme(
                self.session,
                self.target_scheme,
                self.to_translation,
            )
            src_chain = build_chain(self.session, src)
            tgt_chain = build_chain(self.session, tgt)
            ancestor = nearest_shared_translation(self.session, src_chain, tgt_chain)
            self._src_hops = hops_to_ancestor(src_chain, ancestor)
            self._tgt_hops = hops_from_ancestor(tgt_chain, ancestor)
        return self._src_hops, self._tgt_hops

    def _resolve_navigation(
        self,
        navigation_ref: str,
        part: str | None = None,
    ) -> ResolutionDTO:
        """Resolve one jump ``navigation_ref`` using the cached hop path."""
        src_hops, tgt_hops = self._resolve_path()
        members = expand(parse_ref(navigation_ref))
        if part is not None:
            members = [
                VerseId(book=m.book, chapter=m.chapter, verse=m.verse, part=part)
                for m in members
            ]
        return assemble(members, src_hops, tgt_hops)


def resolve_navigation_dto(
    context: JumpCancelContext,
    navigation_ref: str,
    part: str | None = None,
) -> ResolutionDTO | None:
    """Return a memoized pair resolve for one jump navigation target.

    On resolve failure, caches and returns ``None`` so callers fail open.
    """
    cache_key = (navigation_ref, part)
    if cache_key in context._resolution_cache:
        return context._resolution_cache[cache_key]
    try:
        dto = context._resolve_navigation(navigation_ref, part)
    except (ReferenceError, LookupError, ValueError) as exc:
        logger.debug(
            "Pair resolve failed for navigation_ref=%s: %s",
            navigation_ref,
            exc,
        )
        context._resolution_cache[cache_key] = None
        return None
    context._resolution_cache[cache_key] = dto
    return dto


def resolved_target_ref_from_dto(dto: ResolutionDTO) -> str | None:
    """Format the to-translation BCV label(s) from a resolve result."""
    if not dto.target_spans:
        return None
    refs = [span.ref for span in dto.target_spans]
    return refs[0] if len(refs) == 1 else ", ".join(refs)


def resolved_target_ref_for_jump(
    context: JumpCancelContext,
    navigation_ref: str,
    part: str | None = None,
) -> str | None:
    """Return the to-translation BCV label for a jump row's navigation target.

    Uses the same coordinate resolve path as cancel filtering so jump-menu
    labels match overlay connectors for the selected translation pair.
    """
    dto = resolve_navigation_dto(context, navigation_ref, part)
    if dto is None:
        return None
    return resolved_target_ref_from_dto(dto)


def is_canceling_resolution(dto: ResolutionDTO) -> bool:
    """Return whether a coordinate resolve result cancels for jump-menu purposes.

    Identity-locus ``partial`` results share book/chapter/verse/part by design
    (the part annotation is the meaningful delta), so they stay visible.
    """
    if dto.relation == "partial":
        return False
    if len(dto.source_spans) != 1 or len(dto.target_spans) != 1:
        return False
    return spans_share_bcv(dto.source_spans[0], dto.target_spans[0])


def is_canceling_jump_entry(
    context: JumpCancelContext,
    navigation_ref: str,
    part: str | None = None,
) -> bool:
    """Return whether resolving ``navigation_ref`` cancels between the pair.

    On resolve failure, returns ``False`` so the jump entry stays visible.
    """
    cache_key = (navigation_ref, part)
    cached = context._cancel_cache.get(cache_key)
    if cached is not None:
        return cached
    process_key = (
        context.source_scheme.scheme_id,
        context.target_scheme.scheme_id,
        navigation_ref,
        part,
    )
    process_cached = _PROCESS_CANCEL_CACHE.get(process_key)
    if process_cached is not None:
        context._cancel_cache[cache_key] = process_cached
        return process_cached
    dto = resolve_navigation_dto(context, navigation_ref, part)
    if dto is None:
        result = False
    else:
        result = is_canceling_resolution(dto)
    context._cancel_cache[cache_key] = result
    if len(_PROCESS_CANCEL_CACHE) >= _PROCESS_CANCEL_CACHE_MAX:
        _PROCESS_CANCEL_CACHE.clear()
    _PROCESS_CANCEL_CACHE[process_key] = result
    return result


def filter_canceling_jump_rows(
    rows: Sequence[_RowT],
    context: JumpCancelContext,
    navigation_for_row: Callable[[_RowT], tuple[str, str | None]],
) -> list[_RowT]:
    """Drop rows whose navigation target cancels after coordinate resolve."""
    if not rows:
        return []
    logger.debug("Cancel filter evaluating %s jump rows", len(rows))
    kept: list[_RowT] = []
    for row in rows:
        nav_ref, part = navigation_for_row(row)
        if is_canceling_jump_entry(context, nav_ref, part):
            continue
        kept.append(row)
    logger.debug("Cancel filter kept %s of %s rows", len(kept), len(rows))
    return kept
