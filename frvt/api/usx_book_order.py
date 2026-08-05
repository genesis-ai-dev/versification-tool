"""USX / Paratext book-code order for navigation and similar Bible-ordered lists.

Order matches the standard USFM/USX book identifiers used by Paratext and the
Copenhagen ``org`` ingredient ``maxVerses`` key sequence: Protestant canon,
then deuterocanonical and related books. Unknown codes sort after known ones.
"""

from __future__ import annotations

# Canonical USX book-code sequence (Protestant OT/NT, then deuterocanonicals).
USX_BOOK_ORDER: tuple[str, ...] = (
    "GEN",
    "EXO",
    "LEV",
    "NUM",
    "DEU",
    "JOS",
    "JDG",
    "RUT",
    "1SA",
    "2SA",
    "1KI",
    "2KI",
    "1CH",
    "2CH",
    "EZR",
    "NEH",
    "EST",
    "JOB",
    "PSA",
    "PRO",
    "ECC",
    "SNG",
    "ISA",
    "JER",
    "LAM",
    "EZK",
    "DAN",
    "HOS",
    "JOL",
    "AMO",
    "OBA",
    "JON",
    "MIC",
    "NAM",
    "HAB",
    "ZEP",
    "HAG",
    "ZEC",
    "MAL",
    "MAT",
    "MRK",
    "LUK",
    "JHN",
    "ACT",
    "ROM",
    "1CO",
    "2CO",
    "GAL",
    "EPH",
    "PHP",
    "COL",
    "1TH",
    "2TH",
    "1TI",
    "2TI",
    "TIT",
    "PHM",
    "HEB",
    "JAS",
    "1PE",
    "2PE",
    "1JN",
    "2JN",
    "3JN",
    "JUD",
    "REV",
    "TOB",
    "JDT",
    "ESG",
    "WIS",
    "SIR",
    "BAR",
    "LJE",
    "S3Y",
    "SUS",
    "BEL",
    "1MA",
    "2MA",
    "3MA",
    "4MA",
    "1ES",
    "2ES",
    "MAN",
    "PS2",
    "ODA",
    "PSS",
    "JSA",
    "JDB",
    "TBS",
    "SST",
    "DNT",
    "BLT",
    "EZA",
    "JUB",
    "ENO",
    "DAG",
    "LAO",
)

# O(1) lookup of each known code's position in ``USX_BOOK_ORDER``.
_USX_INDEX: dict[str, int] = {code: index for index, code in enumerate(USX_BOOK_ORDER)}


def usx_book_sort_key(book: str) -> tuple[int, str]:
    """Return a sort key that places ``book`` in USX Bible order.

    Known codes use their canonical index; unknown codes follow all known ones
    and are ordered alphabetically among themselves.
    """
    index = _USX_INDEX.get(book)
    if index is None:
        return (len(USX_BOOK_ORDER), book)
    return (index, book)
