/** Display order for the four layers the dialog toggles. */

export const LAYER_IDS = ["scheme", "segment", "text", "canon"] as const;

export type LayerId = (typeof LAYER_IDS)[number];

export const LAYER_LABELS: Record<LayerId, string> = {
  scheme: "Numbering",
  segment: "Verse segments",
  text: "Bridges and omissions",
  canon: "Books on one side only",
};

/** Short names used in the comparison summary, in ``LAYER_IDS`` order. */
export const LAYER_SHORT: Record<LayerId, string> = {
  scheme: "numbering",
  segment: "segment",
  text: "bridge or omission",
  canon: "one-sided book",
};

/**
 * Type ids in the order stored on each event.
 * This must match ``TYPE_IDS`` in ``frvt/divergence/taxonomy.py``.
 */
export const TYPE_IDS = [
  "VERSE0_TITLE",
  "BRIDGE",
  "RENUMBER",
  "MERGE",
  "SPLIT",
  "SEGMENT",
  "CHAPTER_MOVE",
  "ORDER_INVERSION",
  "CROSS_BOOK",
  "EXCLUDED",
  "ONE_SIDED",
  "BOOK_ONE_SIDED",
] as const;

/** Labels in event type-index order. */
export const TYPE_LABELS = [
  "Psalm title numbering",
  "Verse bridge",
  "Renumbered run",
  "Merge",
  "Split",
  "Segment difference",
  "Chapter move",
  "Order inversion",
  "Cross-book move",
  "Omitted verse",
  "Present on one side only",
  "Book on one side only",
] as const;
