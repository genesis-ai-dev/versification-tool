import type { ReactNode } from "react";
import { schemeSet3 } from "d3";
import type { Slice } from "./breakdown";
import { LAYER_COLORS, sliceColor } from "./Donut";
import { LAYER_HELP, TYPE_HELP } from "./help";
import { InfoIcon } from "./InfoIcon";
import { InfoTip } from "./InfoTip";
import { TYPE_IDS } from "./taxonomy";

/** Props for the slice names beside the donut. */
export interface DonutKeyProps {
  /** Inner-ring slices currently drawn. */
  layers: Slice[];
  /** Outer-ring slices currently drawn. */
  types: Slice[];
}

/**
 * Slice names beside the donut.
 * Layers are the inner ring and types are the outer ring. An empty chart
 * says so in this column. Each known slice opens its explanation from an info
 * control that stays beside the name when the name wraps.
 */
export function DonutKey({ layers, types }: DonutKeyProps) {
  const empty = layers.length === 0 && types.length === 0;
  return (
    <div className="dv-donut-key">
      {empty ? (
        <p>No slices in this chart.</p>
      ) : (
        <>
          <SliceGroup
            heading="Inner ring: layers"
            slices={layers}
            colors={LAYER_COLORS}
          />
          <SliceGroup heading="Outer ring: types" slices={types} colors={schemeSet3} />
        </>
      )}
    </div>
  );
}

/**
 * One group of swatches.
 * An empty group renders nothing. A slice with a stored explanation gets an info
 * control beside its name.
 */
function SliceGroup({
  heading,
  slices,
  colors,
}: {
  /** Group name, naming the ring the swatches belong to. */
  heading: string;
  /** Slices in the same order the ring draws them. */
  slices: Slice[];
  /** Palette ``sliceColor`` uses for this ring. */
  colors: readonly string[];
}) {
  if (slices.length === 0) {
    return null;
  }
  return (
    <div className="dv-key-group">
      <h3>{heading}</h3>
      <ul>
        {slices.map((slice) => {
          const help = sliceHelp(slice.key);
          return (
            <li key={slice.key} className="dv-key-row">
              <span
                className="dv-swatch"
                aria-hidden="true"
                style={{ background: sliceColor(slice.key, colors) }}
              />
              <span className="dv-key-label">{sliceName(slice.label, help)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Slice name and its info control, as one run of text.
 * The last word and the control stay on the same line, so a wrapped name keeps
 * the icon beside the words. They are returned together so nothing is inserted
 * between them; the icon's margin is the gap. A slice with no explanation is
 * the name alone.
 */
function sliceName(label: string, help: string | undefined): ReactNode {
  if (help === undefined) {
    return label;
  }
  const split = label.lastIndexOf(" ");
  const lead = split === -1 ? "" : label.slice(0, split + 1);
  const tail = split === -1 ? label : label.slice(split + 1);
  return [
    lead,
    <span key="tail" className="dv-key-tail">
      {tail}
      <InfoTip label={`${label} explanation`} text={help}>
        <InfoIcon />
      </InfoTip>
    </span>,
  ];
}

/**
 * Stored explanation for a layer or type slice, if the key names one.
 * A layer key is ``layer-`` plus the layer id. A type key is ``type-`` plus the
 * type index. Anything else has no explanation.
 */
function sliceHelp(key: string): string | undefined {
  if (key.startsWith("layer-")) {
    return LAYER_HELP[key.slice("layer-".length)];
  }
  if (!key.startsWith("type-")) {
    return undefined;
  }
  const id = TYPE_IDS[Number(key.slice("type-".length))];
  return id === undefined ? undefined : TYPE_HELP[id];
}
