import { dataWarningTip, FLAG_HELP } from "./help";
import { InfoTip } from "./InfoTip";
import {
  bookEvents,
  bookState,
  cellState,
  type ComparisonIndex,
  type IndexedEvent,
} from "./model/index";
import type { MatrixSelection } from "./MatrixView";
import type { EventNote, Span } from "./types";

/** Props for the panel beside the charts. */
export interface InspectorProps {
  index: ComparisonIndex;
  /** Pinned selection. Hover is used only while nothing is pinned. */
  selection: MatrixSelection | null;
  layersOn: ReadonlySet<string>;
  notes: EventNote[];
  sideNames: { a: string; b: string };
  onOpenBook: (code: string) => void;
  onClear: () => void;
}

/**
 * List the events for the selected chapter or book.
 * A data-warning chip includes the notes stored for that event.
 */
export function Inspector({
  index,
  selection,
  layersOn,
  notes,
  sideNames,
  onOpenBook,
  onClear,
}: InspectorProps) {
  if (selection === null) {
    return (
      <div className="dv-inspector">
        <h2>Nothing selected</h2>
        <p>Hover or click a chapter. Arrow keys move through the matrix.</p>
      </div>
    );
  }
  const book = index.byCode.get(selection.bookCode);
  if (book === undefined) {
    return null;
  }
  const events = selection.summary
    ? bookEvents(index, book.code, layersOn)
    : cellState(index, book, selection.chapter ?? 1, layersOn).events;
  const summary = selection.summary ? bookState(index, book, layersOn) : null;
  const title = selection.summary ? book.name : `${book.name} ${selection.chapter}`;
  return (
    <div className="dv-inspector">
      <h2>{title}</h2>
      {summary !== null && (
        <p>
          {book.aCh || "no"} chapters in {sideNames.a}, {book.bCh || "no"} in{" "}
          {sideNames.b}.
        </p>
      )}
      {events.length === 0 ? (
        <p>Same numbering on both sides in the visible layers.</p>
      ) : (
        <ol className="dv-events">
          {events.slice(0, 60).map((event) => (
            <li key={event.index}>
              <span>{event.type}</span> {formatSpan(event.a)} / {formatSpan(event.b)} (
              {event.n})
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
      <button type="button" className="btn" onClick={() => onOpenBook(book.code)}>
        Open {book.code} in book detail
      </button>
      <button type="button" className="btn ghost" onClick={onClear}>
        Clear selection
      </button>
    </div>
  );
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
