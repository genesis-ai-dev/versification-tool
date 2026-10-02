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

/**
 * Counts for one layer toggle, including a layer that is switched off.
 * The count covers the whole comparison, under the same event or verse measure as the rings.
 */
export interface LayerStat {
  /** Toggle this total belongs to. It matches the selection stat with the same id. */
  id: LayerId;
  /** Checkbox name, without the count. */
  label: string;
  /** Events or verses in this layer across the whole comparison. */
  count: number;
  /** This layer's share of the comparison, from 0 to 100. The caller rounds it. */
  percent: number;
}

/**
 * The pinned cell the donut and the selection counts follow.
 * A null chapter means the book summary cell, or a pin that has no chapter.
 */
export interface BreakdownScope {
  /** Book code of the pinned cell. */
  book: string;
  /** Pinned chapter, or null when the pin covers the whole book. */
  chapter: number | null;
}

/**
 * Counts for one layer inside the pinned chapter or book.
 * The percent is that layer's share of the pin, including layers that are switched off.
 */
export interface SelectionStat {
  /** Layer this pin total belongs to. It matches the toggle with the same id. */
  id: LayerId;
  /** Events or verses in this layer inside the pin. */
  count: number;
  /** Share of the pin, from 0 to 100. The caller rounds it. */
  percent: number;
}

/**
 * Donut rings, comparison toggle counts, and pin counts.
 * Rings and selection stats follow the pinned cell. Toggle counts always cover
 * the whole comparison.
 */
export interface Breakdown {
  layers: Slice[];
  types: Slice[];
  layerStats: LayerStat[];
  /** Null when nothing is pinned. Otherwise one entry per layer, in toggle order. */
  selectionStats: SelectionStat[] | null;
}

/**
 * Count events, or the verses they name.
 * The rings and selection stats follow the pinned cell. The layer toggles always
 * count the whole comparison, because they filter the heatmap and the radial chart.
 * Rings omit layers that are switched off. Toggle and selection percents still include them.
 */
export function breakdown(
  report: DivergenceReport,
  scope: BreakdownScope | null,
  layersOn: Readonly<Record<string, boolean>>,
  countVerses: boolean,
): Breakdown {
  const events = report.comparisons[0]?.events ?? [];
  const rings = typeTotals(events, scope, countVerses);
  const toggles = scope === null ? rings : typeTotals(events, null, countVerses);
  const ringLayers = rollupLayers(report, rings);
  const toggleLayers = scope === null ? ringLayers : rollupLayers(report, toggles);
  const visible = LAYER_IDS.reduce(
    (sum, id) => sum + (layersOn[id] === false ? 0 : ringLayers[id]),
    0,
  );
  const all = LAYER_IDS.reduce((sum, id) => sum + toggleLayers[id], 0);
  const selected =
    scope === null ? 0 : LAYER_IDS.reduce((sum, id) => sum + ringLayers[id], 0);
  return {
    layers: LAYER_IDS.filter((id) => layersOn[id] !== false && ringLayers[id] > 0).map(
      (id) => slice(`layer-${id}`, LAYER_LABELS[id], ringLayers[id], visible),
    ),
    types: TYPE_LABELS.map((label, index) => ({ label, index }))
      .filter((item) => {
        const layer = report.types[item.index]?.layer;
        return layersOn[layer] !== false && rings[item.index] > 0;
      })
      .map((item) => slice(`type-${item.index}`, item.label, rings[item.index], visible)),
    layerStats: LAYER_IDS.map((id) => ({
      id,
      label: LAYER_LABELS[id],
      count: toggleLayers[id],
      percent: all === 0 ? 0 : (100 * toggleLayers[id]) / all,
    })),
    selectionStats:
      scope === null
        ? null
        : LAYER_IDS.map((id) => ({
            id,
            count: ringLayers[id],
            percent: selected === 0 ? 0 : (100 * ringLayers[id]) / selected,
          })),
  };
}

/**
 * Sum events into per-type totals for one scope.
 * Pass a pin to keep events on that cell, or null for every event.
 * The verse measure adds each event's verse count, and a count of zero still adds one.
 */
function typeTotals(
  events: readonly EventRow[],
  scope: BreakdownScope | null,
  countVerses: boolean,
): number[] {
  const totals = new Array<number>(TYPE_LABELS.length).fill(0);
  for (const event of events) {
    if (scope !== null && !eventInScope(event, scope)) {
      continue;
    }
    const typeIndex = event[0];
    if (typeIndex < 0 || typeIndex >= totals.length) {
      continue;
    }
    totals[typeIndex] += countVerses ? Math.max(event[4], 1) : 1;
  }
  return totals;
}

/**
 * Fold per-type totals into the four display layers.
 * A type whose layer is missing from the payload is left out of the sums.
 */
function rollupLayers(
  report: DivergenceReport,
  totals: readonly number[],
): Record<LayerId, number> {
  const layers = Object.fromEntries(LAYER_IDS.map((id) => [id, 0])) as Record<
    LayerId,
    number
  >;
  for (const [typeIndex, value] of totals.entries()) {
    const layer = report.types[typeIndex]?.layer;
    if (isLayer(layer)) {
      layers[layer] += value;
    }
  }
  return layers;
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

/**
 * Whether an event belongs on the pinned cell.
 * Sides A and B match the matrix. The event counts once even when both sides match.
 */
function eventInScope(event: EventRow, scope: BreakdownScope): boolean {
  return [event[1], event[3]].some((span) => span !== null && spanMatches(span, scope));
}

/**
 * Whether one side covers the pinned book or chapter.
 * Chapters run from the span's first chapter through the greater endpoint, the same
 * loop the matrix uses. A reversed span therefore covers only its first chapter.
 */
function spanMatches(span: Span, scope: BreakdownScope): boolean {
  if (span[0] !== scope.book) {
    return false;
  }
  if (scope.chapter === null) {
    return true;
  }
  const end = Math.max(span[1], span[3]);
  return scope.chapter >= span[1] && scope.chapter <= end;
}

/** Build one slice. A zero total yields a zero percent. */
function slice(key: string, label: string, value: number, total: number): Slice {
  return { key, label, value, percent: total === 0 ? 0 : (100 * value) / total };
}

/** Whether a payload layer id is one of the four toggles. */
function isLayer(value: string | undefined): value is LayerId {
  return value !== undefined && (LAYER_IDS as readonly string[]).includes(value);
}
