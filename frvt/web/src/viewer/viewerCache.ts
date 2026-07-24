import { listNavigation } from "../api/navigation";
import { listSpans } from "../api/spans";
import type { AssociationOut, NavBook, VerseSpanOut } from "../api/types";
import type { DriveSide } from "./overlay/drawPlan";
import type { ViewerUrlState } from "./viewerUrl";

/** Cached chapter spans keyed by translation + book + chapter. */
export type SpanCache = Map<string, VerseSpanOut[]>;
/** Cached associations keyed by translation id. */
export type AssocCache = Map<string, AssociationOut[]>;
/** Cached navigation keyed by translation + selected scheme (or preferred). */
export type NavCache = Map<string, NavBook[]>;

/** Load navigation for one translation/scheme into the cache. */
export async function loadNavigation(
  translationId: string | null,
  vers: string | null,
  cache: NavCache,
  onLoaded: () => void,
): Promise<void> {
  if (!translationId) {
    return;
  }
  const key = navCacheKey(translationId, vers);
  if (cache.has(key)) {
    return;
  }
  const books = await listNavigation(translationId, vers);
  cache.set(key, books);
  onLoaded();
}

/** Ensure spans for a column chapter are cached; seed BCV when missing. */
export async function ensureColumnChapter(
  url: ViewerUrlState,
  side: DriveSide,
  spans: SpanCache,
  nav: NavCache,
  updateUrl: (patch: Partial<ViewerUrlState>) => void,
): Promise<void> {
  const translationId = side === "left" ? url.left : url.right;
  if (!translationId) {
    return;
  }
  let bcv = side === "left" ? url.leftBcv : url.rightBcv;
  if (!bcv) {
    const vers = side === "left" ? url.leftVers : url.rightVers;
    const books = nav.get(navCacheKey(translationId, vers));
    if (!books || books.length === 0) {
      return;
    }
    const first = books[0];
    const chapter = first.chapters[0] ?? 1;
    const page = await loadSpansCached(translationId, first.book, chapter, spans);
    const firstSpan = page[0];
    bcv = {
      book: first.book,
      chapter,
      verse: firstSpan?.verse ?? 1,
      part: firstSpan?.part ?? null,
    };
    updateUrl(side === "left" ? { leftBcv: bcv } : { rightBcv: bcv });
    return;
  }
  await loadSpansCached(translationId, bcv.book, bcv.chapter, spans);
}

/** Fetch and cache spans for one chapter when missing. */
export async function loadSpansCached(
  translationId: string,
  book: string,
  chapter: number,
  cache: SpanCache,
): Promise<VerseSpanOut[]> {
  const key = spanCacheKey(translationId, book, chapter);
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const page = await listSpans(translationId, book, chapter);
  cache.set(key, page.items);
  return page.items;
}

/** Cache key for chapter spans (versification-independent). */
export function spanCacheKey(
  translationId: string,
  book: string,
  chapter: number,
): string {
  return `${translationId}|${book}|${chapter}`;
}

/** Cache key for navigation (includes selected scheme or preferred). */
export function navCacheKey(translationId: string, vers: string | null): string {
  return `${translationId}|${vers ?? "preferred"}`;
}
