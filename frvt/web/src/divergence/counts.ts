/**
 * Format a quantity shown in the divergence dialog.
 * Callers in the app omit the locale so the browser supplies thousands separators.
 * Tests pass an explicit locale so the separators do not depend on the machine.
 */
export function formatCount(count: number, locale?: string): string {
  return count.toLocaleString(locale);
}

/**
 * Add the layer totals used by the empty comparison title.
 * Pass `layerStats`. That list includes layers that are switched off, and its
 * counts are event counts.
 */
export function comparisonTotal(counts: readonly { count: number }[]): number {
  return counts.reduce((sum, layer) => sum + layer.count, 0);
}

/**
 * Title shown when nothing is pinned.
 * A positive total is locale-formatted. Zero is the word None, not a number.
 */
export function comparisonTitle(total: number, locale?: string): string {
  if (total === 0) {
    return "All Deviances (None)";
  }
  return `All Deviances (${formatCount(total, locale)})`;
}
