import { interpolateCividis, interpolateRdYlGn } from "d3";

/** Dark cividis stops, severity 1 through 5. */
const SEVERITY_STOPS = [0.26, 0.44, 0.62, 0.8, 0.98];

/** Neutral cell fill. Matches the prototype dark token. */
export const NEUTRAL = "#272c35";

/** Accent used for data-warning marks. */
export const ACCENT = "#ff82b4";

/** Hatch stroke for a chapter that exists on only one side. */
export const HATCH = "#8a92a2";

/**
 * Color for an event severity.
 * Severity 0 and values outside 1–5 use the neutral fill.
 */
export function severityColor(severity: number): string {
  const stop = SEVERITY_STOPS[severity - 1];
  return stop === undefined ? NEUTRAL : interpolateCividis(stop);
}

/**
 * Chapter deviance from little to much.
 * ``amount`` is clamped to 0–1. Low values are green and high values are red.
 */
export function devianceColor(amount: number): string {
  const clamped = Math.max(0, Math.min(1, amount));
  return interpolateRdYlGn(1 - clamped);
}
