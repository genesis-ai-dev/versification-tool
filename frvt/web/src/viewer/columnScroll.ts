import type { ColumnBcv } from "../lib/bcv";
import {
  type CoverageSpan,
  seqForBcvWithCoverage,
} from "../lib/spanCoverage";

/** Span fields needed to match a column BCV to a scroll target. */
export interface ScrollableSpan extends CoverageSpan {}

/**
 * Find the first span matching a structured BCV and return its ``seq``.
 * Matches exact coordinates first, then combined-milestone ``verse_range`` coverage.
 * Returns null when no span matches (chapter not loaded or verse absent).
 */
export function seqForBcv(
  spans: readonly ScrollableSpan[],
  bcv: ColumnBcv | null | undefined,
): number | null {
  return seqForBcvWithCoverage(spans, bcv);
}

/**
 * Scroll a column scrollport to a span ``seq`` under scroll-lock.
 * Already-visible targets resolve without scrolling so the lock never blocks clicks.
 * Returns false only when the target span is not rendered yet (caller may retry).
 */
export function scrollColumnToSeq(
  root: HTMLElement | null,
  seq: number | null,
  lock: { current: boolean },
): boolean {
  if (!root || seq === null || seq === undefined) {
    return false;
  }
  const el = root.querySelector<HTMLElement>(`[data-seq="${seq}"]`);
  if (!el) {
    return false;
  }
  if (isFullyVisible(root, el)) {
    return true;
  }
  lock.current = true;
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  window.setTimeout(() => {
    lock.current = false;
  }, 400);
  return true;
}

/**
 * Whether a span already sits inside the scrollport viewport.
 * Zero-height measurements (jsdom, pre-layout) count as not visible so scrolling still runs.
 */
function isFullyVisible(root: HTMLElement, el: HTMLElement): boolean {
  const rootRect = root.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  if (rootRect.height === 0 || elRect.height === 0) {
    return false;
  }
  return elRect.top >= rootRect.top && elRect.bottom <= rootRect.bottom;
}
