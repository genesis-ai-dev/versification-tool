import type { ResolveEdge, ResolvedSpan, ResolveResult } from "../../api/types";
import { partialLabel, visualForRelation } from "./visualLanguage";

/** Axis-aligned rectangle in overlay-local coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Which physical column a span lives in (affects edge exit side). */
export type ColumnSide = "left" | "right";

/** Which URL ``drive`` column owns source_spans. */
export type DriveSide = "left" | "right";

/** Measured anchors keyed for overlay lookup. */
export interface AnchorMaps {
  /** Drive-column anchors keyed by seq (preferred) or ref+part. */
  drive: Map<string, Rect>;
  /** Follower-column anchors keyed by seq (preferred) or ref+part. */
  follower: Map<string, Rect>;
  /** Physical side of the drive column. */
  driveSide: DriveSide;
  /** Mid-x of the inter-column gutter for void terminators. */
  gutterX: number;
}

/** Rounded outline around a participating span. */
export interface OutlinePlan {
  rect: Rect;
  color: string;
  dashArray?: string;
  /** Emphasize source on split / target on merge. */
  emphasis: "normal" | "strong" | "thin";
}

/** One connector path between measured endpoints (or toward void). */
export interface ConnectorPlan {
  /** Start point in overlay-local coords (drive exit). */
  from: { x: number; y: number };
  /** End point in overlay-local coords (follower entry or void). */
  to: { x: number; y: number };
  color: string;
  strokeWidth: number;
  dashArray?: string;
  label: string;
  /** True when the connector ends at a void terminator (exclude). */
  toVoid: boolean;
}

/** Pure SVG scene description produced from resolve + measured anchors. */
export interface DrawPlan {
  outlines: OutlinePlan[];
  connectors: ConnectorPlan[];
}

/**
 * Build a DrawPlan from a ResolveResult and measured anchors.
 * Returns an empty plan when ``mapEnabled`` is false or anchors are missing.
 */
export function buildDrawPlan(
  result: ResolveResult | null,
  anchors: AnchorMaps,
  mapEnabled: boolean,
): DrawPlan {
  if (!mapEnabled || !result) {
    return { outlines: [], connectors: [] };
  }

  const visual = visualForRelation(result.relation);
  switch (result.relation) {
    case "exclude":
      return planExclude(result.source_spans, anchors, visual.color);
    case "split":
      return planBranch(result, anchors, visual.color, "split");
    case "merge":
      return planConverge(result, anchors, visual.color, "merge");
    case "complex":
      return planComplex(result, anchors);
    case "partial":
      return planDirect(result, anchors, {
        color: visual.color,
        strokeWidth: visual.strokeWidth,
        dashArray: visual.dashArray,
        label: partialLabel(result.source_spans[0]?.part ?? result.target_spans[0]?.part),
      });
    default:
      return planDirect(result, anchors, {
        color: visual.color,
        strokeWidth: visual.strokeWidth,
        dashArray: visual.dashArray,
        label: visual.label,
      });
  }
}

/** Anchor lookup key preferring seq, falling back to ref+part. */
export function anchorKey(span: ResolvedSpan): string {
  if (span.seq !== null && span.seq !== undefined) {
    return `seq:${span.seq}`;
  }
  return `ref:${span.ref}|${span.part ?? ""}`;
}

interface DirectStyle {
  color: string;
  strokeWidth: number;
  dashArray?: string;
  label: string;
}

/** Direct 1→1 connector (one_to_one / shift / renumber / partial). */
function planDirect(
  result: ResolveResult,
  anchors: AnchorMaps,
  style: DirectStyle,
): DrawPlan {
  const source = result.source_spans[0];
  const target = result.target_spans[0];
  if (!source || !target) {
    return { outlines: [], connectors: [] };
  }
  const srcRect = anchors.drive.get(anchorKey(source));
  const tgtRect = anchors.follower.get(anchorKey(target));
  if (!srcRect || !tgtRect) {
    return { outlines: [], connectors: [] };
  }
  return {
    outlines: [
      {
        rect: srcRect,
        color: style.color,
        dashArray: style.dashArray,
        emphasis: "normal",
      },
      {
        rect: tgtRect,
        color: style.color,
        dashArray: style.dashArray,
        emphasis: "normal",
      },
    ],
    connectors: [
      {
        from: exitPoint(srcRect, anchors.driveSide),
        to: entryPoint(tgtRect, followerSide(anchors.driveSide)),
        color: style.color,
        strokeWidth: style.strokeWidth,
        dashArray: style.dashArray,
        label: style.label,
        toVoid: false,
      },
    ],
  };
}

/** Split: one drive hub → N follower targets. */
function planBranch(
  result: ResolveResult,
  anchors: AnchorMaps,
  color: string,
  label: string,
): DrawPlan {
  const source = result.source_spans[0];
  if (!source) {
    return { outlines: [], connectors: [] };
  }
  const srcRect = anchors.drive.get(anchorKey(source));
  if (!srcRect) {
    return { outlines: [], connectors: [] };
  }
  const outlines: OutlinePlan[] = [{ rect: srcRect, color, emphasis: "strong" }];
  const connectors: ConnectorPlan[] = [];
  const from = exitPoint(srcRect, anchors.driveSide);
  for (const target of result.target_spans) {
    const tgtRect = anchors.follower.get(anchorKey(target));
    if (!tgtRect) {
      continue;
    }
    outlines.push({ rect: tgtRect, color, emphasis: "thin" });
    connectors.push({
      from,
      to: entryPoint(tgtRect, followerSide(anchors.driveSide)),
      color,
      strokeWidth: 2,
      label,
      toVoid: false,
    });
  }
  return { outlines, connectors };
}

/** Merge: N drive sources → one follower hub. */
function planConverge(
  result: ResolveResult,
  anchors: AnchorMaps,
  color: string,
  label: string,
): DrawPlan {
  const target = result.target_spans[0];
  if (!target) {
    return { outlines: [], connectors: [] };
  }
  const tgtRect = anchors.follower.get(anchorKey(target));
  if (!tgtRect) {
    return { outlines: [], connectors: [] };
  }
  const outlines: OutlinePlan[] = [{ rect: tgtRect, color, emphasis: "strong" }];
  const connectors: ConnectorPlan[] = [];
  const to = entryPoint(tgtRect, followerSide(anchors.driveSide));
  for (const source of result.source_spans) {
    const srcRect = anchors.drive.get(anchorKey(source));
    if (!srcRect) {
      continue;
    }
    outlines.push({ rect: srcRect, color, emphasis: "thin" });
    connectors.push({
      from: exitPoint(srcRect, anchors.driveSide),
      to,
      color,
      strokeWidth: 2,
      label,
      toVoid: false,
    });
  }
  return { outlines, connectors };
}

/**
 * Complex hull: one connector per ``edges`` entry with per-edge coloring.
 * Outlines every participating source and target span.
 */
function planComplex(result: ResolveResult, anchors: AnchorMaps): DrawPlan {
  const fallback = visualForRelation("complex");
  const outlines: OutlinePlan[] = [];
  const seen = new Set<string>();

  for (const span of result.source_spans) {
    const key = anchorKey(span);
    const rect = anchors.drive.get(key);
    if (rect && !seen.has(`d:${key}`)) {
      seen.add(`d:${key}`);
      outlines.push({ rect, color: fallback.color, emphasis: "normal" });
    }
  }
  for (const span of result.target_spans) {
    const key = anchorKey(span);
    const rect = anchors.follower.get(key);
    if (rect && !seen.has(`f:${key}`)) {
      seen.add(`f:${key}`);
      outlines.push({ rect, color: fallback.color, emphasis: "normal" });
    }
  }

  const connectors: ConnectorPlan[] = [];
  for (const edge of result.edges) {
    const connector = connectorForEdge(edge, result, anchors, fallback.color);
    if (connector) {
      connectors.push(connector);
    }
  }

  // Hub label once near the first connector midpoint, retaining its edge label.
  const first = connectors[0];
  if (first) {
    connectors[0] = {
      ...first,
      label: first.label ? `complex · ${first.label}` : "complex",
    };
  }

  return { outlines, connectors };
}

/** Build one complex-edge connector using edge relation color/label. */
function connectorForEdge(
  edge: ResolveEdge,
  result: ResolveResult,
  anchors: AnchorMaps,
  fallbackColor: string,
): ConnectorPlan | null {
  const source = result.source_spans[edge.source_index];
  const target = result.target_spans[edge.target_index];
  if (!source || !target) {
    return null;
  }
  const srcRect = anchors.drive.get(anchorKey(source));
  const tgtRect = anchors.follower.get(anchorKey(target));
  if (!srcRect || !tgtRect) {
    return null;
  }
  const edgeVisual = visualForRelation(edge.relation);
  return {
    from: exitPoint(srcRect, anchors.driveSide),
    to: entryPoint(tgtRect, followerSide(anchors.driveSide)),
    color: edgeVisual.color || fallbackColor,
    strokeWidth: edgeVisual.strokeWidth,
    dashArray: edgeVisual.dashArray,
    label: edgeVisual.label || edge.relation,
    toVoid: false,
  };
}

/**
 * Exclude: outline drive spans only and draw dashed connectors to a void stub.
 * Never invents a follower target outline.
 */
function planExclude(
  sources: ResolvedSpan[],
  anchors: AnchorMaps,
  color: string,
): DrawPlan {
  const outlines: OutlinePlan[] = [];
  const connectors: ConnectorPlan[] = [];
  for (const source of sources) {
    const srcRect = anchors.drive.get(anchorKey(source));
    if (!srcRect) {
      continue;
    }
    outlines.push({ rect: srcRect, color, dashArray: "4 4", emphasis: "normal" });
    const from = exitPoint(srcRect, anchors.driveSide);
    connectors.push({
      from,
      to: { x: anchors.gutterX, y: from.y },
      color,
      strokeWidth: 1.5,
      dashArray: "4 4",
      label: "absent",
      toVoid: true,
    });
  }
  return { outlines, connectors };
}

/** Exit at mid-right for left column, mid-left for right column. */
function exitPoint(rect: Rect, side: ColumnSide): { x: number; y: number } {
  const y = rect.y + rect.height / 2;
  return side === "left" ? { x: rect.x + rect.width, y } : { x: rect.x, y };
}

/** Enter at mid-left for left column, mid-right for right column. */
function entryPoint(rect: Rect, side: ColumnSide): { x: number; y: number } {
  const y = rect.y + rect.height / 2;
  return side === "left" ? { x: rect.x, y } : { x: rect.x + rect.width, y };
}

/** Physical side of the follower given the drive side. */
function followerSide(drive: DriveSide): ColumnSide {
  return drive === "left" ? "right" : "left";
}

/** Count connectors that would be produced for a result (unit-test helper). */
export function expectedConnectorCount(result: ResolveResult): number {
  switch (result.relation) {
    case "exclude":
      return result.source_spans.length;
    case "split":
      return result.target_spans.length;
    case "merge":
      return result.source_spans.length;
    case "complex":
      return result.edges.length;
    default:
      return result.source_spans.length > 0 && result.target_spans.length > 0 ? 1 : 0;
  }
}
