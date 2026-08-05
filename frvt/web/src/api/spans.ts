import { apiGet } from "./client";
import type { Page, VerseSpanOut } from "./types";

/** Load verse spans for a translation book/chapter, ordered by ``seq``. */
export function listSpans(
  translationId: string,
  book: string,
  chapter?: number,
): Promise<Page<VerseSpanOut>> {
  return apiGet<Page<VerseSpanOut>>(`/api/translations/${translationId}/spans`, {
    book,
    chapter,
    limit: 500,
  });
}
