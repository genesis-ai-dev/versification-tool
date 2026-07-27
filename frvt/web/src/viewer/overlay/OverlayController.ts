import type { ResolveResult, ResolvedSpan } from "../../api/types";
import {
  anchorKey,
  buildDrawPlan,
  createCubicMappingPath,
  type AnchorMaps,
  type DrawPlan,
  type DriveSide,
  type Rect,
} from "./drawPlan";

/** Inputs the controller needs to measure and paint one alignment. */
export interface OverlayModel {
  /** Latest resolve result for the current driving ref. */
  result: ResolveResult | null;
  /** When false, clear the SVG scene. */
  mapEnabled: boolean;
  /** URL ``drive`` column owning source_spans. */
  driveSide: DriveSide;
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
  private model: OverlayModel = { result: null, mapEnabled: true, driveSide: "left" };
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
   * Replace the current resolve model and schedule a redraw.
   * Call after resolve, map toggle, scheme switch, or span re-render.
   */
  setModel(model: OverlayModel): void {
    this.model = model;
    this.scheduleRedraw();
  }

  /** Coalesce redraw triggers into a single animation frame. */
  scheduleRedraw(): void {
    if (this.disposed || this.rafId !== 0) {
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
    if (!this.model.mapEnabled || !this.model.result) {
      clearSvg(this.svg);
      return;
    }
    const anchors = this.measureAnchors();
    const plan = buildDrawPlan(this.model.result, anchors, true);
    paintPlan(this.svg, plan);
  }

  /** Collect drive/follower anchor rects in overlay-local coordinates. */
  private measureAnchors(): AnchorMaps {
    const origin = this.workspace.getBoundingClientRect();
    const driveRoot = this.model.driveSide === "left" ? this.leftRoot : this.rightRoot;
    const followerRoot = this.model.driveSide === "left" ? this.rightRoot : this.leftRoot;
    const drive = measureColumn(driveRoot, origin, this.model.result?.source_spans ?? []);
    const follower = measureColumn(
      followerRoot,
      origin,
      this.model.result?.target_spans ?? [],
    );
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

/** Measure participating spans within a column root. */
function measureColumn(
  root: HTMLElement,
  origin: DOMRect,
  spans: ResolvedSpan[],
): Map<string, Rect> {
  const map = new Map<string, Rect>();
  for (const span of spans) {
    const el = findAnchor(root, span);
    if (!el) {
      console.debug("overlay measure miss", anchorKey(span));
      continue;
    }
    const box = el.getBoundingClientRect();
    map.set(anchorKey(span), {
      x: box.left - origin.left,
      y: box.top - origin.top,
      width: box.width,
      height: box.height,
    });
  }
  return map;
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

/** Remove all painted children from the overlay SVG. */
function clearSvg(svg: SVGSVGElement): void {
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
}

/** Paint outlines, connectors, void stubs, and labels into the SVG host. */
function paintPlan(svg: SVGSVGElement, plan: DrawPlan): void {
  clearSvg(svg);
  const ns = "http://www.w3.org/2000/svg";
  const markerIds = new Map<string, string>();

  for (const outline of plan.outlines) {
    const rect = document.createElementNS(ns, "rect");
    const pad = outline.emphasis === "strong" ? 3 : outline.emphasis === "thin" ? 1 : 2;
    rect.setAttribute("x", String(outline.rect.x - pad));
    rect.setAttribute("y", String(outline.rect.y - pad));
    rect.setAttribute("width", String(outline.rect.width + pad * 2));
    rect.setAttribute("height", String(outline.rect.height + pad * 2));
    rect.setAttribute("rx", "4");
    rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", outline.color);
    rect.setAttribute(
      "stroke-width",
      outline.emphasis === "strong" ? "2" : outline.emphasis === "thin" ? "1" : "1.5",
    );
    if (outline.dashArray) {
      rect.setAttribute("stroke-dasharray", outline.dashArray);
    }
    svg.appendChild(rect);
  }

  for (const connector of plan.connectors) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", createCubicMappingPath(connector.from, connector.to));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", connector.color);
    path.setAttribute("stroke-width", String(connector.strokeWidth));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    if (connector.dashArray) {
      path.setAttribute("stroke-dasharray", connector.dashArray);
    }
    if (!connector.toVoid) {
      path.setAttribute("marker-end", arrowMarkerUrl(svg, markerIds, connector.color));
    }
    svg.appendChild(path);

    if (connector.toVoid) {
      const voidMark = document.createElementNS(ns, "circle");
      voidMark.setAttribute("cx", String(connector.to.x));
      voidMark.setAttribute("cy", String(connector.to.y));
      voidMark.setAttribute("r", "5");
      voidMark.setAttribute("fill", "var(--void-fill)");
      voidMark.setAttribute("stroke", "var(--exclude)");
      voidMark.setAttribute("stroke-width", "1.5");
      svg.appendChild(voidMark);
    }

    if (connector.label) {
      const midX = (connector.from.x + connector.to.x) / 2;
      const midY = (connector.from.y + connector.to.y) / 2 - 6;
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", String(midX));
      text.setAttribute("y", String(midY));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("class", "overlay-label");
      text.textContent = connector.label;
      svg.appendChild(text);
    }
  }
}

/** Reuse one arrow marker definition per connector color. */
function arrowMarkerUrl(
  svg: SVGSVGElement,
  markerIds: Map<string, string>,
  color: string,
): string {
  const existing = markerIds.get(color);
  if (existing) {
    return `url(#${existing})`;
  }

  const ns = "http://www.w3.org/2000/svg";
  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS(ns, "defs");
    svg.appendChild(defs);
  }

  const id = `frvt-arrow-${markerIds.size}`;
  markerIds.set(color, id);

  const marker = document.createElementNS(ns, "marker");
  marker.setAttribute("id", id);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "14");
  marker.setAttribute("markerHeight", "14");
  marker.setAttribute("orient", "auto");
  marker.setAttribute("markerUnits", "userSpaceOnUse");

  const head = document.createElementNS(ns, "path");
  head.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  head.setAttribute("fill", color);
  marker.appendChild(head);
  defs.appendChild(marker);

  return `url(#${id})`;
}
