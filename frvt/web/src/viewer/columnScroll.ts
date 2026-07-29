import type { ColumnBcv } from "../lib/bcv";

/** Span fields needed to match a column BCV to a scroll target. */
export interface ScrollableSpan {
  book: string;
  chapter: number;
  verse: number;
  part: string | null;
  seq: number;
}

/**
 * Find the first span matching a structured BCV and return its ``seq``.
 * Returns null when no span matches (chapter not loaded or verse absent).
 */
export function seqForBcv(
  spans: readonly ScrollableSpan[],
  bcv: ColumnBcv | null | undefined,
): number | null {
  if (!bcv) {
    return null;
  }
  const match = spans.find(
    (span) =>
      span.book === bcv.book &&
      span.chapter === bcv.chapter &&
      span.verse === bcv.verse &&
      (span.part ?? "") === (bcv.part ?? ""),
  );
  return match?.seq ?? null;
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
