import { formatCount } from "./counts";
import { coversWholeBook, type MatrixSelection } from "./MatrixView";
import { dataWarningTip, FLAG_HELP } from "./help";
import { InfoTip } from "./InfoTip";
import {
  bookEvents,
  bookState,
  cellState,
  type ComparisonIndex,
  type IndexedEvent,
} from "./model/index";
import type { EventNote, Span } from "./types";

/** Props for the panel beside the charts. */
export interface InspectorProps {
  index: ComparisonIndex;
  /** Hovered or pinned cell. Hover applies only while nothing is pinned. */
  selection: MatrixSelection | null;
  layersOn: ReadonlySet<string>;
  notes: EventNote[];
  sideNames: { a: string; b: string };
  /**
   * Locale for chapter totals and verse counts.
   * Omit it in the app so the browser supplies separators.
   */
  locale?: string;
}

/**
 * List the events for the hovered or pinned chapter or book.
 * The title and its actions sit above the donut. This panel is the hover hint
 * when nothing is selected or the book is missing, and the chapter totals and
 * event list when a known book is selected. A data-warning chip includes the
 * notes stored for that event.
 */
export function Inspector({
  index,
  selection,
  layersOn,
  notes,
  sideNames,
  locale,
}: InspectorProps) {
  if (selection === null) {
    return hoverHint();
  }
  const book = index.byCode.get(selection.bookCode);
  if (book === undefined) {
    return hoverHint();
  }
  const bookWide = coversWholeBook(selection);
  const events = bookWide
    ? bookEvents(index, book.code, layersOn)
    : cellState(index, book, selection.chapter ?? 1, layersOn).events;
  const summary = bookWide ? bookState(index, book, layersOn) : null;
  return (
    <div className="dv-inspector">
      {summary !== null && (
        <p>
          {chapterTotal(book.aCh, locale)} chapters in {sideNames.a},{" "}
          {chapterTotal(book.bCh, locale)} in {sideNames.b}.
        </p>
      )}
      {events.length === 0 ? (
        <p>Same numbering on both sides in the visible layers.</p>
      ) : (
        <ol className="dv-events">
          {events.slice(0, 60).map((event) => (
            <li key={event.index}>
              <span>{event.type}</span> {formatSpan(event.a)} / {formatSpan(event.b)} (
              {formatCount(event.n, locale)})
              {event.flags.map((flag) => (
                <InfoTip
                  key={flag}
                  label={flag}
                  text={tip(flag, event, notes, sideNames)}
                >
                  {flag}
                </InfoTip>
              ))}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Prompt shown when the panel has no chapter or book to list.
 * Used when nothing is hovered or pinned, and when the selection names a book
 * the index does not contain.
 */
function hoverHint() {
  return (
    <div className="dv-inspector">
      <p>Hover or click a chapter. Arrow keys move through the matrix.</p>
    </div>
  );
}

/**
 * Print one side's chapter total.
 * Zero stays the word "no" so an absent side is not shown as a formatted zero.
 */
function chapterTotal(count: number, locale?: string): string {
  return count > 0 ? formatCount(count, locale) : "no";
}

/** Tip for one flag. Data warnings append the event's notes. */
function tip(
  flag: string,
  event: IndexedEvent,
  notes: EventNote[],
  sideNames: { a: string; b: string },
): string {
  if (flag === "dataWarning") {
    return dataWarningTip(
      notes.filter((note) => note[0] === event.index).map((note) => note[3]),
    );
  }
  return (FLAG_HELP[flag] ?? flag)
    .replace("{a}", sideNames.a)
    .replace("{b}", sideNames.b);
}

/** Compact reference, or an em dash when the side has no span. */
function formatSpan(span: Span | null): string {
  if (span === null) {
    return "—";
  }
  return `${span[0]} ${span[1]}:${span[2]}`;
}
