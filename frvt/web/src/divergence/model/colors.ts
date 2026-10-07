import { interpolateCividis, interpolateRdYlGn } from "d3";

/** Dark cividis stops, severity 1 through 5. */
const SEVERITY_STOPS = [0.26, 0.44, 0.62, 0.8, 0.98];

/** Neutral cell fill. Matches the prototype dark token. */
export const NEUTRAL = "#272c35";

/** Accent used for data-warning marks. */
export const ACCENT = "#ff82b4";

/** Hatch stroke for a chapter that exists on only one side. */
export const HATCH = "#8a92a2";

/** Dash pattern for an approximate cell outline. */
export const APPROXIMATE_DASH = "2 1.6";

/** Ribbon color for a move to another book, so it reads apart from a chapter move. */
export const BOOK_MOVE = "#5cc8ff";

/** Page color of the dark palette. */
export const PAPER = "#15181e";

/**
 * Fill for every count dot in the matrix.
 * One dark color on every cell, as in the prototype, so the dot reads as a single kind of mark.
 */
export const COUNT_DOT = PAPER;

/** Muted text color of the dark palette, for canvas strokes that cannot read CSS variables. */
export const MUTED = "#9aa1ad";

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
