import type { DriveSide } from "./overlay/drawPlan";

/** Props for the book jump-marker info affordance beside the Book label. */
export interface BookJumpLegendInfoProps {
  /** Stable id referenced by the Book combobox ``aria-describedby``. */
  id: string;
  /** Column side; flyover opens away from the selector toward the column interior. */
  side: DriveSide;
}

/**
 * Compact info icon beside the Book label; flyover explains the ● book suffix.
 * The tooltip element id is wired to the combobox for screen-reader description.
 */
export function BookJumpLegendInfo({ id, side }: BookJumpLegendInfoProps) {
  return (
    <span className={`book-jump-info book-jump-info-${side}`}>
      <button
        type="button"
        className="book-jump-info-trigger"
        aria-label="Book mapping indicator legend"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="book-jump-info-icon">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <circle cx="8" cy="5.15" r="0.85" fill="currentColor" />
          <path d="M8 7.25v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <span id={id} role="tooltip" className="book-jump-info-tooltip">
        <span className="book-jump-marker" aria-hidden="true">
          ●
        </span>
        {" = Book has mapping differences"}
      </span>
    </span>
  );
}
