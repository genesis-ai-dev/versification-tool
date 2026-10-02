import { comparisonTitle } from "./counts";
import { coversWholeBook, type MatrixSelection } from "./MatrixView";
import type { ComparisonIndex } from "./model/index";

/**
 * Props for the title row above the donut.
 * A selection shows Details and Clear. The comparison title is centered and has neither.
 */
export interface ScopeHeadingProps {
  /** Book or chapter name, or the whole-comparison title. */
  title: string;
  /** True for the comparison title, which is centered and has no actions. */
  centered: boolean;
  /** Book to open, or null when the title has no book. */
  bookCode: string | null;
  /** Opens the Details tab for the selected book. */
  onOpenBook: (code: string) => void;
  /** Clears the hover, the pin, and the keyboard focus. */
  onClear: () => void;
  /**
   * When false, the Details button is hidden and Clear stays.
   * The Details tab passes false because that tab is already open.
   */
  showDetails?: boolean;
}

/**
 * Title row above the donut.
 * Details and Clear render only for a selection, on the right of the name.
 * Details is the left button. It is omitted when the Details tab is already open.
 */
export function ScopeHeading({
  title,
  centered,
  bookCode,
  onOpenBook,
  onClear,
  showDetails = true,
}: ScopeHeadingProps) {
  return (
    <header className={centered ? "dv-inspector-head is-centered" : "dv-inspector-head"}>
      <h2>{title}</h2>
      {!centered && bookCode !== null && (
        <div className="dv-inspector-actions">
          {showDetails && (
            <button type="button" className="btn" onClick={() => onOpenBook(bookCode)}>
              Details
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClear}>
            Clear
          </button>
        </div>
      )}
    </header>
  );
}

/**
 * Heading above the donut for the hovered or pinned cell.
 * Nothing selected, or a book the index does not know, centers the comparison
 * total and hides Details and Clear. A verse label replaces the chapter name.
 * A book summary, or a cell with no chapter, uses the book name. A chapter
 * number is a scripture coordinate, so it stays ungrouped. Omit locale in the
 * app so the total follows the browser.
 */
export function scopeHeading(
  shown: MatrixSelection | null,
  index: ComparisonIndex,
  total: number,
  locale?: string,
): Pick<ScopeHeadingProps, "title" | "centered" | "bookCode"> {
  const book = shown === null ? undefined : index.byCode.get(shown.bookCode);
  if (shown === null || book === undefined) {
    return { title: comparisonTitle(total, locale), centered: true, bookCode: null };
  }
  const verse = shown.verseLabel?.trim() ?? "";
  const title =
    verse.length > 0
      ? verse
      : coversWholeBook(shown)
        ? book.name
        : `${book.name} ${shown.chapter}`;
  return { title, centered: false, bookCode: book.code };
}
