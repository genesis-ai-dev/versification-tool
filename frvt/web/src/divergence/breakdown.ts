import { LAYER_IDS, LAYER_LABELS, TYPE_LABELS, type LayerId } from "./taxonomy";
import type { DivergenceReport, EventRow, Span } from "./types";

/** Counts for one ring of the donut. */
export interface Slice {
  /** Stable key used as the React and SVG identity. */
  key: string;
  /** Legend label. */
  label: string;
  /** Event count or summed verse count. */
  value: number;
  /** Share of the visible total, 0 when the total is 0. */
  percent: number;
}

/** One layer toggle, including layers that are switched off. */
export interface LayerStat {
  id: LayerId;
  label: string;
  count: number;
  /** Share of every layer under the current measure, rounded later by the caller. */
  percent: number;
}

/** Both rings plus the counts printed on the layer toggles. */
export interface Breakdown {
  layers: Slice[];
  types: Slice[];
  layerStats: LayerStat[];
}

/**
 * Count events, or the verses they name, for the pinned book.
 * Rings omit layers that are switched off. Toggle percents still include them.
 */
export function breakdown(
  report: DivergenceReport,
  pinnedBook: string | null,
  layersOn: Readonly<Record<string, boolean>>,
  countVerses: boolean,
): Breakdown {
  const comparison = report.comparisons[0];
  const totals = new Array<number>(TYPE_LABELS.length).fill(0);
  for (const event of comparison?.events ?? []) {
    if (pinnedBook !== null && !eventTouches(event, pinnedBook)) {
      continue;
    }
    const typeIndex = event[0];
    if (typeIndex < 0 || typeIndex >= totals.length) {
      continue;
    }
    totals[typeIndex] += countVerses ? Math.max(event[4], 1) : 1;
  }
  const layerTotals = Object.fromEntries(LAYER_IDS.map((id) => [id, 0])) as Record<
    LayerId,
    number
  >;
  for (const [typeIndex, value] of totals.entries()) {
    const layer = report.types[typeIndex]?.layer;
    if (isLayer(layer)) {
      layerTotals[layer] += value;
    }
  }
  const all = LAYER_IDS.reduce((sum, id) => sum + layerTotals[id], 0);
  const visible = LAYER_IDS.reduce(
    (sum, id) => sum + (layersOn[id] === false ? 0 : layerTotals[id]),
    0,
  );
  return {
    layers: LAYER_IDS.filter((id) => layersOn[id] !== false && layerTotals[id] > 0).map(
      (id) => slice(`layer-${id}`, LAYER_LABELS[id], layerTotals[id], visible),
    ),
    types: TYPE_LABELS.map((label, index) => ({ label, index }))
      .filter((item) => {
        const layer = report.types[item.index]?.layer;
        return layersOn[layer] !== false && totals[item.index] > 0;
      })
      .map((item) =>
        slice(`type-${item.index}`, item.label, totals[item.index], visible),
      ),
    layerStats: LAYER_IDS.map((id) => ({
      id,
      label: LAYER_LABELS[id],
      count: layerTotals[id],
      percent: all === 0 ? 0 : (100 * layerTotals[id]) / all,
    })),
  };
}

/** Books that have at least one event, in the comparison's book order. */
export function booksInReport(
  report: DivergenceReport,
): { code: string; name: string }[] {
  const comparison = report.comparisons[0];
  if (comparison === undefined) {
    return [];
  }
  const present = new Set<string>();
  for (const event of comparison.events) {
    for (const span of [event[1], event[2], event[3]] as Array<Span | null>) {
      if (span !== null) {
        present.add(span[0]);
      }
    }
  }
  return comparison.books
    .filter((book) => present.has(book.code))
    .map((book) => ({ code: book.code, name: book.name }));
}

/** True when any span of the event is in ``book``. */
function eventTouches(event: EventRow, book: string): boolean {
  return [event[1], event[2], event[3]].some((span) => span !== null && span[0] === book);
}

/** Build one slice. A zero total yields a zero percent. */
function slice(key: string, label: string, value: number, total: number): Slice {
  return { key, label, value, percent: total === 0 ? 0 : (100 * value) / total };
}

/** Whether a payload layer id is one of the four toggles. */
function isLayer(value: string | undefined): value is LayerId {
  return value !== undefined && (LAYER_IDS as readonly string[]).includes(value);
}
