/** Props for the versification-table cell that summarizes linked translations. */
export interface AssociatedTranslationsCellProps {
  /** Sorted non-anchor translation names associated with the scheme. */
  names: string[];
}

/**
 * Renders zero, one, or many associated translation names for a versification row.
 * Multiple associations collapse to ``(n translations)`` with a hover flyout listing each name.
 */
export function AssociatedTranslationsCell({ names }: AssociatedTranslationsCellProps) {
  if (names.length === 0) {
    return <span className="muted">None</span>;
  }
  if (names.length === 1) {
    return <span>{names[0]}</span>;
  }
  return (
    <span className="assoc-translations-summary" tabIndex={0}>
      ({names.length} translations)
      <span role="tooltip" className="assoc-translations-tooltip">
        {names.map((name) => (
          <span key={name} className="assoc-translations-tooltip-line">
            {name}
          </span>
        ))}
      </span>
    </span>
  );
}
