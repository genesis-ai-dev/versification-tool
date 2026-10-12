import { NEUTRAL, severityColor } from "./model/colors";
import type { IndexedEvent } from "./model/index";
import { TYPE_IDS, TYPE_LABELS } from "./taxonomy";
import type { Span } from "./types";

/** Names of the two translations, used when a flag names a side. */
export interface SideNames {
  /** Side A, printed first. */
  a: string;
  /** Side B, printed second. */
  b: string;
}

/**
 * Catalog label for an event type id.
 * An id outside the catalog, or one with no label, comes back unchanged.
 */
export function typeLabel(id: string): string {
  const index = (TYPE_IDS as readonly string[]).indexOf(id);
  return (index < 0 ? undefined : TYPE_LABELS[index]) ?? id;
}

/**
 * One reference, in the form the column and the table share.
 * A span inside one chapter names the end verse only. A missing span is an em dash.
 */
export function formatRef(span: Span | null): string {
  if (span === null) {
    return "—";
  }
  const [book, startChapter, startVerse, endChapter, endVerse] = span;
  if (startChapter === endChapter) {
    const end = endVerse === startVerse ? "" : `–${endVerse}`;
    return `${book} ${startChapter}:${startVerse}${end}`;
  }
  return `${book} ${startChapter}:${startVerse}–${endChapter}:${endVerse}`;
}

/**
 * Chip and table text for one event flag.
 * Side-specific flags name the translation. Any other flag is shown as stored.
 */
export function flagText(flag: string, sideNames: SideNames): string {
  switch (flag) {
    case "missingInA":
      return `missing in ${sideNames.a}`;
    case "missingInB":
      return `missing in ${sideNames.b}`;
    case "bridgeInA":
      return `bridged in ${sideNames.a} only`;
    case "bridgeInB":
      return `bridged in ${sideNames.b} only`;
    case "approximate":
      return "approximate";
    case "dataWarning":
      return "data warning";
    case "vrsSupplement":
      return "from .vrs supplement";
    case "textOmission":
      return "text omission";
    default:
      return flag;
  }
}

/**
 * Swatch color for one event.
 * A book that exists on one side only stays neutral. Every other event uses its severity.
 */
export function eventSwatch(event: IndexedEvent): string {
  return event.type === "BOOK_ONE_SIDED" ? NEUTRAL : severityColor(event.severity);
}
