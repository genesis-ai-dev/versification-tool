import { apiGet } from "./client";
import type { RequestOptions } from "./client";
import type { DeltaEntry, MisalignmentEntry, Page, ResolveResult } from "./types";

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
): Promise<Page<MisalignmentEntry>> {
  return apiGet<Page<MisalignmentEntry>>("/api/resolve/misalignments", {
    from_translation: fromTranslation,
    to_translation: toTranslation,
    category,
    limit: 500,
    from_versification: overrides?.fromVersification ?? undefined,
    to_versification: overrides?.toVersification ?? undefined,
  });
}
