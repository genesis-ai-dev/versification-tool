import type { ColumnBcv } from "../lib/bcv";
import type { DriveSide } from "./overlay/drawPlan";
import type { SpanCache } from "./viewerCache";
import { loadSpansCached, spanCacheKey } from "./viewerCache";
import type { ViewerUrlState } from "./viewerUrl";
import { canonicalBcvFromSpans } from "../lib/spanCoverage";

/** Return whether two column BCV values carry the same coordinates. */
export function columnBcvEqual(
  left: ColumnBcv | null | undefined,
  right: ColumnBcv | null | undefined,
): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.book === right.book &&
    left.chapter === right.chapter &&
    left.verse === right.verse &&
    (left.part ?? "") === (right.part ?? "")
  );
}

/**
 * Return whether a selection commit patch would change URL-owned BCV or drive fields.
 */
export function selectionUrlPatchDiffers(
  url: ViewerUrlState,
  patch: Partial<ViewerUrlState>,
): boolean {
  if (patch.drive !== undefined && patch.drive !== url.drive) {
    return true;
  }
  if (patch.leftBcv !== undefined && !columnBcvEqual(patch.leftBcv, url.leftBcv)) {
    return true;
  }
  if (patch.rightBcv !== undefined && !columnBcvEqual(patch.rightBcv, url.rightBcv)) {
    return true;
  }
  return false;
}

/**
 * Build one URL patch that commits drive and follower BCV together after resolve.
 * Omits follower fields when ``followerBcv`` is null (exclude / no scroll target).
 */
export function buildSelectionUrlPatch(
  drive: DriveSide,
  driveBcv: ColumnBcv,
  followerBcv: ColumnBcv | null,
): Partial<ViewerUrlState> {
  const patch: Partial<ViewerUrlState> = { drive };
  if (drive === "left") {
    patch.leftBcv = driveBcv;
    if (followerBcv) {
      patch.rightBcv = followerBcv;
    }
  } else {
    patch.rightBcv = driveBcv;
    if (followerBcv) {
      patch.leftBcv = followerBcv;
    }
  }
  return patch;
}

/**
 * Load chapter spans (from cache when present) and snap ``bcv`` to a combined-milestone anchor.
 * Use before selection-driven URL writes when spans may not be cached yet.
 */
export async function loadCanonicalColumnBcv(
  spanCache: SpanCache,
  translationId: string,
  bcv: ColumnBcv,
): Promise<ColumnBcv> {
  await loadSpansCached(translationId, bcv.book, bcv.chapter, spanCache);
  return canonicalColumnBcv(spanCache, translationId, bcv);
}

/**
 * Snap a column BCV to a combined-milestone anchor when spans are already cached.
 */
export function canonicalColumnBcv(
  spanCache: SpanCache,
  translationId: string,
  bcv: ColumnBcv,
): ColumnBcv {
  const spans =
    spanCache.get(spanCacheKey(translationId, bcv.book, bcv.chapter)) ?? [];
  const canonical = canonicalBcvFromSpans(spans, bcv);
  if (!canonical) {
    return bcv;
  }
  return {
    book: bcv.book,
    chapter: bcv.chapter,
    verse: canonical.verse,
    part: canonical.part,
  };
}
