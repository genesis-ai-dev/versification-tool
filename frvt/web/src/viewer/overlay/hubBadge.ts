import type { ResolveResult } from "../../api/types";
import type { ConnectorPlan } from "./drawPlan";
import { LABEL_BADGE_MIN_HEIGHT, layoutLabelBadge } from "./labelBadge";

/** Gutter hub badge placed once per composed alignment hull. */
export interface HubBadgePlan {
  /** Horizontal center in overlay-local coordinates. */
  x: number;
  /** Vertical anchor in overlay-local coordinates. */
  y: number;
  /** Badge text (axis summary or relation name). */
  text: string;
  /** Stroke/fill accent color token. */
  color: string;
  /** Optional SVG opacity (chapter dimming). */
  opacity?: number;
}

/**
 * Hub text for a composed hull: axis pair, single axis, or the bare relation.
 */
export function hubTextForComplex(result: ResolveResult): string {
  const { source_rel: sourceRel, target_rel: targetRel } = result;
  if (sourceRel && targetRel) {
    return `${sourceRel} / ${targetRel}`;
  }
  if (sourceRel) {
    return sourceRel;
  }
  if (targetRel) {
    return targetRel;
  }
  return "complex";
}

/**
 * Place a hub badge at the gutter, vertically centered on the connector midpoints.
 */
export function hubBadge(
  connectors: ConnectorPlan[],
  gutterX: number,
  text: string,
  color: string,
): HubBadgePlan | null {
  if (connectors.length === 0) {
    return null;
  }
  const midYs = connectors.map((connector) => (connector.from.y + connector.to.y) / 2);
  const meanY = midYs.reduce((sum, y) => sum + y, 0) / midYs.length;
  return {
    x: gutterX,
    y: meanY - 6,
    text,
    color,
  };
}

/** Approximate badge width from label text (jsdom has no text metrics). */
export function hubBadgeWidth(text: string): number {
  return layoutLabelBadge(text).width;
}

/** Fixed badge height for gutter hub labels (minimum; wrapping may grow). */
export const HUB_BADGE_HEIGHT = LABEL_BADGE_MIN_HEIGHT;
