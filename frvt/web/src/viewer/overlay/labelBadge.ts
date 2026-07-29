/** Shared outlined badge layout and SVG painting for overlay labels. */

/** Maximum badge width before wrapping (px). */
export const LABEL_BADGE_MAX_WIDTH = 112;

/** Minimum badge height (px). */
export const LABEL_BADGE_MIN_HEIGHT = 16;

const CHAR_WIDTH = 6.2;
const PADDING_X = 6;
const PADDING_Y = 2;
const LINE_HEIGHT = 14;

/** Computed badge box for a label string. */
export interface LabelBadgeLayout {
  width: number;
  height: number;
}

/**
 * Estimate badge width and height for ``text`` within ``maxWidth``.
 * Used by painters and tests when SVG text metrics are unavailable.
 */
export function layoutLabelBadge(
  text: string,
  maxWidth: number = LABEL_BADGE_MAX_WIDTH,
): LabelBadgeLayout {
  const naturalWidth = text.length * CHAR_WIDTH + PADDING_X * 2;
  const width = Math.min(maxWidth, Math.max(naturalWidth, 28));
  const innerWidth = Math.max(width - PADDING_X * 2, CHAR_WIDTH);
  const charsPerLine = Math.max(1, Math.floor(innerWidth / CHAR_WIDTH));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const height = Math.max(
    LABEL_BADGE_MIN_HEIGHT,
    PADDING_Y * 2 + lines * LINE_HEIGHT,
  );
  return { width, height };
}

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
 * Append a surface-backed label badge (rect + wrapped HTML text) to ``parent``.
 * The badge is centered on ``centerX`` / ``centerY``.
 */
export function appendLabelBadge(
  parent: SVGGElement,
  ns: string,
  options: LabelBadgePaintOptions,
): void {
  const { width, height } = layoutLabelBadge(options.text, options.maxWidth);
  const x = options.centerX - width / 2;
  const y = options.centerY - height / 2;

  const group = document.createElementNS(ns, "g");
  group.setAttribute("class", "overlay-label-badge");

  const rect = document.createElementNS(ns, "rect");
  rect.setAttribute("class", "overlay-label-badge-bg");
  rect.setAttribute("x", String(x));
  rect.setAttribute("y", String(y));
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("rx", "4");
  rect.setAttribute("stroke", options.color);
  group.appendChild(rect);

  const foreign = document.createElementNS(ns, "foreignObject");
  foreign.setAttribute("x", String(x));
  foreign.setAttribute("y", String(y));
  foreign.setAttribute("width", String(width));
  foreign.setAttribute("height", String(height));

  const div = document.createElement("div");
  div.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  div.className = options.emphasis
    ? "overlay-label-badge-text overlay-label-badge-text-emphasis"
    : "overlay-label-badge-text";
  div.textContent = options.text;
  foreign.appendChild(div);
  group.appendChild(foreign);

  parent.appendChild(group);
}
