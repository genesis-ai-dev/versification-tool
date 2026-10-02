import { formatCount } from "./counts";

/** One layer total printed on a checkbox. */
export interface LayerCount {
  /** Events or verses in the layer. Zero is printed as None. */
  count: number;
  /** Unrounded share of that scope, from 0 to 100. The label rounds it. */
  percent: number;
}

/**
 * Format one layer checkbox.
 * Pass the pinned chapter or book totals when a cell is pinned, or null when
 * nothing is pinned. A zero comparison count omits the selection, because the
 * pin cannot contain events the comparison does not. Omit locale in the app so
 * counts follow the browser; tests pass one to lock the separators.
 */
export function layerToggleLabel(
  label: string,
  comparison: LayerCount,
  selection: LayerCount | null,
  locale?: string,
): string {
  const comparisonText = countText(comparison, locale);
  if (comparison.count === 0 || selection === null) {
    return `${label}: ${comparisonText}`;
  }
  return `${label}: ${comparisonText}, selected: ${countText(selection, locale)}`;
}

/**
 * Render one count.
 * A positive count whose percent rounds to 0 stays numeric. The count is a
 * locale quantity; the percent stays a plain rounded integer.
 */
function countText(value: LayerCount, locale?: string): string {
  if (value.count === 0) {
    return "None (0%)";
  }
  return `${formatCount(value.count, locale)} (${Math.round(value.percent)}%)`;
}
