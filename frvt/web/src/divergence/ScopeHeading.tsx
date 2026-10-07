import { comparisonTitle, formatCount } from "./counts";
import { InfoIcon } from "./InfoIcon";
import { InfoTip } from "./InfoTip";
import { typeLabel, type SideNames } from "./eventFormat";
import type { ComparisonIndex, IndexedBook } from "./model/index";
import { coversWholeBook, pinnedEvent, type MatrixSelection } from "./model/selection";

/**
 * Props for the title row above the donut.
 * The comparison title is centered. A selection is left-aligned.
 */
export interface ScopeHeadingProps {
  /** Book or chapter name, or the whole-comparison title. */
  title: string;
  /**
   * Explanation opened from the info control beside the title.
   * A chapter lists verse counts, a whole book lists chapter counts, and a selected
   * event lists its verse reference. Null, omitted, or blank draws no control.
   */
  subtitle?: string | null;
  /** True for the comparison title, which is centered. */
  centered: boolean;
}

/** Everything the column needs to describe the hovered or pinned scope. */
export interface ScopeHeadingModel {
  /** Book or chapter name, the event's catalog label, or the whole-comparison title. */
  title: string;
  /** Explanation opened from the info control beside the title, or null when nothing is selected. */
  subtitle: string | null;
  /** True for the comparison title, which is centered. */
  centered: boolean;
  /** Book the column describes, or null when nothing is selected. ``ScopeActions`` reads it. */
  bookCode: string | null;
}

/**
 * Title row above the donut.
 * The comparison title is centered and has no explanation. A selection is
 * left-aligned, and its explanation opens from the info control beside the title.
 */
export function ScopeHeading({ title, subtitle = null, centered }: ScopeHeadingProps) {
  const detail = subtitle?.trim() ? subtitle : null;
  return (
    <header className={centered ? "dv-inspector-head is-centered" : "dv-inspector-head"}>
      <h2>{title}</h2>
      {detail !== null && (
        <InfoTip label={`${title} details`} text={detail}>
          <InfoIcon />
        </InfoTip>
      )}
    </header>
  );
}

/**
 * Heading above the donut for the hovered or pinned cell.
 * Nothing selected, or a book the index does not know, centers the comparison
 * total and names no book, so the column shows no buttons. A verse label replaces the chapter name
 * and the explanation stays the chapter. A book summary, or a cell with no chapter,
 * uses the book name and the whole-book counts. A selected event uses its catalog
 * label and the verse reference. A chapter number is a scripture coordinate, so it
 * stays ungrouped. Omit locale in the app so the totals follow the browser.
 */
export function scopeHeading(
  shown: MatrixSelection | null,
  index: ComparisonIndex,
  total: number,
  sideNames: SideNames,
  layersOn: ReadonlySet<string>,
  locale?: string,
): ScopeHeadingModel {
  const book = shown === null ? undefined : index.byCode.get(shown.bookCode);
  if (shown === null || book === undefined) {
    return {
      title: comparisonTitle(total, locale),
      subtitle: null,
      centered: true,
      bookCode: null,
    };
  }
  const chosen = pinnedEvent(index, shown, layersOn);
  if (chosen !== null) {
    const verse = shown.verseLabel?.trim() ?? "";
    return {
      title: typeLabel(chosen.type),
      subtitle: verse.length > 0 ? verse : book.name,
      centered: false,
      bookCode: book.code,
    };
  }
  const verse = shown.verseLabel?.trim() ?? "";
  const whole = coversWholeBook(shown);
  const title =
    verse.length > 0 ? verse : whole ? book.name : `${book.name} ${shown.chapter}`;
  const subtitle =
    whole || shown.chapter === null
      ? bookLine(book, sideNames, locale)
      : chapterLine(book, shown.chapter, sideNames, locale);
  return { title, subtitle, centered: false, bookCode: book.code };
}

/**
 * Print one side's chapter total.
 * Zero stays the word "no" so an absent side is not shown as a formatted zero.
 */
function chapterTotal(count: number, locale?: string): string {
  return count > 0 ? formatCount(count, locale) : "no";
}

/** ``Whole book: 150 chapters in eng, no in vul``. */
function bookLine(book: IndexedBook, sideNames: SideNames, locale?: string): string {
  return `Whole book: ${chapterTotal(book.aCh, locale)} chapters in ${sideNames.a}, ${chapterTotal(book.bCh, locale)} in ${sideNames.b}`;
}

/** ``Chapter 60: eng 12 verses; vul absent``. One verse stays singular. */
function chapterLine(
  book: IndexedBook,
  chapter: number,
  sideNames: SideNames,
  locale?: string,
): string {
  return `Chapter ${chapter}: ${sideNames.a} ${verseCount(book.a, chapter, locale)}; ${sideNames.b} ${verseCount(book.b, chapter, locale)}`;
}

/** Verse total for one chapter, or ``absent`` when that side has no such chapter. */
function verseCount(lengths: number[] | null, chapter: number, locale?: string): string {
  const count = lengths?.[chapter - 1];
  if (count === undefined) {
    return "absent";
  }
  return `${formatCount(count, locale)} ${count === 1 ? "verse" : "verses"}`;
}
