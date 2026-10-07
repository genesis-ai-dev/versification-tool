import { schemeSet3 } from "d3";
import type { Slice } from "./breakdown";
import { LAYER_COLORS, sliceColor } from "./Donut";
import { LAYER_HELP, TYPE_HELP } from "./help";
import { InfoIcon } from "./InfoIcon";
import { InfoTip } from "./InfoTip";
import { TYPE_IDS } from "./taxonomy";

/** Props for the color key under the donut. */
export interface DonutKeyProps {
  /** Inner-ring slices currently drawn. */
  layers: Slice[];
  /** Outer-ring slices currently drawn. */
  types: Slice[];
}

/**
 * Collapsed key for the colors on the donut.
 * It starts closed. Each layer and type opens its explanation from the info control.
 */
export function DonutKey({ layers, types }: DonutKeyProps) {
  const empty = layers.length === 0 && types.length === 0;
  return (
    <details className="dv-key">
      <summary>Key</summary>
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
    </details>
  );
}

/**
 * One group of swatches.
 * An empty group renders nothing. A slice with a stored explanation gets an info control.
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
              <span>{slice.label}</span>
              {help !== undefined && (
                <InfoTip label={`${slice.label} explanation`} text={help}>
                  <InfoIcon />
                </InfoTip>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
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
