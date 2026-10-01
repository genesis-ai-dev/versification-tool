import { schemeSet3 } from "d3";
import { arc, pie, type PieArcDatum } from "d3-shape";
import { useId } from "react";
import type { Slice } from "./breakdown";

/** Props for the two-ring breakdown. */
export interface DonutProps {
  /** Inner ring, one slice per visible layer. */
  layers: Slice[];
  /** Outer ring, one slice per visible misalignment type. */
  types: Slice[];
  /** ``this book`` or ``this comparison``, used in each slice tip. */
  scope: string;
}

const LAYER_COLORS = ["#8e6cff", "#3d8bfd", "#f0b429", "#e15b64"];

/**
 * Draw the layer ring inside the type ring.
 * Empty input draws nothing so the dialog can show a zero-event note instead.
 */
export function Donut({ layers, types, scope }: DonutProps) {
  const titleId = useId();
  if (layers.length === 0 && types.length === 0) {
    return <p className="dv-empty">No differences in {scope}.</p>;
  }
  const inner = ring(layers, 42, 68, LAYER_COLORS, scope);
  const outer = ring(types, 74, 104, schemeSet3, scope);
  return (
    <svg className="dv-donut" viewBox="0 0 220 220" role="img" aria-labelledby={titleId}>
      <title id={titleId}>Share of the visible differences</title>
      <g transform="translate(110,110)">
        {inner.map((item) => (
          <path key={item.key} d={item.path} fill={item.color}>
            <title>{item.tip}</title>
          </path>
        ))}
        {outer.map((item) => (
          <path key={item.key} d={item.path} fill={item.color}>
            <title>{item.tip}</title>
          </path>
        ))}
      </g>
    </svg>
  );
}

interface Drawn {
  key: string;
  path: string;
  color: string;
  tip: string;
}

/** Build arc paths for one ring. Type colors follow ``d3.schemeSet3`` by type index. */
function ring(
  slices: Slice[],
  inner: number,
  outer: number,
  colors: readonly string[],
  scope: string,
): Drawn[] {
  const layout = pie<Slice>()
    .value((item) => item.value)
    .sort(null);
  const shape = arc<PieArcDatum<Slice>>().innerRadius(inner).outerRadius(outer);
  return layout(slices).map((datum) => {
    const index = Number(datum.data.key.split("-")[1]);
    const colorKey = Number.isNaN(index) ? datum.index : index;
    return {
      key: datum.data.key,
      path: shape(datum) ?? "",
      color: colors[colorKey % colors.length] ?? colors[0],
      tip: `${datum.data.label}: ${datum.data.value} (${Math.round(datum.data.percent)}% of ${scope})`,
    };
  });
}
