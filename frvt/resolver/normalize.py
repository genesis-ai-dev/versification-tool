"""Post-assembly normalization of resolve results."""

from __future__ import annotations

from dataclasses import replace

from frvt.api.logging_config import get_logger
from frvt.resolver.types import ResolutionDTO, ResolvedSpanDTO

logger = get_logger(__name__)

# Top-level relations that must not be rewritten by same-coordinate normalization.
_SAME_BCV_SKIP = frozenset(
    {"one_to_one", "merge", "split", "complex", "range", "exclude", "partial"}
)


def spans_share_bcv(source: ResolvedSpanDTO, target: ResolvedSpanDTO) -> bool:
    """Return whether two resolved spans share the same book/chapter/verse/part.

    ``ResolvedSpanDTO.ref`` is always a single-verse BCV string, so string
    equality is sufficient without re-parsing.
    """
    return source.ref == target.ref and source.part == target.part


def normalize_same_bcv(dto: ResolutionDTO) -> ResolutionDTO:
    """Collapse a 1↔1 result that lands on its own coordinate to ``one_to_one``."""
    logger.debug(
        "Same-BCV normalization for relation=%s source_spans=%s target_spans=%s",
        dto.relation,
        len(dto.source_spans),
        len(dto.target_spans),
    )
    if dto.relation in _SAME_BCV_SKIP:
        return dto
    if len(dto.source_spans) != 1 or len(dto.target_spans) != 1:
        return dto
    if not spans_share_bcv(dto.source_spans[0], dto.target_spans[0]):
        return dto
    logger.debug(
        "Normalizing relation %s to one_to_one for shared BCV %s",
        dto.relation,
        dto.source_spans[0].ref,
    )
    return replace(dto, relation="one_to_one")
