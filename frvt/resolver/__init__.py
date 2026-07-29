"""Resolver package: BCV helpers and coordinate-only ``resolve``."""

from frvt.resolver.normalize import normalize_same_bcv, spans_share_bcv
from frvt.resolver.parse_ref import (
    covers,
    expand,
    format_bcv,
    index_in_range,
    parse_ref,
)
from frvt.resolver.resolve import assemble, resolve
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
    "assemble",
    "covers",
    "expand",
    "format_bcv",
    "index_in_range",
    "normalize_same_bcv",
    "parse_ref",
    "resolve",
    "spans_share_bcv",
]
