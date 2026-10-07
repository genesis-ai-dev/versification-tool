import { formatCount } from "./counts";
import {
  eventSwatch,
  flagText,
  formatRef,
  typeLabel,
  type SideNames,
} from "./eventFormat";
import type { IndexedEvent } from "./model/index";

/** Props for the event table under the strip. */
export interface EventTableProps {
  /** Events of the open book, in catalog order. */
  events: IndexedEvent[];
  /** Translation names used as column headings. */
  sideNames: SideNames;
  /** Event the column shows, or null when a chapter is selected. */
  activeEvent: number | null;
  /** Select this row, or clear it when it is already selected. */
  onPick: (event: IndexedEvent) => void;
  /** Report this row while the pointer is over it. */
  onHover: (event: IndexedEvent) => void;
  /**
   * Locale for the verse count.
   * Omit it in the app so the browser supplies separators.
   */
  locale?: string;
}

/**
 * Table of one book's events.
 * A row is selected with a click, Enter, or Space. The header stays visible while the body scrolls.
 */
export function EventTable({
  events,
  sideNames,
  activeEvent,
  onPick,
  onHover,
  locale,
}: EventTableProps) {
  return (
    <div className="dv-table-wrap">
      <table className="dv-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Sev.</th>
            <th>{sideNames.a}</th>
            <th>org</th>
            <th>{sideNames.b}</th>
            <th>Verses</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan={7}>No divergences in the visible layers.</td>
            </tr>
          ) : (
            events.map((event) => (
              <tr
                key={event.index}
                tabIndex={0}
                aria-selected={activeEvent === event.index}
                onClick={() => onPick(event)}
                onMouseEnter={() => onHover(event)}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key !== "Enter" && keyEvent.key !== " ") {
                    return;
                  }
                  keyEvent.preventDefault();
                  onPick(event);
                }}
              >
                <td>
                  <span
                    className="dv-swatch"
                    style={{ background: eventSwatch(event) }}
                    aria-hidden="true"
                  />
                  {typeLabel(event.type)}
                </td>
                <td>{event.severity}</td>
                <td>{formatRef(event.a)}</td>
                <td>{formatRef(event.o)}</td>
                <td>{formatRef(event.b)}</td>
                <td>
                  {formatCount(event.n, locale)} ({event.rel})
                </td>
                <td>{event.flags.map((flag) => flagText(flag, sideNames)).join(", ")}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
