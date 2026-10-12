import { formatCount } from "./counts";
import type { ComparisonIndex } from "./model/index";
import { LAYER_IDS, LAYER_SHORT, type LayerId } from "./taxonomy";

/** Event and book totals behind the summary sentence. */
export interface SummaryCounts {
  /** Events in switched-on layers. */
  events: number;
  /** Books touched on either side by those events. */
  books: number;
  /** Event count per layer, in ``LAYER_IDS`` order, nonzero only. */
  layers: { id: LayerId; count: number }[];
}

/**
 * Count the events the summary sentence reports.
 * A switched-off layer is left out, and a book counts once however many events touch it.
 */
export function summaryCounts(
  index: ComparisonIndex,
  layersOn: ReadonlySet<string>,
): SummaryCounts {
  const visible = index.events.filter((event) => layersOn.has(event.layer));
  const books = new Set(
    visible
      .flatMap((event) => [event.a?.[0], event.b?.[0]])
      .filter((code): code is string => code !== undefined),
  );
  const layers = LAYER_IDS.map((id) => ({
    id,
    count: visible.filter((event) => event.layer === id).length,
  })).filter((layer) => layer.count > 0);
  return { events: visible.length, books: books.size, layers };
}

/**
 * Sentence for the info control beside the dialog title.
 * It names both translations, the event and book totals, and each layer that has events.
 * A switched-off layer is left out. One event or one book uses the singular.
 */
export function summarySentence(
  index: ComparisonIndex,
  layersOn: ReadonlySet<string>,
  sides: { a: string; b: string },
  locale?: string,
): string {
  const counts = summaryCounts(index, layersOn);
  const parts = counts.layers.map(
    (layer) => `${formatCount(layer.count, locale)} ${LAYER_SHORT[layer.id]}`,
  );
  const breakdown = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  const events = counts.events === 1 ? "event" : "events";
  const books = counts.books === 1 ? "book" : "books";
  return `${sides.b} differs from ${sides.a} in ${formatCount(counts.events, locale)} ${events} across ${formatCount(counts.books, locale)} ${books}${breakdown}.`;
}
