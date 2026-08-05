import { apiGet } from "./client";
import type { NavBook } from "./types";

/**
 * Load book/chapter navigation for a translation.
 * Pass ``versification`` only when the column has a non-preferred selection.
 */
export function listNavigation(
  translationId: string,
  versification?: string | null,
): Promise<NavBook[]> {
  return apiGet<NavBook[]>(`/api/translations/${translationId}/navigation`, {
    versification: versification ?? undefined,
  });
}
