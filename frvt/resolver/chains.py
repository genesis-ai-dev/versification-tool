"""Scheme chain walking and shared-ancestor search for multi-hop resolve."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from frvt.api.logging_config import get_logger
from frvt.api.models import MappingRecord, TranslationVersification, VersificationScheme
from frvt.resolver.types import Hop, MappingView, SchemeRef

logger = get_logger(__name__)


def load_mapping_views(session: Session, scheme_id: UUID) -> tuple[MappingView, ...]:
    """Load all mapping rows for ``scheme_id`` into in-memory views."""
    logger.trace("Loading mapping records for scheme_id=%s", scheme_id)  # type: ignore[attr-defined]
    rows = session.scalars(
        select(MappingRecord)
        .where(MappingRecord.scheme_id == scheme_id)
        .order_by(MappingRecord.ordinal)
    ).all()
    return tuple(
        MappingView(
            source_ref=row.source_ref,
            base_ref=row.base_ref,
            part=row.part,
            relation=(
                row.relation.value
                if hasattr(row.relation, "value")
                else str(row.relation)
            ),
            ordinal=row.ordinal,
        )
        for row in rows
    )


def preferred_scheme_ref(session: Session, translation_id: UUID) -> SchemeRef | None:
    """Return the preferred scheme for ``translation_id``, or None if unset."""
    logger.trace(  # type: ignore[attr-defined]
        "Loading preferred scheme for translation_id=%s", translation_id
    )
    assoc = session.scalar(
        select(TranslationVersification).where(
            TranslationVersification.translation_id == translation_id,
            TranslationVersification.preferred.is_(True),
        )
    )
    if assoc is None:
        return None
    scheme = session.get(VersificationScheme, assoc.scheme_id)
    if scheme is None:
        return None
    return SchemeRef(
        scheme_id=scheme.id,
        based_on_id=scheme.based_on_id,
        based_on_name=scheme.based_on_name,
    )


def scheme_ref_from_id(session: Session, scheme_id: UUID) -> SchemeRef | None:
    """Load a ``SchemeRef`` by primary key, or None when missing."""
    scheme = session.get(VersificationScheme, scheme_id)
    if scheme is None:
        return None
    return SchemeRef(
        scheme_id=scheme.id,
        based_on_id=scheme.based_on_id,
        based_on_name=scheme.based_on_name,
    )


def preferred_owner_of_scheme(session: Session, scheme_id: UUID) -> UUID | None:
    """Return a translation that marks ``scheme_id`` as preferred (root ownership)."""
    assoc = session.scalar(
        select(TranslationVersification).where(
            TranslationVersification.scheme_id == scheme_id,
            TranslationVersification.preferred.is_(True),
        )
    )
    return assoc.translation_id if assoc is not None else None


def build_chain(session: Session, scheme: SchemeRef) -> list[Hop]:
    """Walk ``based_on_id`` preferred-scheme hops from ``scheme`` to a root.

    Raises ``LookupError`` when a cycle is detected in the scheme chain.
    """
    logger.debug("Building scheme chain from scheme_id=%s", scheme.scheme_id)
    hops: list[Hop] = []
    current = scheme
    seen: set[UUID] = set()
    while True:
        if current.scheme_id in seen:
            raise LookupError(f"Cycle in scheme chain at {current.scheme_id}")
        seen.add(current.scheme_id)
        mappings = load_mapping_views(session, current.scheme_id)
        hops.append(Hop(current.scheme_id, current.based_on_id, mappings))
        if current.based_on_id is None:
            break
        next_scheme = preferred_scheme_ref(session, current.based_on_id)
        if next_scheme is None:
            break
        current = next_scheme
    return hops


def numbering_nodes(session: Session, chain: list[Hop]) -> list[UUID]:
    """Ordered translation ids visited as numbering-space nodes along ``chain``."""
    nodes: list[UUID] = []
    for hop in chain:
        if hop.based_on_id is not None:
            if hop.based_on_id not in nodes:
                nodes.append(hop.based_on_id)
        else:
            owner = preferred_owner_of_scheme(session, hop.scheme_id)
            if owner is not None and owner not in nodes:
                nodes.append(owner)
    return nodes


def nearest_shared_translation(
    session: Session, source_chain: list[Hop], target_chain: list[Hop]
) -> UUID:
    """Return the nearest shared ancestor translation id, or raise ``LookupError``."""
    source_nodes = numbering_nodes(session, source_chain)
    target_nodes = set(numbering_nodes(session, target_chain))
    logger.trace(  # type: ignore[attr-defined]
        "Ancestor search source_nodes=%s target_nodes=%s",
        source_nodes,
        target_nodes,
    )
    for node in source_nodes:
        if node in target_nodes:
            return node
    raise LookupError("No shared ancestor between source and target schemes")


def hops_to_ancestor(chain: list[Hop], ancestor_id: UUID) -> list[Hop]:
    """Return hops that transform from the chain head toward ``ancestor_id``.

    A trailing root hop with ``based_on_id is None`` is omitted when the chain is
    already at the ancestor numbering (preferred owner == ancestor).
    """
    result: list[Hop] = []
    for hop in chain:
        if hop.based_on_id is None:
            break
        result.append(hop)
        if hop.based_on_id == ancestor_id:
            break
    return result


def hops_from_ancestor(chain: list[Hop], ancestor_id: UUID) -> list[Hop]:
    """Return hops to invert from ``ancestor_id`` down to the chain head."""
    return list(reversed(hops_to_ancestor(chain, ancestor_id)))
