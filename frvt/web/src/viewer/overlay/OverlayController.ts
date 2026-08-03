import type { ResolveResult, ResolvedSpan } from "../../api/types";
import type { MapMode } from "../viewerUrl";
import {
  anchorKey,
  buildDrawPlan,
  indexOfDriveAlignment,
  mergeDrawPlans,
  type AnchorMaps,
  type DriveBcv,
  type DriveSide,
} from "./drawPlan";
import { clearSvg, paintPlan } from "./paintPlan";

/** Inputs the controller needs to measure and paint overlay alignments. */
export interface OverlayModel {
  /** Latest single-verse resolve (highlights / emphasize key). */
  result: ResolveResult | null;
  /** Chapter alignments when ``mapMode`` is chapter; otherwise ignored. */
  chapterResults: ResolveResult[] | null;
  /** URL map visibility mode. */
  mapMode: MapMode;
  /** URL ``drive`` column owning source_spans. */
  driveSide: DriveSide;
  /** Drive column BCV for chapter emphasize selection. */
  driveBcv: DriveBcv | null;
}

/**
 * Imperative overlay controller: measure anchors, build DrawPlan, paint SVG.
 * Coalesces redraw triggers into one ``requestAnimationFrame``.
 */
export class OverlayController {
  private readonly workspace: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly leftRoot: HTMLElement;
  private readonly rightRoot: HTMLElement;
  private model: OverlayModel = {
    result: null,
    chapterResults: null,
    mapMode: "current",
    driveSide: "left",
    driveBcv: null,
  };
  private rafId = 0;
  private disposed = false;
  private readonly onScrollOrResize = (): void => {
    this.scheduleRedraw();
  };
  private readonly resizeObserver: ResizeObserver;

  constructor(
    workspace: HTMLElement,
    svg: SVGSVGElement,
    leftRoot: HTMLElement,
    rightRoot: HTMLElement,
  ) {
    this.workspace = workspace;
    this.svg = svg;
    this.leftRoot = leftRoot;
    this.rightRoot = rightRoot;
    this.resizeObserver = new ResizeObserver(this.onScrollOrResize);
    this.resizeObserver.observe(workspace);
    leftRoot.addEventListener("scroll", this.onScrollOrResize, { passive: true });
    rightRoot.addEventListener("scroll", this.onScrollOrResize, { passive: true });
  }

  /**
   * Replace the current overlay model and schedule a redraw.
   * Call after resolve, map mode change, scheme switch, or span re-render.
   */
  setModel(model: OverlayModel): void {
    this.model = model;
    this.scheduleRedraw();
  }

  /** Coalesce redraw triggers into a single animation frame. */
  scheduleRedraw(): void {
    if (this.disposed) {
      return;
    }
    if (this.rafId !== 0) {
      return;
    }
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.redraw();
    });
  }

  /** Detach listeners and cancel pending frames on unmount. */
  dispose(): void {
    this.disposed = true;
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.resizeObserver.disconnect();
    this.leftRoot.removeEventListener("scroll", this.onScrollOrResize);
    this.rightRoot.removeEventListener("scroll", this.onScrollOrResize);
    clearSvg(this.svg);
  }

  /** Measure, plan, and paint (or clear) the SVG scene. */
  private redraw(): void {
    if (this.disposed) {
      return;
    }
    if (this.model.mapMode === "off") {
      clearSvg(this.svg);
      return;
    }
    if (this.model.mapMode === "current") {
      if (!this.model.result) {
        clearSvg(this.svg);
        return;
      }
      const anchors = this.measureAnchors([this.model.result]);
      const plan = buildDrawPlan(this.model.result, anchors, true);
      paintPlan(this.svg, plan);
      return;
    }

    const chapterItems = this.model.chapterResults;
    if (chapterItems && chapterItems.length > 0) {
      const anchors = this.measureAnchors(chapterItems);
      const plans = chapterItems.map((item) => buildDrawPlan(item, anchors, true));
      const emphasizeIndex =
        this.model.driveBcv !== null
          ? indexOfDriveAlignment(chapterItems, this.model.driveBcv)
          : null;
      const merged = mergeDrawPlans(plans, { emphasizeIndex });
      paintPlan(this.svg, merged);
      return;
    }

    if (this.model.result) {
      const anchors = this.measureAnchors([this.model.result]);
      const plan = buildDrawPlan(this.model.result, anchors, true);
      paintPlan(this.svg, plan);
      return;
    }

    clearSvg(this.svg);
  }

  /** Collect drive/follower anchor rects in overlay-local coordinates. */
  private measureAnchors(results: ResolveResult[]): AnchorMaps {
    const origin = this.workspace.getBoundingClientRect();
    const driveRoot = this.model.driveSide === "left" ? this.leftRoot : this.rightRoot;
    const followerRoot = this.model.driveSide === "left" ? this.rightRoot : this.leftRoot;
    const driveSpans = unionSpans(results, (result) => result.source_spans);
    const followerSpans = unionSpans(results, (result) => result.target_spans);
    const drive = measureColumn(driveRoot, origin, driveSpans);
    const follower = measureColumn(followerRoot, origin, followerSpans);
    const leftBox = this.leftRoot.getBoundingClientRect();
    const rightBox = this.rightRoot.getBoundingClientRect();
    const gutterX = (leftBox.right + rightBox.left) / 2 - origin.left;

    return {
      drive,
      follower,
      driveSide: this.model.driveSide,
      gutterX,
    };
  }
}

/** Union span lists from multiple resolve results for measurement. */
function unionSpans(
  results: ResolveResult[],
  pick: (result: ResolveResult) => ResolvedSpan[],
): ResolvedSpan[] {
  const seen = new Set<string>();
  const spans: ResolvedSpan[] = [];
  for (const result of results) {
    for (const span of pick(result)) {
      const key = anchorKey(span);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      spans.push(span);
    }
  }
  return spans;
}

/** Measure participating spans within a column root, clipped to the scrollport. */
function measureColumn(
  root: HTMLElement,
  origin: DOMRect,
  spans: ResolvedSpan[],
): Map<string, import("./drawPlan").Rect> {
  const rootRect = root.getBoundingClientRect();
  const clipBounds = {
    x: rootRect.left - origin.left,
    y: rootRect.top - origin.top,
    width: rootRect.width,
    height: rootRect.height,
  };
  const map = new Map<string, import("./drawPlan").Rect>();
  for (const span of spans) {
    const el = findAnchor(root, span);
    if (!el) {
      console.debug("overlay measure miss", anchorKey(span));
      continue;
    }
    const box = el.getBoundingClientRect();
    const localRect = {
      x: box.left - origin.left,
      y: box.top - origin.top,
      width: box.width,
      height: box.height,
    };
    const clipped = intersectRect(localRect, clipBounds);
    if (!clipped) {
      continue;
    }
    map.set(anchorKey(span), clipped);
  }
  return map;
}

/** Intersect two axis-aligned rects; returns null when they do not overlap. */
function intersectRect(
  rect: import("./drawPlan").Rect,
  bounds: import("./drawPlan").Rect,
): import("./drawPlan").Rect | null {
  const x1 = Math.max(rect.x, bounds.x);
  const y1 = Math.max(rect.y, bounds.y);
  const x2 = Math.min(rect.x + rect.width, bounds.x + bounds.width);
  const y2 = Math.min(rect.y + rect.height, bounds.y + bounds.height);
  if (x2 <= x1 || y2 <= y1) {
    return null;
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/**
 * Locate a verse span element for overlay measurement.
 * Prefers ``data-seq`` when the span carries one; otherwise matches ``data-ref`` + ``data-part``.
 * When a part-bearing span has no part-specific DOM node, falls back to the whole-verse node.
 */
export function findAnchor(root: HTMLElement, span: ResolvedSpan): HTMLElement | null {
  if (span.seq !== null && span.seq !== undefined) {
    const bySeq = root.querySelector<HTMLElement>(`[data-seq="${span.seq}"]`);
    if (bySeq) {
      return bySeq;
    }
  }
  const part = span.part ?? "";
  const byPart = root.querySelector<HTMLElement>(
    `[data-ref="${cssEscape(span.ref)}"][data-part="${cssEscape(part)}"]`,
  );
  if (byPart) {
    return byPart;
  }
  if (part !== "") {
    return root.querySelector<HTMLElement>(
      `[data-ref="${cssEscape(span.ref)}"][data-part=""]`,
    );
  }
  return null;
}

/** Escape attribute values for querySelector when CSS.escape is available. */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}
