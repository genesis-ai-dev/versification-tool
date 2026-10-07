import { useId } from "react";
import { severityOf } from "./model/detail";
import type { ComparisonIndex } from "./model/index";
import {
  ACCENT,
  APPROXIMATE_DASH,
  HATCH,
  NEUTRAL,
  devianceColor,
  severityColor,
} from "./model/colors";
import { RIBBON_LABELS, RIBBON_TYPES, ribbonStyle } from "./model/radial";

/** Props for the chart key shown on every tab. */
export interface ChartKeyProps {
  /** Comparison index. Ribbon items take their severity from its types. */
  index: ComparisonIndex;
  /** When true, the key also explains the radial move ribbons. */
  showRibbons: boolean;
}

/**
 * Color key for the matrix, the radial chart, and the strip.
 * It sits under the layer toggles on every tab. The move items appear only
 * while the radial chart is showing, because that is where the arrows are drawn.
 */
export function ChartKey({ index, showRibbons }: ChartKeyProps) {
  const hatchId = useId().replace(/:/g, "");
  return (
    <ul className="dv-chart-key" aria-label="Chart key">
      <li>
        <Square color={NEUTRAL} />
        Same
      </li>
      <li>
        <span
          className="dv-key-scale"
          aria-hidden="true"
          style={{
            background: `linear-gradient(90deg, ${devianceColor(0.05)}, ${devianceColor(0.5)}, ${devianceColor(1)})`,
          }}
        />
        Less → more chapter deviance
      </li>
      <li>
        <span className="dv-key-severities" aria-hidden="true">
          {[1, 2, 3, 4].map((severity) => (
            <Square key={severity} color={severityColor(severity)} />
          ))}
        </span>
        Event severity 1 to 4
      </li>
      <li>
        <HatchSwatch patternId={hatchId} />
        Chapter on one side only
      </li>
      <li>
        <ApproximateSwatch />
        Approximate
      </li>
      <li>
        <WarningSwatch />
        Data warning
      </li>
      {showRibbons &&
        RIBBON_TYPES.map((type) => (
          <li key={type}>
            <RibbonSwatch type={type} severity={severityOf(index, type)} />
            {RIBBON_LABELS[type]}
          </li>
        ))}
    </ul>
  );
}

/** A flat color square used for Same and for one severity. */
function Square({ color }: { /** Fill of the square. */ color: string }) {
  return (
    <span className="dv-key-swatch" aria-hidden="true" style={{ background: color }} />
  );
}

/** Hatched square for a chapter that exists on only one side. */
function HatchSwatch({
  patternId,
}: {
  /** Unique pattern id, so two charts do not share one. */ patternId: string;
}) {
  return (
    <svg className="dv-key-mark" aria-hidden="true">
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width="4"
          height="4"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="4" stroke={HATCH} strokeWidth="1.4" />
        </pattern>
      </defs>
      <rect width="14" height="14" rx="2" fill={NEUTRAL} />
      <rect width="14" height="14" rx="2" fill={`url(#${patternId})`} />
    </svg>
  );
}

/** Dashed outline for an approximate cell. */
function ApproximateSwatch() {
  return (
    <svg className="dv-key-mark" aria-hidden="true">
      <rect
        x="0.75"
        y="0.75"
        width="12.5"
        height="12.5"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray={APPROXIMATE_DASH}
      />
    </svg>
  );
}

/** Corner mark for a cell that carries a data warning. */
function WarningSwatch() {
  return (
    <svg className="dv-key-mark" aria-hidden="true">
      <rect width="14" height="14" rx="2" fill={NEUTRAL} />
      <path d="M9,0 H14 V5 Z" fill={ACCENT} />
    </svg>
  );
}

/** Short stroke, with an arrowhead when the ribbon type is a move. */
function RibbonSwatch({
  type,
  severity,
}: {
  /** Ribbon type this swatch explains. */
  type: (typeof RIBBON_TYPES)[number];
  /** Severity used to color a chapter move or an order inversion. */
  severity: number;
}) {
  const style = ribbonStyle(type, severity);
  return (
    <svg className="dv-key-ribbon" aria-hidden="true">
      <line x1="1" y1="7" x2="14" y2="7" stroke={style.color} strokeWidth="2" />
      {style.arrow && <polygon points="12,3 19,7 12,11" fill={style.color} />}
    </svg>
  );
}
