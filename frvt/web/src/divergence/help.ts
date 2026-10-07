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
