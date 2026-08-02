"""Parse USX 3.0 documents into ordered ``ParsedSpan`` rows."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from collections.abc import Iterable

from frvt.api.logging_config import get_logger
from frvt.ingest.types import ParsedSpan
from frvt.ingest.usx_verse_number import milestone_label_and_range, parse_usx_verse_number

logger = get_logger(__name__)


def _local(tag: str) -> str:
    """Strip an XML namespace URI so tag comparisons stay namespace-agnostic."""
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _text_chunks(node: ET.Element) -> Iterable[str]:
    """Yield visible text under ``node``, omitting nested ``note`` elements."""
    if node.text:
        yield node.text
    for child in list(node):
        if _local(child.tag) == "note":
            if child.tail:
                yield child.tail
            continue
        yield from _text_chunks(child)
        if child.tail:
            yield child.tail


def _normalize_whitespace(value: str) -> str:
    """Collapse internal whitespace while preserving a single readable line."""
    return re.sub(r"\s+", " ", value).strip()


def parse_usx(usx_text: str, *, start_seq: int = 0) -> list[ParsedSpan]:
    """Parse one USX document into spans starting at ``start_seq``."""
    logger.debug("Parsing USX document (start_seq=%s)", start_seq)
    # Tolerate a UTF-8 BOM that appears in some Paratext exports.
    cleaned = usx_text.lstrip("\ufeff")
    root = ET.fromstring(cleaned)
    book = ""
    chapter = 0
    seq = start_seq
    spans: list[ParsedSpan] = []

    # Track open verse milestones: number -> accumulated text fragments.
    open_verses: dict[str, list[str]] = {}
    # Preserve insertion order of open verse keys for stable closing.
    open_order: list[str] = []

    def close_verse(number: str) -> None:
        """Emit one span for a completed verse milestone and clear its buffer."""
        nonlocal seq
        chunks = open_verses.pop(number, None)
        if chunks is None:
            return
        if number in open_order:
            open_order.remove(number)
        verses = parse_usx_verse_number(number)
        if verses is None:
            logger.debug("Skipping close for unsupported verse number %s", number)
            return
        content = _normalize_whitespace("".join(chunks))
        verse_label, verse_range = milestone_label_and_range(
            number,
            verses,
            book=book,
            chapter=chapter,
        )
        spans.append(
            ParsedSpan(
                seq=seq,
                book=book,
                chapter=chapter,
                verse=min(verses),
                part=None,
                verse_label=verse_label,
                verse_range=verse_range,
                content=content,
            )
        )
        seq += 1

    def walk(node: ET.Element) -> None:
        """Depth-first walk that tracks book/chapter and verse milestones."""
        nonlocal book, chapter
        tag = _local(node.tag)

        if tag == "book":
            book = node.attrib.get("code", book)
        elif tag == "chapter":
            number = node.attrib.get("number")
            if number is not None:
                chapter = int(number)
        elif tag == "verse":
            sid = node.attrib.get("sid")
            eid = node.attrib.get("eid")
            number = node.attrib.get("number")
            if sid is not None and number is not None:
                if parse_usx_verse_number(number) is None:
                    logger.debug("Skipping unsupported verse number %s", number)
                else:
                    open_verses[number] = []
                    open_order.append(number)
            elif eid is not None:
                # Prefer matching by number attribute; else close the oldest open verse.
                close_key = (
                    number
                    if number in open_verses
                    else (open_order[0] if open_order else None)
                )
                if close_key is not None:
                    close_verse(close_key)
            return

        # Text belonging to the currently open verse(s) accumulates here.
        if open_order and node.text and tag not in {"note"}:
            open_verses[open_order[-1]].append(node.text)

        for child in list(node):
            if _local(child.tag) == "note":
                # Drop note bodies; keep trailing text that continues the open verse.
                if open_order and child.tail:
                    open_verses[open_order[-1]].append(child.tail)
                continue
            walk(child)
            # Verse content lives primarily in element tails after ``sid`` milestones.
            if open_order and child.tail:
                open_verses[open_order[-1]].append(child.tail)

    walk(root)
    # Close any verses left open by missing eid milestones.
    for key in list(open_order):
        close_verse(key)
    return spans


def collapse_duplicate_spans(spans: list[ParsedSpan]) -> list[ParsedSpan]:
    """Collapse repeated book/chapter/verse/part rows while preserving first-seen order.

    Some Paratext USX exports emit the same verse milestone more than once. The
    database requires unique coordinates, so later duplicates merge into the first
    row (preferring non-empty content) and sequences are reassigned densely.
    """
    logger.debug("Collapsing duplicate spans from %s rows", len(spans))
    merged: dict[tuple[str, int, int, str | None], ParsedSpan] = {}
    order: list[tuple[str, int, int, str | None]] = []
    for span in spans:
        key = (span.book, span.chapter, span.verse, span.part)
        existing = merged.get(key)
        if existing is None:
            merged[key] = span
            order.append(key)
            continue
        content = existing.content
        if not content and span.content:
            content = span.content
        elif content and span.content and span.content not in content:
            content = f"{content} {span.content}".strip()
        verse_label = existing.verse_label or span.verse_label
        verse_range = existing.verse_range or span.verse_range
        merged[key] = ParsedSpan(
            seq=existing.seq,
            book=existing.book,
            chapter=existing.chapter,
            verse=existing.verse,
            part=existing.part,
            verse_label=verse_label,
            verse_range=verse_range,
            content=content,
        )
    return [
        ParsedSpan(
            seq=index,
            book=merged[key].book,
            chapter=merged[key].chapter,
            verse=merged[key].verse,
            part=merged[key].part,
            verse_label=merged[key].verse_label,
            verse_range=merged[key].verse_range,
            content=merged[key].content,
        )
        for index, key in enumerate(order)
    ]


def parse_usx_files(files: list[tuple[str, str]]) -> list[ParsedSpan]:
    """Parse multiple ``(name, text)`` USX files in name order into one span list."""
    logger.debug("Parsing %s USX files", len(files))
    spans: list[ParsedSpan] = []
    seq = 0
    for _name, text in sorted(files, key=lambda item: item[0].lower()):
        batch = parse_usx(text, start_seq=seq)
        spans.extend(batch)
        seq = spans[-1].seq + 1 if spans else seq
    return collapse_duplicate_spans(spans)
