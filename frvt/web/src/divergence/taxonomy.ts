/** Display order for the four layers the dialog toggles. */

export const LAYER_IDS = ["scheme", "segment", "text", "canon"] as const;

export type LayerId = (typeof LAYER_IDS)[number];

export const LAYER_LABELS: Record<LayerId, string> = {
  scheme: "Numbering",
  segment: "Verse segments",
  text: "Bridges and omissions",
  canon: "Books on one side only",
};

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
