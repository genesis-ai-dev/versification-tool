import { apiGet } from "./client";
import type { RequestOptions } from "./client";
import type { DeltaEntry, JumpMenuEntries, MisalignmentEntry, Page, ResolveResult } from "./types";

/** Arguments for ``GET /api/resolve`` built from URL-owned viewer state. */
export interface ResolveArgs {
  fromTranslation: string;
  toTranslation: string;
  ref: string;
  part?: string | null;
  fromVersification?: string | null;
  toVersification?: string | null;
}

/** Shared optional scheme overrides for jump-menu and navigation calls. */
export interface SchemePairOverrides {
  fromVersification?: string | null;
  toVersification?: string | null;
}

/** Arguments for ``GET /api/resolve/chapter`` (drive column scope). */
export interface ResolveChapterArgs {
  fromTranslation: string;
  toTranslation: string;
  book: string;
  chapter: number;
  fromVersification?: string | null;
  toVersification?: string | null;
}

/**
 * Resolve unique alignments for stored whole verses in one drive chapter.
 * Used when map mode is chapter-wide overlay.
 */
export function resolveChapter(
  args: ResolveChapterArgs,
  options?: RequestOptions,
): Promise<Page<ResolveResult>> {
  return apiGet<Page<ResolveResult>>(
    "/api/resolve/chapter",
    {
      from_translation: args.fromTranslation,
      to_translation: args.toTranslation,
      book: args.book,
      chapter: args.chapter,
      from_versification: args.fromVersification ?? undefined,
      to_versification: args.toVersification ?? undefined,
    },
    options,
  );
}

/**
 * Resolve the current driving verse into denormalized source/target spans.
 * Abort prior in-flight calls when the driving ref changes.
 */
export function resolveMapping(
  args: ResolveArgs,
  options?: RequestOptions,
): Promise<ResolveResult> {
  return apiGet<ResolveResult>(
    "/api/resolve",
    {
      from_translation: args.fromTranslation,
      to_translation: args.toTranslation,
      ref: args.ref,
      part: args.part ?? undefined,
      from_versification: args.fromVersification ?? undefined,
      to_versification: args.toVersification ?? undefined,
    },
    options,
  );
}

/** Load explicit mapping deltas for the jump menu. */
export function listDeltas(
  fromTranslation: string,
  toTranslation: string,
  book: string | undefined,
  overrides?: SchemePairOverrides,
): Promise<Page<DeltaEntry>> {
  return apiGet<Page<DeltaEntry>>("/api/resolve/deltas", {
    from_translation: fromTranslation,
    to_translation: toTranslation,
    book,
    limit: 500,
    from_versification: overrides?.fromVersification ?? undefined,
    to_versification: overrides?.toVersification ?? undefined,
  });
}

/** Load categorized misalignments for the jump menu. */
export function listMisalignments(
  fromTranslation: string,
  toTranslation: string,
  category: string | undefined,
  overrides?: SchemePairOverrides,
  book?: string,
): Promise<Page<MisalignmentEntry>> {
  return apiGet<Page<MisalignmentEntry>>("/api/resolve/misalignments", {
    from_translation: fromTranslation,
    to_translation: toTranslation,
    category,
    book,
    limit: 500,
    from_versification: overrides?.fromVersification ?? undefined,
    to_versification: overrides?.toVersification ?? undefined,
  });
}

/** Combined deltas and misalignments for the jump menu (single server pass). */
export function loadJumpMenu(
  fromTranslation: string,
  toTranslation: string,
  book: string | undefined,
  overrides?: SchemePairOverrides,
  options?: RequestOptions,
): Promise<JumpMenuEntries> {
  return apiGet<JumpMenuEntries>(
    "/api/resolve/jump-menu",
    {
      from_translation: fromTranslation,
      to_translation: toTranslation,
      book,
      limit: 500,
      from_versification: overrides?.fromVersification ?? undefined,
      to_versification: overrides?.toVersification ?? undefined,
    },
    options,
  );
}
