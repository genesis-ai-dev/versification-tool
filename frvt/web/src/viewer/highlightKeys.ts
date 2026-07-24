import type { ResolvedSpan } from "../api/types";

/**
 * Build the highlight key set from resolve spans for one column side.
 * Prefers ``seq`` keys to match VerseSpan DOM anchors.
 */
export function highlightKeysFor(
  spans: Pick<ResolvedSpan, "seq" | "ref" | "part">[],
): Set<string> {
  const keys = new Set<string>();
  for (const span of spans) {
    if (span.seq !== null && span.seq !== undefined) {
      keys.add(`seq:${span.seq}`);
    } else {
      keys.add(`ref:${span.ref}|${span.part ?? ""}`);
    }
  }
  return keys;
}
