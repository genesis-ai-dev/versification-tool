/** Explanations from the comparison catalog. Layer keys match the payload. */

export const LAYER_HELP: Record<string, string> = {
  scheme:
    "Verse and chapter numbering differences from the versification schemes: renumbered runs, Psalm-title numbering, merges, splits, chapter and book moves, order inversions, and verses with no counterpart.",
  segment:
    "Verses divided into lettered parts (a, b, c) differently on the two sides, for example Greek Esther additions.",
  text: "Text-level differences: verse bridges (for example 1-2 printed as one verse) and verses a text leaves out. Standard schemes carry none, so this layer appears for text comparisons.",
  canon:
    "Books whose content exists on only one side, for example the Letter to the Laodiceans in eng but not lxx. Unchecked hides their rows.",
};

/**
 * Explanations for the twelve divergence types, in no particular order.
 * The donut key opens one from the info control beside a type. Each one says
 * what the type is and names a passage where it commonly shows up.
 */
export const TYPE_HELP: Record<string, string> = {
  VERSE0_TITLE:
    "A psalm superscription is verse 0 on one side and verse 1 on the other, so the rest of that psalm shifts by one. Psalm 3 is a common case: Psalm 3:0 in one numbering is Psalm 3:1 in the other.",
  BRIDGE:
    "One side prints two or more verses as a single verse. Acts 19:40–41 is often printed that way.",
  RENUMBER:
    "The verses stay in the same chapter and order, but their numbers differ by a constant offset. Genesis 32:1–32 on one side is Genesis 32:2–33 on the other.",
  MERGE:
    "Two or more verses on one side correspond to a single verse on the other. Isaiah 64:1–2 in one numbering is Isaiah 64:1 in the other.",
  SPLIT:
    "One verse on one side corresponds to two or more verses on the other. Psalm 147:12 on one side is Psalm 147:0–1 on the other.",
  SEGMENT:
    "The same verse is split into lettered parts (a, b, c) differently on the two sides. Exodus 28:29 is one verse on one side and a lettered part on the other.",
  CHAPTER_MOVE:
    "A block of verses sits in a different chapter of the same book. English Genesis 31:55 is Hebrew Genesis 32:1, and English Malachi 4:1–6 is Hebrew Malachi 3:19–24.",
  ORDER_INVERSION:
    "Verses that stay in the same book appear in a different order. Exodus 20:13 on one side is Exodus 20:15 on the other, where the commandments are ordered differently.",
  CROSS_BOOK:
    "Verses on one side belong to a different book on the other. In the Septuagint, Nehemiah 1–3 is Ezra 11–13.",
  EXCLUDED:
    "The versification lists the verse, and the text leaves it out. Matthew 17:21 and Acts 8:37 are common examples in editions that follow the critical text.",
  ONE_SIDED:
    "These verses exist in one versification and have no counterpart in the other, inside a book both sides include. Exodus 36:9–17 is present on one side only, because the Septuagint arranges the tabernacle account differently.",
  BOOK_ONE_SIDED:
    "A whole book is present on only one side. The Letter to the Laodiceans is in the English scheme and not in the Septuagint.",
};

export const FLAG_HELP: Record<string, string> = {
  approximate:
    "This pairing is approximate. Check the data warning, if there is one, for the cause.",
  dataWarning:
    "The source data disagrees with itself. The lines under this chip say how.",
  vrsSupplement: "This pairing comes from a multi-target line in the source file.",
  missingInA: "These verses have no counterpart in {a}.",
  missingInB: "These verses have no counterpart in {b}.",
  bridgeInA: "{a} prints this range as one verse.",
  bridgeInB: "{b} prints this range as one verse.",
  textOmission: "The versification lists this verse, and the text does not contain it.",
};

export const DATA_WARNING_INTRO =
  "The source data disagrees with itself for this item: unequal ranges, an identity collision, or a mapping with no org anchor. The chip on the event names which.";

/**
 * Data-warning tip, including each note stored for the event.
 * ``details`` are the sentences from ``eventNotes``.
 */
export function dataWarningTip(details: readonly string[]): string {
  if (details.length === 0) {
    return DATA_WARNING_INTRO;
  }
  return `${DATA_WARNING_INTRO}\n${details.join("\n")}`;
}
