/** Props for the buttons under the column's event list. */
export interface ScopeActionsProps {
  /** Book the column describes, from ``scopeHeading``. Null when nothing is selected. */
  bookCode: string | null;
  /** True while a selection is pinned. Only a pin can be cleared. */
  pinned: boolean;
  /**
   * When false, the book detail button is hidden.
   * The Details tab passes false because that tab is already open.
   */
  showDetails?: boolean;
  /** Opens the Details tab for the selected book. */
  onOpenBook: (code: string) => void;
  /** Clears the hover, the pin, the keyboard focus, and the strip highlight. */
  onClear: () => void;
}

/**
 * Buttons under the event list, as in the prototype.
 * The book detail button shows for a hovered or pinned book unless the Details tab is open.
 * Clear selection shows only while a selection is pinned. When neither applies, the row is not rendered.
 */
export function ScopeActions({
  bookCode,
  pinned,
  showDetails = true,
  onOpenBook,
  onClear,
}: ScopeActionsProps) {
  if (bookCode === null || (!showDetails && !pinned)) {
    return null;
  }
  return (
    <div className="dv-scope-actions">
      {showDetails && (
        <button
          type="button"
          className="btn primary"
          onClick={() => onOpenBook(bookCode)}
        >
          {`Open ${bookCode} in book detail`}
        </button>
      )}
      {pinned && (
        <button type="button" className="btn ghost" onClick={onClear}>
          Clear selection
        </button>
      )}
    </div>
  );
}
