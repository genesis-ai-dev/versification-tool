"""Relation inverses and interim multi-hop composition for single 1↔1 paths."""

from __future__ import annotations

from frvt.api.logging_config import get_logger

logger = get_logger(__name__)

# Structural priority used when two non-cancelling relations must be combined.
_PRIORITY: tuple[str, ...] = (
    "exclude",
    "merge",
    "split",
    "renumber",
    "shift",
    "partial",
    "one_to_one",
)


def invert_relation(relation: str) -> str:
    """Return the descent inverse of an atomic relation (``split``↔``merge``)."""
    if relation == "split":
        return "merge"
    if relation == "merge":
        return "split"
    return relation


def compose(left: str, right: str) -> str:
    """Compose two atomic relations along a single 1↔1 path (*Interim* table)."""
    logger.trace("Composing relations %s then %s", left, right)  # type: ignore[attr-defined]
    if left == "one_to_one":
        return right
    if right == "one_to_one":
        return left
    if left == "exclude" or right == "exclude":
        return "exclude"
    if {left, right} == {"split", "merge"}:
        return "one_to_one"
    if left == right:
        return left
    left_rank = _PRIORITY.index(left) if left in _PRIORITY else len(_PRIORITY)
    right_rank = _PRIORITY.index(right) if right in _PRIORITY else len(_PRIORITY)
    return left if left_rank <= right_rank else right
