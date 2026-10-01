"""Digest of the inputs a divergence report depends on."""

from __future__ import annotations

import hashlib

from sqlalchemy.orm import Session

from frvt.api.divergence.keys import ReportKey
from frvt.api.indexing.fingerprint import index_fingerprint
from frvt.api.logging_config import get_logger
from frvt.api.models.divergence import VersificationSource
from frvt.divergence.taxonomy import ENGINE_VERSION
from frvt.resolver.chains import build_chain, scheme_ref_from_id

logger = get_logger(__name__)


def report_fingerprint(session: Session, key: ReportKey) -> str:
    """Hash both index fingerprints, each hop's source digest, and the engine version.

    A missing source contributes the literal ``legacy`` so attaching a file later
    changes the digest and the report is recomputed.
    """
    logger.debug("Fingerprinting divergence report %s", key)
    parts = [f"engine={ENGINE_VERSION}"]
    for translation_id, scheme_id in (
        (key.from_translation_id, key.from_scheme_id),
        (key.to_translation_id, key.to_scheme_id),
    ):
        scheme = scheme_ref_from_id(session, scheme_id)
        if scheme is None:
            parts.append(f"scheme-missing={scheme_id}")
            continue
        parts.append(
            index_fingerprint(session, translation_id=translation_id, scheme=scheme)
        )
        for hop in build_chain(session, scheme):
            source = session.get(VersificationSource, hop.scheme_id)
            parts.append(source.sha256 if source is not None else "legacy")
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()
