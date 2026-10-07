import { BOOK_MOVE, severityColor } from "./colors";

/** Move and inversion types drawn as ribbons, in chart-key order. */
export const RIBBON_TYPES = ["CHAPTER_MOVE", "CROSS_BOOK", "ORDER_INVERSION"] as const;

/** One of the ribbon types. */
export type RibbonType = (typeof RIBBON_TYPES)[number];

/** Catalog names for the ribbon key, matching the event type labels. */
export const RIBBON_LABELS: Record<RibbonType, string> = {
  CHAPTER_MOVE: "Chapter move",
  CROSS_BOOK: "Cross-book move",
  ORDER_INVERSION: "Order inversion",
};

/** How a ribbon is drawn: its color, and whether it ends in an arrowhead. */
export interface RibbonStyle {
  /** Stroke color. A cross-book move uses its own color; the others use severity. */
  color: string;
  /** True for a move, whose arrowhead points at the destination. */
  arrow: boolean;
}

/** How far a move ribbon stops short of its destination, so the arrowhead stays clear. */
const ARROW_GAP_PX = 7;

/**
 * Whether a type is drawn as a radial ribbon.
 * Use it to skip every other event before asking for a ribbon style.
 */
export function isRibbonType(type: string): type is RibbonType {
  return (RIBBON_TYPES as readonly string[]).includes(type);
}

/**
 * Color and arrow for one ribbon type.
 * A cross-book move is blue. A chapter move and an order inversion use the
 * event severity, and only the two moves carry an arrowhead.
 */
export function ribbonStyle(type: RibbonType, severity: number): RibbonStyle {
  if (type === "CROSS_BOOK") {
    return { color: BOOK_MOVE, arrow: true };
  }
  return { color: severityColor(severity), arrow: type === "CHAPTER_MOVE" };
}

/**
 * Stroke width for a ribbon, from its verse count.
 * Wider ribbons mark longer moves, and the width stays at or under 4.
 */
export function ribbonWidth(verses: number): number {
  return Math.min(4, 0.8 + Math.log2(1 + verses) / 2);
}

/**
 * Quadratic curve between two chapter points.
 * The control point sits near the center so ribbons from one book fan together.
 * Returns null when both points are the same chapter. With ``arrow``, the curve
 * stops 7px short of the destination.
 */
export function ribbonCurve(
  start: readonly [number, number],
  end: readonly [number, number],
  arrow: boolean,
): string | null {
  if (start[0] === end[0] && start[1] === end[1]) {
    return null;
  }
  const controlX = (start[0] + end[0]) * 0.12;
  const controlY = (start[1] + end[1]) * 0.12;
  let endX = end[0];
  let endY = end[1];
  if (arrow) {
    const offsetX = end[0] - controlX;
    const offsetY = end[1] - controlY;
    const length = Math.hypot(offsetX, offsetY) || 1;
    endX = end[0] - (offsetX / length) * ARROW_GAP_PX;
    endY = end[1] - (offsetY / length) * ARROW_GAP_PX;
  }
  return `M${start[0]},${start[1]} Q${controlX},${controlY} ${endX},${endY}`;
}

/** Placement of one book code outside the radial chart. */
export interface BookLabelPlacement {
  /** SVG transform that rotates the code, and flips it on the left half. */
  transform: string;
  /** ``end`` when the code is flipped, so it still grows away from the chart. */
  anchor: "start" | "end";
}

/**
 * Rotation and anchor for a book code outside the chart.
 * Codes on the left half are flipped so they stay upright.
 */
export function bookLabelTransform(midAngle: number, radius: number): BookLabelPlacement {
  const degrees = (midAngle * 180) / Math.PI - 90;
  const flip = degrees > 90 && degrees < 270;
  const turn = flip ? " rotate(180)" : "";
  return {
    transform: `rotate(${degrees}) translate(${radius + 8},0)${turn}`,
    anchor: flip ? "end" : "start",
  };
}
