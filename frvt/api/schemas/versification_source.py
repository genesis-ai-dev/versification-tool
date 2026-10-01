"""Response models for the verbatim versification source."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class VersificationSourceMetaOut(BaseModel):
    """Source metadata nested on a versification detail response.

    The document text itself is a separate route, so list and detail payloads
    stay small. Field names are snake_case, matching the rest of the API.
    """

    # ``copenhagen_json`` or ``vrs``.
    format: str
    # Original filename.
    filename: str
    # Digest of the document and any companion .vrs.
    sha256: str
    # UTF-8 length of the primary document.
    document_bytes: int
    # UTF-8 length of the companion .vrs, or null when there is none.
    companion_bytes: int | None
    # When the row was written.
    captured_at: datetime


class VersificationSourceOut(BaseModel):
    """Verbatim source texts for one scheme."""

    # ``copenhagen_json`` or ``vrs``.
    format: str
    # Original filename.
    filename: str
    # Digest of the document and any companion .vrs.
    sha256: str
    # Primary document, exactly as stored.
    document_text: str
    # Companion .vrs, or null.
    companion_vrs_text: str | None
    # When the row was written.
    captured_at: datetime
