import { useId } from "react";
import { severityOf } from "./model/detail";
import {
  ACCENT,
  APPROXIMATE_DASH,
  COUNT_DOT,
  HATCH,
  MUTED,
  NEUTRAL,
  devianceColor,
  severityColor,
} from "./model/colors";
import {
  COUNT_DOT_LARGE_FROM,
  COUNT_DOT_SMALL_FROM,
  MATRIX,
  countDotRadius,
  type ComparisonIndex,
} from "./model/index";
import { RIBBON_LABELS, RIBBON_TYPES, ribbonStyle } from "./model/radial";

/** Props for the marks at the top of Overview and Radial. */
export interface ChartKeyProps {
  /** Comparison index. Ribbon items take their severity from its types. */
  index: ComparisonIndex;
  /** When true, the key also explains the radial move ribbons. */
  showRibbons: boolean;
}

/**
 * Deviance-severity scale for the selection column. The legend reads "Deviance severity (1-4)".
 * Inspector renders it above the event list when that list has at least one event.
 * Its squares are the event swatches and start at the same left edge. The list's
 * divider is drawn above and below the scale. It does not change the pin.
 */
export function SeverityKey() {
  return (
    <ul className="dv-chart-key" aria-label="Deviance severity">
      <li>
        <span className="dv-key-severities" aria-hidden="true">
          {[1, 2, 3, 4].map((severity) => (
            <span
              key={severity}
              className="dv-swatch"
              style={{ background: severityColor(severity) }}
            />
          ))}
        </span>
        Deviance severity (1-4)
      </li>
    </ul>
  );
}

/**
 * Marks for the matrix and the radial chart.
 * Overview and Radial render it at the top of the chart. Details does not.
 * Move items appear only while the radial chart is showing, because that
 * is where the arrows are drawn.
 */
export function ChartKey({ index, showRibbons }: ChartKeyProps) {
  const hatchId = useId().replace(/:/g, "");
  const smallDot = countDotRadiusForKey(COUNT_DOT_SMALL_FROM);
  const largeDot = countDotRadiusForKey(COUNT_DOT_LARGE_FROM);
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
        <span>Deviances:</span>
        <CountDotSwatch radius={smallDot} />
        <span className="sr-only"> small dot </span>
        <span>{`= ${COUNT_DOT_SMALL_FROM}–${COUNT_DOT_LARGE_FROM - 1},`}</span>
        <CountDotSwatch radius={largeDot} />
        <span className="sr-only"> large dot </span>
        <span>{`= ${COUNT_DOT_LARGE_FROM}+`}</span>
      </li>
      <li>
        <HatchSwatch patternId={hatchId} />
        Single-sided chapters
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

/**
 * Side of a chart-key mark, in px.
 * CountDotSwatch uses it for the square and to scale the dot.
 * It matches `.dv-key-mark` in divergence.css. The matrix cell stays MATRIX.cell.
 */
const KEY_MARK = 14;

/**
 * Radius for a count the chart key is defined to draw.
 * Throws when countDotRadius returns null, which means the key ranges
 * no longer match the thresholds.
 */
function countDotRadiusForKey(count: number): number {
  const radius = countDotRadius(count);
  if (radius === null) {
    throw new Error(`No count dot for ${count} events`);
  }
  return radius;
}

/**
 * Grey chapter square with one count dot, for the chart key.
 * The matrix draws this dot on a colored cell. The key uses the muted grey
 * so the page-colored dot stays visible. Pass a radius from countDotRadiusForKey.
 */
function CountDotSwatch({
  radius,
}: {
  /** Dot radius in matrix pixels, before this swatch scales it up to KEY_MARK. */
  radius: number;
}) {
  const scale = KEY_MARK / MATRIX.cell;
  const center = KEY_MARK / 2;
  return (
    <svg className="dv-key-mark" aria-hidden="true">
      <rect width={KEY_MARK} height={KEY_MARK} rx="2" fill={MUTED} />
      <circle cx={center} cy={center} r={radius * scale} fill={COUNT_DOT} />
    </svg>
  );
}

/** A flat color square for the Same mark. */
function Square({ color }: { /** Fill of the square. */ color: string }) {
  return (
    <span className="dv-key-swatch" aria-hidden="true" style={{ background: color }} />
  );
}

/** Hatched square for a chapter or a whole book that exists on only one side. */
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
