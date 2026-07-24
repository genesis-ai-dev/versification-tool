import type { RelationType } from "../../api/types";

/** Connector topology used when building DrawPlan paths. */
export type Topology = "direct" | "branch" | "converge" | "to_void" | "graph";

/** Visual style for one relation value (or per-edge complex coloring). */
export interface RelationVisual {
  /** CSS color token / hex for outlines and strokes. */
  color: string;
  /** Stroke width in CSS pixels. */
  strokeWidth: number;
  /** Optional SVG dash array (dashed for partial/exclude). */
  dashArray?: string;
  /** Connector topology for this relation. */
  topology: Topology;
  /** Short badge near midpoint / hub; empty string omits the label. */
  label: string;
}

/**
 * Map a relation value onto the v1 visual language.
 * Topology rules stay stable; colors and labels may iterate later.
 */
export function visualForRelation(relation: RelationType): RelationVisual {
  switch (relation) {
    case "one_to_one":
      return {
        color: "var(--rel-one)",
        strokeWidth: 1.5,
        topology: "direct",
        label: "",
      };
    case "shift":
      return {
        color: "var(--rel-shift)",
        strokeWidth: 1.5,
        topology: "direct",
        label: "shift",
      };
    case "renumber":
      return {
        color: "var(--rel-renumber)",
        strokeWidth: 1.5,
        topology: "direct",
        label: "renumber",
      };
    case "split":
      return {
        color: "var(--rel-split)",
        strokeWidth: 2,
        topology: "branch",
        label: "split",
      };
    case "merge":
      return {
        color: "var(--rel-merge)",
        strokeWidth: 2,
        topology: "converge",
        label: "merge",
      };
    case "partial":
      return {
        color: "var(--rel-partial)",
        strokeWidth: 1.5,
        dashArray: "6 4",
        topology: "direct",
        label: "part",
      };
    case "exclude":
      return {
        color: "var(--rel-exclude)",
        strokeWidth: 1.5,
        dashArray: "4 4",
        topology: "to_void",
        label: "absent",
      };
    case "complex":
      return {
        color: "var(--rel-complex)",
        strokeWidth: 1.5,
        topology: "graph",
        label: "complex",
      };
  }
}

/**
 * Label for a partial mapping, including the part id when known.
 * Falls back to ``part`` when the id is empty.
 */
export function partialLabel(part: string | null | undefined): string {
  return part ? `part ${part}` : "part";
}
