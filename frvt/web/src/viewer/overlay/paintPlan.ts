import { createCubicMappingPath, type DrawPlan } from "./drawPlan";
import { appendLabelBadge } from "./labelBadge";

/** Remove all painted children from the overlay SVG. */
export function clearSvg(svg: SVGSVGElement): void {
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
}

/**
 * Paint outlines, connectors, void stubs, and labels into the SVG host.
 * Labels are painted after connector paths so badges sit above lines.
 */
export function paintPlan(svg: SVGSVGElement, plan: DrawPlan): void {
  clearSvg(svg);
  const ns = "http://www.w3.org/2000/svg";
  const markerIds = new Map<string, string>();
  const connectorGroups: SVGGElement[] = [];
  const connectorLabels: Array<{
    label: string;
    color: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    opacity?: number;
  }> = [];

  for (const outline of plan.outlines) {
    const group = document.createElementNS(ns, "g");
    if (outline.opacity !== undefined && outline.opacity < 1) {
      group.setAttribute("opacity", String(outline.opacity));
    }
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
    group.appendChild(rect);
    svg.appendChild(group);
  }

  for (const connector of plan.connectors) {
    const group = document.createElementNS(ns, "g");
    if (connector.opacity !== undefined && connector.opacity < 1) {
      group.setAttribute("opacity", String(connector.opacity));
    }
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
    group.appendChild(path);

    if (connector.toVoid) {
      const voidMark = document.createElementNS(ns, "circle");
      voidMark.setAttribute("cx", String(connector.to.x));
      voidMark.setAttribute("cy", String(connector.to.y));
      voidMark.setAttribute("r", "5");
      voidMark.setAttribute("fill", "var(--void-fill)");
      voidMark.setAttribute("stroke", "var(--exclude)");
      voidMark.setAttribute("stroke-width", "1.5");
      group.appendChild(voidMark);
    }

    connectorGroups.push(group);
    if (connector.label) {
      connectorLabels.push({
        label: connector.label,
        color: connector.color,
        from: connector.from,
        to: connector.to,
        opacity: connector.opacity,
      });
    }
  }

  for (const group of connectorGroups) {
    svg.appendChild(group);
  }

  if (connectorLabels.length > 0) {
    const labelsLayer = document.createElementNS(ns, "g");
    labelsLayer.setAttribute("class", "overlay-connector-labels");
    for (const entry of connectorLabels) {
      const labelGroup = document.createElementNS(ns, "g");
      if (entry.opacity !== undefined && entry.opacity < 1) {
        labelGroup.setAttribute("opacity", String(entry.opacity));
      }
      const midX = (entry.from.x + entry.to.x) / 2;
      const midY = (entry.from.y + entry.to.y) / 2 - 6;
      appendLabelBadge(labelGroup, ns, {
        centerX: midX,
        centerY: midY,
        text: entry.label,
        color: entry.color,
      });
      labelsLayer.appendChild(labelGroup);
    }
    svg.appendChild(labelsLayer);
  }

  if (plan.hub) {
    const hubGroup = document.createElementNS(ns, "g");
    hubGroup.setAttribute("class", "overlay-hub");
    if (plan.hub.opacity !== undefined && plan.hub.opacity < 1) {
      hubGroup.setAttribute("opacity", String(plan.hub.opacity));
    }
    appendLabelBadge(hubGroup, ns, {
      centerX: plan.hub.x,
      centerY: plan.hub.y,
      text: plan.hub.text,
      color: plan.hub.color,
      emphasis: true,
    });
    svg.appendChild(hubGroup);
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
