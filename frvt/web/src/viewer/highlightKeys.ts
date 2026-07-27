import type { ResolvedSpan } from "../api/types";

/**
 * Build the highlight key set from resolve spans for one column side.
 * Prefers ``seq`` keys to match VerseSpan DOM anchors. When only a part-bearing
 * ref key is available, also includes the whole-verse key so USX rows with an
 * empty ``data-part`` still highlight.
 */
export function highlightKeysFor(
  spans: Pick<ResolvedSpan, "seq" | "ref" | "part">[],
): Set<string> {
  const keys = new Set<string>();
  for (const span of spans) {
    if (span.seq !== null && span.seq !== undefined) {
      keys.add(`seq:${span.seq}`);
      continue;
    }
    keys.add(`ref:${span.ref}|${span.part ?? ""}`);
    if (span.part) {
      keys.add(`ref:${span.ref}|`);
    }
  }
  return keys;
}
