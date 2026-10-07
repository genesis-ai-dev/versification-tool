import { formatCount } from "./counts";
import { eventSwatch, flagText, formatRef, typeLabel } from "./eventFormat";
import { HoverTip } from "./HoverTip";
import { dataWarningTip, FLAG_HELP } from "./help";
import { InfoTip } from "./InfoTip";
import {
  bookEvents,
  cellState,
  type ComparisonIndex,
  type IndexedEvent,
} from "./model/index";
import { coversWholeBook, pinnedEvent, type MatrixSelection } from "./model/selection";
import type { EventNote } from "./types";

/** Props for the panel beside the charts. */
export interface InspectorProps {
  index: ComparisonIndex;
  /** Hovered or pinned cell. Hover applies only while nothing is pinned. */
  selection: MatrixSelection | null;
  layersOn: ReadonlySet<string>;
  notes: EventNote[];
  sideNames: { a: string; b: string };
  /**
   * Locale for the verse count on each event.
   * Omit it in the app so the browser supplies separators.
   */
  locale?: string;
}

/**
 * List the events for the hovered or pinned chapter, book, or single event.
 * The title, its actions, and the meta line sit above the donut. This panel is the
 * hover hint when nothing is selected or the book is missing, and the event list when
 * a known book is selected. A selection that names one event lists only that event.
 * Each event shows its catalog label, both sides, and flag chips. A data-warning chip
 * includes the notes stored for that event.
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
  const chosen = pinnedEvent(index, selection, layersOn);
  const events =
    chosen !== null
      ? [chosen]
      : bookWide
        ? bookEvents(index, book.code, layersOn)
        : cellState(index, book, selection.chapter ?? 1, layersOn).events;
  const shown = events.slice(0, 60);
  const hidden = events.length - shown.length;
  return (
    <div className="dv-inspector">
      {events.length === 0 ? (
        <p>Same numbering on both sides in the visible layers.</p>
      ) : (
        <>
          <ol className="dv-events">
            {shown.map((event) => (
              <EventItem
                key={event.index}
                event={event}
                notes={notes}
                sideNames={sideNames}
                locale={locale}
              />
            ))}
          </ol>
          {hidden > 0 && (
            <p className="dv-muted">{hidden} more in the book detail table.</p>
          )}
        </>
      )}
    </div>
  );
}

/** Props for one event in the list. */
interface EventItemProps {
  /** Event to describe. */
  event: IndexedEvent;
  /** Notes attached to data-warning chips. */
  notes: EventNote[];
  /** Translation names used by the reference labels and the chips. */
  sideNames: { a: string; b: string };
  /** Locale for the verse count. Omit it so the browser supplies separators. */
  locale?: string;
}

/**
 * Flags the selection panel does not draw as chips.
 * A missing side and a bridge repeat the reference rows. A ``.vrs`` supplement
 * and a text omission are source notes the panel does not show. The event table
 * still prints every flag.
 */
const HIDDEN_FLAGS = new Set([
  "missingInA",
  "missingInB",
  "bridgeInA",
  "bridgeInB",
  "vrsSupplement",
  "textOmission",
]);

/**
 * Whether a flag is drawn as a chip under the event.
 * The flags in ``HIDDEN_FLAGS`` are omitted. Every other flag is shown,
 * including a data warning whose click carries the source notes.
 */
function panelFlag(flag: string): boolean {
  return !HIDDEN_FLAGS.has(flag);
}

/**
 * One event: its label, the three references, and the chips that add information.
 * A long side name is one line with an ellipsis, and hovering it shows the full name.
 */
function EventItem({ event, notes, sideNames, locale }: EventItemProps) {
  const chips = event.flags.filter(panelFlag);
  return (
    <li className="dv-event">
      <div className="dv-event-type">
        <span
          className="dv-swatch"
          style={{ background: eventSwatch(event) }}
          aria-hidden="true"
        />
        <span>
          {typeLabel(event.type)}
          <span className="dv-event-severity">, severity {event.severity}</span>
        </span>
      </div>
      <dl className="dv-refs">
        <dt>
          <HoverTip className="dv-ref-name" text={sideNames.a}>
            {sideNames.a}
          </HoverTip>
        </dt>
        <dd>{formatRef(event.a)}</dd>
        <dt>org</dt>
        <dd>{formatRef(event.o)}</dd>
        <dt>
          <HoverTip className="dv-ref-name" text={sideNames.b}>
            {sideNames.b}
          </HoverTip>
        </dt>
        <dd>{formatRef(event.b)}</dd>
        <dt>Verses</dt>
        <dd>
          {formatCount(event.n, locale)} ({event.rel})
        </dd>
        {event.type === "SEGMENT" && event.segA !== undefined && (
          <>
            <dt>Segments</dt>
            <dd>
              {event.segA.join(" ") || "none"} vs {event.segB?.join(" ") || "none"}
            </dd>
          </>
        )}
      </dl>
      {chips.length > 0 && (
        <div className="dv-flags">
          {chips.map((flag) => (
            <InfoTip
              key={flag}
              label={flagText(flag, sideNames)}
              text={tip(flag, event, notes, sideNames)}
            >
              <span className={flag === "dataWarning" ? "dv-flag is-warning" : "dv-flag"}>
                {flagText(flag, sideNames)}
              </span>
            </InfoTip>
          ))}
        </div>
      )}
    </li>
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
