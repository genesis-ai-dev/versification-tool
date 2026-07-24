import type { NavRef } from "../api/types";
import type { ColumnBcv } from "../lib/bcv";

/**
 * Copy a server-provided structured jump target into column state.
 * This intentionally never examines display-only range strings.
 */
export function navigationToBcv(navigation: NavRef): ColumnBcv {
  return {
    book: navigation.book,
    chapter: navigation.chapter,
    verse: navigation.verse,
    part: navigation.part,
  };
}
