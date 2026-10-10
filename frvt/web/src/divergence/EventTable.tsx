import { formatCount } from "./counts";
import {
  eventSwatch,
  flagText,
  formatRef,
  typeLabel,
  type SideNames,
} from "./eventFormat";
import { HoverTip } from "./HoverTip";
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
  /**
   * Locale for the verse count.
   * Omit it in the app so the browser supplies separators.
   */
  locale?: string;
}

/**
 * Table of one book's events.
 * A row is selected with a click, Enter, or Space. The header stays visible while the body scrolls.
 * Each translation column is only as wide as its references. A longer name is cut off, and resting
 * on it shows the full name. With no references, the header keeps a shortened name visible.
 */
export function EventTable({
  events,
  sideNames,
  activeEvent,
  onPick,
  locale,
}: EventTableProps) {
  return (
    <div className="dv-table-wrap">
      <table className="dv-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Sev.</th>
            <th className="dv-loc">
              <HoverTip className="dv-loc-name" text={sideNames.a}>
                {sideNames.a}
              </HoverTip>
            </th>
            <th>org</th>
            <th className="dv-loc">
              <HoverTip className="dv-loc-name" text={sideNames.b}>
                {sideNames.b}
              </HoverTip>
            </th>
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
                <td className="dv-loc">{formatRef(event.a)}</td>
                <td>{formatRef(event.o)}</td>
                <td className="dv-loc">{formatRef(event.b)}</td>
                <td>
                  {formatCount(event.n, locale)} ({event.rel})
                </td>
                <td className="dv-flags">
                  {event.flags.map((flag) => flagText(flag, sideNames)).join(", ")}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
