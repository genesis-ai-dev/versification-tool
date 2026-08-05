import type { ResolvedSpan, ResolveResult, VerseSpanOut } from "../api/types";
import { columnToResolveArgs, type ColumnBcv } from "../lib/bcv";
import type { DriveSide } from "./overlay/drawPlan";
import { sourceSpanMatchesDrive } from "./overlay/drawPlan";
import { seqForBcv } from "./columnScroll";

/**
 * Whether a resolve result still reflects the current drive-column URL selection.
 * Uses source-span coordinates; pair with ``resolveDriveSide === url.drive``.
 */
export function resolveMatchesDriveSelection(
  result: ResolveResult,
  driveBcv: ColumnBcv,
): boolean {
  return result.source_spans.some((span) => sourceSpanMatchesDrive(span, driveBcv));
}

/**
 * Whether stored resolve output may drive overlay and follower highlights.
 * Rejects results produced under a different ``drive`` side than the URL now owns.
 */
export function resolveResultApplies(
  result: ResolveResult | null,
  resolveDriveSide: DriveSide | null,
  currentDriveSide: DriveSide,
  driveBcv: ColumnBcv | null,
): boolean {
  if (!result || !driveBcv || resolveDriveSide !== currentDriveSide) {
    return false;
  }
  return resolveMatchesDriveSelection(result, driveBcv);
}

/** Return whether a resolved span and a rendered column span are the same coordinates. */
function resolvedSpanMatchesLocal(
  resolved: ResolvedSpan,
  local: VerseSpanOut,
): boolean {
  return (
    resolved.book === local.book &&
    resolved.chapter === local.chapter &&
    resolved.verse === local.verse &&
    (resolved.part ?? "") === (local.part ?? "")
  );
}

/**
 * Map resolve spans onto this column's DOM keys using local seq when coordinates match.
 * Avoids applying another translation's ``seq`` to the wrong verse row in this column.
 */
export function highlightKeysForColumnSpans(
  columnSpans: readonly VerseSpanOut[],
  resolvedSpans: readonly ResolvedSpan[],
): Set<string> {
  const keys = new Set<string>();
  for (const resolved of resolvedSpans) {
    const local = columnSpans.find((span) => resolvedSpanMatchesLocal(resolved, span));
    if (local) {
      keys.add(`seq:${local.seq}`);
    }
    keys.add(`ref:${resolved.ref}|${resolved.part ?? ""}`);
    if (resolved.part) {
      keys.add(`ref:${resolved.ref}|`);
    }
  }
  return keys;
}

/**
 * Highlight keys for one column BCV using loaded chapter spans.
 * Falls back to ref/part keys when the target span is not rendered yet.
 */
export function highlightKeysForBcv(
  spans: readonly VerseSpanOut[],
  bcv: ColumnBcv,
): Set<string> {
  const seq = seqForBcv(spans, bcv);
  if (seq !== null) {
    return new Set([`seq:${seq}`]);
  }
  const { ref, part } = columnToResolveArgs(bcv);
  const keys = new Set<string>([`ref:${ref}|${part ?? ""}`]);
  if (part) {
    keys.add(`ref:${ref}|`);
  }
  return keys;
}

/**
 * Build highlight keys for one scripture column from URL selection and resolve state.
 * The drive column highlights immediately from URL BCV; the follower only when resolve matches.
 */
export function columnHighlightKeys(
  side: DriveSide,
  driveSide: DriveSide,
  columnBcv: ColumnBcv | null,
  driveBcv: ColumnBcv | null,
  spans: readonly VerseSpanOut[],
  resolveResult: ResolveResult | null,
  resolveDriveSide: DriveSide | null,
  selectionSettled: boolean,
): Set<string> {
  if (!selectionSettled) {
    if (
      !resolveResultApplies(resolveResult, resolveDriveSide, driveSide, driveBcv)
    ) {
      return new Set();
    }
  }
  if (side === driveSide && columnBcv) {
    return highlightKeysForBcv(spans, columnBcv);
  }
  if (!resolveResultApplies(resolveResult, resolveDriveSide, driveSide, driveBcv)) {
    return new Set();
  }
  const resolvedSpans =
    driveSide === side ? resolveResult!.source_spans : resolveResult!.target_spans;
  return highlightKeysForColumnSpans(spans, resolvedSpans);
}
