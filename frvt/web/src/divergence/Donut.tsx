import { schemeSet3 } from "d3";
import { arc, pie, type PieArcDatum } from "d3-shape";
import { useEffect } from "react";
import type { Slice } from "./breakdown";
import { formatCount } from "./counts";
import { HoverTipBody } from "./HoverTip";
import { LAYER_IDS } from "./taxonomy";
import { useHoverTip } from "./useHoverTip";

/** Props for the two-ring breakdown. */
export interface DonutProps {
  /** Inner ring, one slice per visible layer. */
  layers: Slice[];
  /** Outer ring, one slice per visible misalignment type. */
  types: Slice[];
  /** ``this book`` or ``this comparison``, used in each slice tip. */
  scope: string;
  /**
   * Locale for slice values.
   * Omit it in the app so the browser supplies separators.
   */
  locale?: string;
}

/** Inner-ring colors, one per layer, in ``LAYER_IDS`` order. */
export const LAYER_COLORS = ["#8e6cff", "#3d8bfd", "#f0b429", "#e15b64"];

/**
 * Draw the layer ring inside the type ring.
 * When both rings are empty, a note names the scope in place of the chart.
 * Hovering a slice shows its tip after a short delay. The chart name is an
 * aria-label, not an SVG title, so the browser does not add a second tip.
 * The slice tip closes when the pointer leaves or the slices change.
 */
export function Donut({ layers, types, scope, locale }: DonutProps) {
  const { tip, show, hide } = useHoverTip();
  useEffect(() => {
    hide();
  }, [hide, layers, types, scope, locale]);
  if (layers.length === 0 && types.length === 0) {
    return <p className="dv-empty">No differences in {scope}.</p>;
  }
  const tipFor = (slice: Slice) =>
    sliceTip(slice.label, slice.value, slice.percent, scope, locale);
  const inner = ring(layers, 42, 68, LAYER_COLORS, tipFor);
  const outer = ring(types, 74, 104, schemeSet3, tipFor);
  return (
    <div className="dv-donut-host">
      <svg
        className="dv-donut"
        viewBox="0 0 220 220"
        role="group"
        aria-label="Share of the visible differences"
      >
        <g transform="translate(110,110)">
          {[...inner, ...outer].map((item) => (
            <path
              key={item.key}
              d={item.path}
              fill={item.color}
              role="img"
              aria-label={item.tip}
              onPointerEnter={(event) => show(item.tip, event.clientX, event.clientY)}
              onPointerLeave={hide}
            />
          ))}
        </g>
      </svg>
      <HoverTipBody tip={tip} />
    </div>
  );
}

/**
 * Tip for one donut slice.
 * The value is a locale quantity. The percent stays a plain rounded integer.
 */
export function sliceTip(
  label: string,
  value: number,
  percent: number,
  scope: string,
  locale?: string,
): string {
  return `${label}: ${formatCount(value, locale)} (${Math.round(percent)}% of ${scope})`;
}

/**
 * Color for one drawn slice.
 * A type key carries its catalog index after the hyphen, so that type keeps
 * its color when other types are hidden. A layer key names the layer, so
 * that layer keeps one color whichever layers are drawn. An unknown key
 * uses the first color.
 */
export function sliceColor(key: string, colors: readonly string[]): string {
  const suffix = key.startsWith("layer-")
    ? (LAYER_IDS as readonly string[]).indexOf(key.slice("layer-".length))
    : Number(key.split("-")[1]);
  if (Number.isNaN(suffix) || suffix < 0) {
    return colors[0] ?? "";
  }
  return colors[suffix % colors.length] ?? colors[0] ?? "";
}

interface Drawn {
  key: string;
  path: string;
  color: string;
  tip: string;
}

/**
 * Build arc paths for one ring.
 * Colors come from ``sliceColor``. The caller supplies each slice tip.
 */
function ring(
  slices: Slice[],
  inner: number,
  outer: number,
  colors: readonly string[],
  tipFor: (slice: Slice) => string,
): Drawn[] {
  const layout = pie<Slice>()
    .value((item) => item.value)
    .sort(null);
  const shape = arc<PieArcDatum<Slice>>().innerRadius(inner).outerRadius(outer);
  return layout(slices).map((datum) => ({
    key: datum.data.key,
    path: shape(datum) ?? "",
    color: sliceColor(datum.data.key, colors),
    tip: tipFor(datum.data),
  }));
}
