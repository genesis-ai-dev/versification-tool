import { describe, expect, it } from "vitest";
import type { DeltaEntry, MisalignmentEntry, NavRef } from "../api/types";

/**
 * Contract helper mirroring JumpMenu navigation: prefer structured navigation.
 * Intentionally has no range parser — tests lock that invariant.
 */
function jumpTarget(entry: { navigation: NavRef; navigation_ref: string }): NavRef {
  return entry.navigation;
}

describe("jump navigation contract", () => {
  it("TC-UI-037: uses structured navigation and never needs to parse source_ref ranges", () => {
    const delta: DeltaEntry = {
      source_ref: "PSA 3:0-8",
      base_ref: "PSA 3:1-9",
      relation: "shift",
      navigation_ref: "PSA 3:0",
      navigation: { book: "PSA", chapter: 3, verse: 0, part: null },
    };
    const mis: MisalignmentEntry = {
      category: "psalm_title",
      source_ref: "PSA 3:0-8",
      relation: "shift",
      navigation_ref: "PSA 3:0",
      navigation: { book: "PSA", chapter: 3, verse: 0, part: null },
    };

    expect(jumpTarget(delta)).toEqual({
      book: "PSA",
      chapter: 3,
      verse: 0,
      part: null,
    });
    expect(jumpTarget(mis).verse).toBe(0);
    // Display labels may be ranges; navigation target is discrete.
    expect(delta.source_ref.includes("-")).toBe(true);
    expect(delta.navigation_ref.includes("-")).toBe(false);
  });
});
