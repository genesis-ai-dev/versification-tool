import { schemeSet3 } from "d3";
import type { Slice } from "./breakdown";
import { LAYER_COLORS, sliceColor } from "./Donut";
import { LAYER_HELP } from "./help";
import { InfoIcon } from "./InfoIcon";
import { InfoTip } from "./InfoTip";

/** Props for the color key under the donut. */
export interface DonutKeyProps {
  /** Inner-ring slices currently drawn. */
  layers: Slice[];
  /** Outer-ring slices currently drawn. */
  types: Slice[];
}

/**
 * Collapsed key for the colors on the donut.
 * It starts closed. Layer rows reuse the checkbox explanation. Type rows are the label only.
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
            withHelp
          />
          <SliceGroup
            heading="Outer ring: types"
            slices={types}
            colors={schemeSet3}
            withHelp={false}
          />
        </>
      )}
    </details>
  );
}

/**
 * One group of swatches.
 * An empty group renders nothing. Help icons are only for layers that have a stored explanation.
 */
function SliceGroup({
  heading,
  slices,
  colors,
  withHelp,
}: {
  /** Group name, naming the ring the swatches belong to. */
  heading: string;
  /** Slices in the same order the ring draws them. */
  slices: Slice[];
  /** Palette ``sliceColor`` uses for this ring. */
  colors: readonly string[];
  /** True for the layer ring, which can show the stored explanation. */
  withHelp: boolean;
}) {
  if (slices.length === 0) {
    return null;
  }
  return (
    <div className="dv-key-group">
      <h3>{heading}</h3>
      <ul>
        {slices.map((slice) => {
          const help = withHelp ? layerHelp(slice.key) : undefined;
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
 * Stored explanation for a layer slice, if the key names one.
 * The id is the key with the ``layer-`` prefix removed.
 */
function layerHelp(key: string): string | undefined {
  if (!key.startsWith("layer-")) {
    return undefined;
  }
  return LAYER_HELP[key.slice("layer-".length)];
}
