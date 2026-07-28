/* eslint-disable react-refresh/only-export-components -- provider and paired context hook */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { listAssociations } from "../api/associations";
import { ApiError, describeApiError } from "../api/errors";
import { resolveMapping, resolveChapter } from "../api/resolve";
import { listTranslations } from "../api/translations";
import { listVersifications } from "../api/versifications";
import type {
  AssociationOut,
  NavBook,
  ResolveResult,
  TranslationOut,
  VerseSpanOut,
  VersificationOut,
} from "../api/types";
import { columnToResolveArgs, type ColumnBcv } from "../lib/bcv";
import { ensureFollowerChapter } from "./followerChapter";
import type { DriveSide } from "./overlay/drawPlan";
import {
  parseViewerSearch,
  patchViewerUrl,
  serializeViewerSearch,
  type MapMode,
  type ViewerUrlState,
} from "./viewerUrl";
import {
  ensureColumnChapter,
  loadNavigation,
  loadSpansCached,
  navCacheKey,
  spanCacheKey,
  type AssocCache,
  type NavCache,
  type SpanCache,
} from "./viewerCache";

/** Public session API consumed by viewer chrome and columns. */
export interface ViewerSessionValue {
  /** Parsed URL-owned viewer state. */
  url: ViewerUrlState;
  /** Translation catalog from ``GET /api/translations``. */
  translations: TranslationOut[];
  /** Total translation count (drives empty / one-translation states). */
  translationTotal: number;
  /** Scheme catalog for scheme-switcher labels. */
  versifications: VersificationOut[];
  /** Latest resolve result for the current alignment. */
  resolveResult: ResolveResult | null;
  /** Chapter-mode alignments from ``GET /api/resolve/chapter``; null before first load. */
  chapterResolveItems: ResolveResult[] | null;
  /** True while a chapter resolve request is in flight. */
  chapterResolveLoading: boolean;
  /** True while a resolve request is in flight. */
  resolveLoading: boolean;
  /** Banner-level error message when present. */
  errorBanner: string | null;
  /** True after repeated 401s post-challenge. */
  authRequired: boolean;
  /** Spans for a column's current book/chapter (empty when unloaded). */
  spansFor(side: DriveSide): VerseSpanOut[];
  /** Navigation books for a column's selected scheme. */
  navigationFor(side: DriveSide): NavBook[];
  /** Associations for a column's translation. */
  associationsFor(side: DriveSide): AssociationOut[];
  /** Whether both columns can resolve (ids + associations present). */
  canResolve: boolean;
  /** Replace URL state and let effects reload derived data. */
  updateUrl(patch: Partial<ViewerUrlState>): void;
  /** Set a column's structured BCV and mark it as the drive side. */
  setColumnBcv(side: DriveSide, bcv: ColumnBcv): void;
  /** Set a column's translation id (clears BCV when switching). */
  setColumnTranslation(side: DriveSide, translationId: string | null): void;
  /** Set or clear a column's per-request versification selection. */
  setColumnVersification(side: DriveSide, schemeId: string | null): void;
  /** Set the mapping overlay visibility mode (URL ``map`` param). */
  setMapMode(mode: MapMode): void;
  /** Scrollport refs registered by ScriptureColumn for follower scroll. */
  registerScrollRoot(side: DriveSide, el: HTMLElement | null): void;
  /** Reload translation/versification catalogs after manage/ingest mutations. */
  refreshCatalogs(): Promise<void>;
}

const ViewerSessionContext = createContext<ViewerSessionValue | null>(null);

/** Props for the session provider wrapping ViewerPage. */
export interface ViewerSessionProviderProps {
  children: ReactNode;
}

/**
 * Own URL sync, span/nav/association caches, resolve cycle, and scroll-lock.
 * Mount once around the viewer workspace; do not use on manage routes.
 */
export function ViewerSessionProvider({ children }: ViewerSessionProviderProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const url = useMemo(() => parseViewerSearch(searchParams.toString()), [searchParams]);

  const [translations, setTranslations] = useState<TranslationOut[]>([]);
  const [translationTotal, setTranslationTotal] = useState(0);
  const [versifications, setVersifications] = useState<VersificationOut[]>([]);
  const [resolveResult, setResolveResult] = useState<ResolveResult | null>(null);
  const [chapterResolveItems, setChapterResolveItems] = useState<ResolveResult[] | null>(
    null,
  );
  const [chapterResolveLoading, setChapterResolveLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [spanTick, setSpanTick] = useState(0);
  const [navTick, setNavTick] = useState(0);
  const [assocTick, setAssocTick] = useState(0);

  const spanCache = useRef<SpanCache>(new Map());
  const assocCache = useRef<AssocCache>(new Map());
  const navCache = useRef<NavCache>(new Map());
  const scrollRoots = useRef<{ left: HTMLElement | null; right: HTMLElement | null }>({
    left: null,
    right: null,
  });
  const scrollLock = useRef(false);
  const resolveAbort = useRef<AbortController | null>(null);
  const chapterAbort = useRef<AbortController | null>(null);
  const unauthorizedCount = useRef(0);
  const pendingFollowerScroll = useRef<{
    side: DriveSide;
    seq: number;
  } | null>(null);

  const updateUrl = useCallback(
    (patch: Partial<ViewerUrlState>) => {
      const next = patchViewerUrl(url, patch);
      setSearchParams(serializeViewerSearch(next), { replace: true });
    },
    [setSearchParams, url],
  );

  const handleApiFailure = useCallback((error: unknown) => {
    if (!(error instanceof ApiError)) {
      setErrorBanner("Unexpected error");
      console.error("viewer session error", error);
      return;
    }
    console.error("viewer session api error", error.status, error.code, error.message);
    if (error.status === 401) {
      unauthorizedCount.current += 1;
      if (unauthorizedCount.current >= 2) {
        setAuthRequired(true);
      }
    }
    setErrorBanner(describeApiError(error));
  }, []);

  const refreshCatalogs = useCallback(async () => {
    try {
      const [tPage, vPage] = await Promise.all([
        listTranslations(),
        listVersifications(),
      ]);
      setTranslations(tPage.items);
      setTranslationTotal(tPage.total);
      setVersifications(vPage.items);
      applyCatalogDefaults(tPage.items, url, updateUrl);
    } catch (error) {
      handleApiFailure(error);
    }
  }, [handleApiFailure, updateUrl, url]);

  useEffect(() => {
    void refreshCatalogs();
    // Initial catalog load only; subsequent refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load associations when translation ids change.
  useEffect(() => {
    const ids = [
      ...new Set([url.left, url.right].filter((id): id is string => Boolean(id))),
    ];
    let cancelled = false;
    void Promise.all(
      ids.map(async (id) => {
        const cached = assocCache.current.get(id);
        if (cached) {
          return [id, cached] as const;
        }
        const items = await listAssociations(id);
        assocCache.current.set(id, items);
        return [id, items] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) {
          return;
        }
        if (entries.length > 0) {
          setAssocTick((n) => n + 1);
        }
        const byTranslation = new Map(entries);
        const patch: Partial<ViewerUrlState> = {};
        if (
          url.left &&
          url.leftVers &&
          !byTranslation
            .get(url.left)
            ?.some((association) => association.scheme_id === url.leftVers)
        ) {
          patch.leftVers = null;
        }
        if (
          url.right &&
          url.rightVers &&
          !byTranslation
            .get(url.right)
            ?.some((association) => association.scheme_id === url.rightVers)
        ) {
          patch.rightVers = null;
        }
        if (Object.keys(patch).length > 0) {
          updateUrl(patch);
        }
      })
      .catch(handleApiFailure);
    return () => {
      cancelled = true;
    };
  }, [url.left, url.right, url.leftVers, url.rightVers, updateUrl, handleApiFailure]);

  // Load navigation when translation or selected scheme changes.
  useEffect(() => {
    loadNavigation(url.left, url.leftVers, navCache.current, () =>
      setNavTick((n) => n + 1),
    ).catch(handleApiFailure);
    loadNavigation(url.right, url.rightVers, navCache.current, () =>
      setNavTick((n) => n + 1),
    ).catch(handleApiFailure);
  }, [url.left, url.right, url.leftVers, url.rightVers, handleApiFailure]);

  // Load spans for each column's book/chapter; seed BCV defaults when missing.
  useEffect(() => {
    void ensureColumnChapter(url, "left", spanCache.current, navCache.current, updateUrl)
      .then(() => setSpanTick((n) => n + 1))
      .catch(handleApiFailure);
    void ensureColumnChapter(url, "right", spanCache.current, navCache.current, updateUrl)
      .then(() => setSpanTick((n) => n + 1))
      .catch(handleApiFailure);
  }, [url, updateUrl, handleApiFailure, navTick]);

  const associationsFor = useCallback(
    (side: DriveSide): AssociationOut[] => {
      void assocTick;
      const id = side === "left" ? url.left : url.right;
      return id ? (assocCache.current.get(id) ?? []) : [];
    },
    [assocTick, url.left, url.right],
  );

  const canResolve =
    Boolean(url.left) &&
    Boolean(url.right) &&
    (assocCache.current.get(url.left ?? "") ?? []).length > 0 &&
    (assocCache.current.get(url.right ?? "") ?? []).length > 0;
  void assocTick;

  // Resolve cycle: drive→from / follower→to; load follower chapter before scroll.
  useEffect(() => {
    if (!canResolve) {
      setResolveResult(null);
      return;
    }
    const driveBcv = url.drive === "left" ? url.leftBcv : url.rightBcv;
    if (!driveBcv) {
      setResolveResult(null);
      return;
    }

    resolveAbort.current?.abort();
    pendingFollowerScroll.current = null;
    const controller = new AbortController();
    resolveAbort.current = controller;
    setResolveLoading(true);

    const fromTranslation = url.drive === "left" ? url.left! : url.right!;
    const toTranslation = url.drive === "left" ? url.right! : url.left!;
    const fromVers = url.drive === "left" ? url.leftVers : url.rightVers;
    const toVers = url.drive === "left" ? url.rightVers : url.leftVers;
    const { ref, part } = columnToResolveArgs(driveBcv);

    void resolveMapping(
      {
        fromTranslation,
        toTranslation,
        ref,
        part,
        fromVersification: fromVers,
        toVersification: toVers,
      },
      { signal: controller.signal },
    )
      .then(async (result) => {
        if (controller.signal.aborted) {
          return;
        }
        setResolveResult(result);
        setErrorBanner(null);
        unauthorizedCount.current = 0;

        const followerSide: DriveSide = url.drive === "left" ? "right" : "left";
        const followerBcv = followerSide === "left" ? url.leftBcv : url.rightBcv;
        const followerTarget = await ensureFollowerChapter({
          result,
          followerBook: followerBcv?.book ?? null,
          followerChapter: followerBcv?.chapter ?? null,
          loadChapter: async (book, chapter) => {
            await loadSpansCached(toTranslation, book, chapter, spanCache.current);
            setSpanTick((n) => n + 1);
          },
        });
        if (!followerTarget) {
          return;
        }
        const followerUpdate: ColumnBcv = followerTarget;
        if (
          !followerBcv ||
          followerBcv.book !== followerUpdate.book ||
          followerBcv.chapter !== followerUpdate.chapter ||
          followerBcv.verse !== followerUpdate.verse ||
          followerBcv.part !== followerUpdate.part
        ) {
          if (followerSide === "left") {
            updateUrl({ leftBcv: followerUpdate });
          } else {
            updateUrl({ rightBcv: followerUpdate });
          }
        }

        if (followerTarget.seq !== null) {
          pendingFollowerScroll.current = {
            side: followerSide,
            seq: followerTarget.seq,
          };
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setResolveResult(null);
        handleApiFailure(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setResolveLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    canResolve,
    url.drive,
    url.left,
    url.right,
    url.leftBcv,
    url.rightBcv,
    url.leftVers,
    url.rightVers,
    updateUrl,
    handleApiFailure,
  ]);

  // Chapter resolve for overlay chapter mode (drive→from mapping, stored verse spans).
  useEffect(() => {
    if (!canResolve || url.mapMode !== "chapter") {
      setChapterResolveItems(null);
      setChapterResolveLoading(false);
      return;
    }
    const driveBcv = url.drive === "left" ? url.leftBcv : url.rightBcv;
    if (!driveBcv) {
      setChapterResolveItems(null);
      return;
    }

    chapterAbort.current?.abort();
    const controller = new AbortController();
    chapterAbort.current = controller;
    setChapterResolveLoading(true);

    const fromTranslation = url.drive === "left" ? url.left! : url.right!;
    const toTranslation = url.drive === "left" ? url.right! : url.left!;
    const fromVers = url.drive === "left" ? url.leftVers : url.rightVers;
    const toVers = url.drive === "left" ? url.rightVers : url.leftVers;

    void resolveChapter(
      {
        fromTranslation,
        toTranslation,
        book: driveBcv.book,
        chapter: driveBcv.chapter,
        fromVersification: fromVers,
        toVersification: toVers,
      },
      { signal: controller.signal },
    )
      .then((page) => {
        if (controller.signal.aborted) {
          return;
        }
        setChapterResolveItems(page.items);
        setErrorBanner(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setChapterResolveItems(null);
        handleApiFailure(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setChapterResolveLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    canResolve,
    url.mapMode,
    url.drive,
    url.left,
    url.right,
    url.leftBcv,
    url.rightBcv,
    url.leftVers,
    url.rightVers,
    handleApiFailure,
  ]);

  useEffect(() => {
    const pending = pendingFollowerScroll.current;
    if (!pending) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      if (
        scrollFollowerToSeq(scrollRoots.current[pending.side], pending.seq, scrollLock)
      ) {
        pendingFollowerScroll.current = null;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [spanTick, url.leftBcv, url.rightBcv]);

  const spansFor = useCallback(
    (side: DriveSide): VerseSpanOut[] => {
      void spanTick;
      const id = side === "left" ? url.left : url.right;
      const bcv = side === "left" ? url.leftBcv : url.rightBcv;
      if (!id || !bcv) {
        return [];
      }
      return spanCache.current.get(spanCacheKey(id, bcv.book, bcv.chapter)) ?? [];
    },
    [spanTick, url.left, url.right, url.leftBcv, url.rightBcv],
  );

  const navigationFor = useCallback(
    (side: DriveSide): NavBook[] => {
      void navTick;
      const id = side === "left" ? url.left : url.right;
      const vers = side === "left" ? url.leftVers : url.rightVers;
      if (!id) {
        return [];
      }
      return navCache.current.get(navCacheKey(id, vers)) ?? [];
    },
    [navTick, url.left, url.right, url.leftVers, url.rightVers],
  );

  const setColumnBcv = useCallback(
    (side: DriveSide, bcv: ColumnBcv) => {
      if (scrollLock.current) {
        return;
      }
      if (side === "left") {
        updateUrl({ leftBcv: bcv, drive: "left" });
      } else {
        updateUrl({ rightBcv: bcv, drive: "right" });
      }
    },
    [updateUrl],
  );

  const setColumnTranslation = useCallback(
    (side: DriveSide, translationId: string | null) => {
      if (side === "left") {
        updateUrl({
          left: translationId,
          leftBcv: null,
          leftVers: null,
        });
        if (translationId) {
          assocCache.current.delete(translationId);
        }
      } else {
        updateUrl({
          right: translationId,
          rightBcv: null,
          rightVers: null,
        });
        if (translationId) {
          assocCache.current.delete(translationId);
        }
      }
    },
    [updateUrl],
  );

  const setColumnVersification = useCallback(
    (side: DriveSide, schemeId: string | null) => {
      if (side === "left") {
        if (url.left) {
          navCache.current.delete(navCacheKey(url.left, url.leftVers));
          navCache.current.delete(navCacheKey(url.left, schemeId));
        }
        updateUrl({ leftVers: schemeId });
      } else {
        if (url.right) {
          navCache.current.delete(navCacheKey(url.right, url.rightVers));
          navCache.current.delete(navCacheKey(url.right, schemeId));
        }
        updateUrl({ rightVers: schemeId });
      }
      setResolveResult(null);
    },
    [updateUrl, url.left, url.right, url.leftVers, url.rightVers],
  );

  const setMapMode = useCallback(
    (mode: MapMode) => {
      updateUrl({ mapMode: mode });
    },
    [updateUrl],
  );

  const registerScrollRoot = useCallback((side: DriveSide, el: HTMLElement | null) => {
    scrollRoots.current[side] = el;
  }, []);

  const value: ViewerSessionValue = {
    url,
    translations,
    translationTotal,
    versifications,
    resolveResult,
    chapterResolveItems,
    chapterResolveLoading,
    resolveLoading,
    errorBanner,
    authRequired,
    spansFor,
    navigationFor,
    associationsFor,
    canResolve,
    updateUrl,
    setColumnBcv,
    setColumnTranslation,
    setColumnVersification,
    setMapMode,
    registerScrollRoot,
    refreshCatalogs,
  };

  return createElement(ViewerSessionContext.Provider, { value }, children);
}

/**
 * Access the viewer session from chrome/columns.
 * Throws when used outside ``ViewerSessionProvider``.
 */
export function useViewerSession(): ViewerSessionValue {
  const ctx = useContext(ViewerSessionContext);
  if (!ctx) {
    throw new Error("useViewerSession requires ViewerSessionProvider");
  }
  return ctx;
}

/** Seed left/right defaults from the catalog when URL ids are missing. */
function applyCatalogDefaults(
  items: TranslationOut[],
  url: ViewerUrlState,
  updateUrl: (patch: Partial<ViewerUrlState>) => void,
): void {
  if (items.length === 0) {
    return;
  }
  const patch: Partial<ViewerUrlState> = {};
  if (!url.left && items[0]) {
    patch.left = items[0].id;
  }
  if (!url.right && items.length >= 2 && items[1]) {
    patch.right = items[1].id;
  }
  if (Object.keys(patch).length > 0) {
    updateUrl(patch);
  }
}

/** Scroll the follower column to a target seq under scroll-lock. */
function scrollFollowerToSeq(
  root: HTMLElement | null,
  seq: number | null,
  lock: { current: boolean },
): boolean {
  if (!root || seq === null || seq === undefined) {
    return false;
  }
  const el = root.querySelector<HTMLElement>(`[data-seq="${seq}"]`);
  if (!el) {
    return false;
  }
  lock.current = true;
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  window.setTimeout(() => {
    lock.current = false;
  }, 400);
  return true;
}
