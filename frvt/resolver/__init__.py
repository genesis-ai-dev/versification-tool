"""Resolver package: BCV helpers and coordinate-only ``resolve``."""

from frvt.resolver.parse_ref import (
    covers,
    expand,
    format_bcv,
    index_in_range,
    parse_ref,
)
from frvt.resolver.resolve import resolve
from frvt.resolver.types import (
    RefRange,
    ResolutionDTO,
    ResolutionEdgeDTO,
    ResolvedSpanDTO,
    SchemeRef,
    VerseId,
)

__all__ = [
    "RefRange",
    "ResolutionDTO",
    "ResolutionEdgeDTO",
    "ResolvedSpanDTO",
    "SchemeRef",
    "VerseId",
    "covers",
    "expand",
    "format_bcv",
    "index_in_range",
    "parse_ref",
    "resolve",
]
