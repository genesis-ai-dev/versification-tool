/** Shared outlined badge layout and SVG painting for overlay labels. */

/** Maximum badge width before wrapping (px). */
export const LABEL_BADGE_MAX_WIDTH = 112;

/** Inline layout styles so badge sizing works inside SVG foreignObject. */
const BADGE_LAYOUT_STYLE: Partial<CSSStyleDeclaration> = {
  display: "inline-block",
  width: "max-content",
  margin: "0",
  padding: "2px 6px",
  borderWidth: "1.5px",
  borderStyle: "solid",
  borderRadius: "4px",
  fontSize: "11px",
  lineHeight: "1.25",
  textAlign: "center",
  boxSizing: "border-box",
  overflowWrap: "anywhere",
};

/** Options for painting one outlined label badge into an SVG group. */
export interface LabelBadgePaintOptions {
  centerX: number;
  centerY: number;
  text: string;
  color: string;
  maxWidth?: number;
  /** When true, uses hub-style emphasis weight. */
  emphasis?: boolean;
}

/**
 * Append a CSS-outlined label badge centered on ``centerX`` / ``centerY``.
 * Border, wrap, and padding live on the HTML node; ``syncAllLabelBadges``
 * measures the rendered box and sizes the ``foreignObject`` to match.
 */
export function appendLabelBadge(
  parent: SVGGElement,
  ns: string,
  options: LabelBadgePaintOptions,
): void {
  const maxWidth = options.maxWidth ?? LABEL_BADGE_MAX_WIDTH;

  const group = document.createElementNS(ns, "g");
  group.setAttribute("class", "overlay-label-badge");
  group.setAttribute("transform", `translate(${options.centerX} ${options.centerY})`);

  const foreign = document.createElementNS(ns, "foreignObject");
  foreign.setAttribute("class", "overlay-label-badge-foreign");
  foreign.setAttribute("overflow", "visible");
  foreign.setAttribute("x", String(-maxWidth / 2));
  foreign.setAttribute("y", "0");
  foreign.setAttribute("width", String(maxWidth));
  foreign.setAttribute("height", "1");

  const div = document.createElement("div");
  div.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  div.className = options.emphasis
    ? "overlay-label-badge-text overlay-label-badge-text-emphasis"
    : "overlay-label-badge-text";
  Object.assign(div.style, BADGE_LAYOUT_STYLE);
  div.style.maxWidth = `${maxWidth}px`;
  div.style.setProperty("--overlay-label-stroke", options.color);
  div.style.borderColor = options.color;
  div.textContent = options.text;
  foreign.appendChild(div);
  group.appendChild(foreign);
  parent.appendChild(group);
}

/**
 * Size each badge ``foreignObject`` from its rendered HTML box so wrapping and
 * the CSS outline stay aligned without width/height estimation heuristics.
 */
export function syncAllLabelBadges(root: ParentNode): void {
  for (const badge of root.querySelectorAll(".overlay-label-badge")) {
    if (!(badge instanceof SVGGElement)) {
      continue;
    }
    syncLabelBadge(badge);
  }
}

/** Measure one badge div and center its ``foreignObject`` on the group origin. */
function syncLabelBadge(group: SVGGElement): void {
  const foreign = group.querySelector(".overlay-label-badge-foreign");
  const div = group.querySelector(".overlay-label-badge-text");
  if (foreign?.localName !== "foreignObject" || !(div instanceof HTMLDivElement)) {
    return;
  }

  const { width, height } = measureBadgeContent(div);
  foreign.setAttribute("x", String(-width / 2));
  foreign.setAttribute("y", String(-height / 2));
  foreign.setAttribute("width", String(width));
  foreign.setAttribute("height", String(height));
}

/**
 * Read rendered badge dimensions, cloning off-screen when ``foreignObject``
 * layout is unavailable (for example in jsdom).
 */
function measureBadgeContent(div: HTMLDivElement): { width: number; height: number } {
  const fromNode = (node: HTMLElement) => ({
    width: Math.ceil(node.getBoundingClientRect().width || node.offsetWidth || node.scrollWidth),
    height: Math.ceil(node.getBoundingClientRect().height || node.offsetHeight || node.scrollHeight),
  });

  const live = fromNode(div);
  if (live.width > 1 && live.height > 1) {
    return { width: live.width, height: live.height };
  }

  const probe = div.cloneNode(true) as HTMLDivElement;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.left = "-10000px";
  probe.style.top = "0";
  document.body.appendChild(probe);
  const measured = fromNode(probe);
  document.body.removeChild(probe);
  return {
    width: Math.max(1, measured.width),
    height: Math.max(1, measured.height),
  };
}
