import { describe, expect, it } from "vitest";
import { formatBcvLabel, formatVerseLabel } from "../lib/formatRef";
import { columnToResolveArgs, toResolveArgs } from "../lib/bcv";
import { navigationToBcv } from "../viewer/jumpNavigation";

describe("formatVerseLabel", () => {
  it("shows Title (0) for verse 0 while machine value stays 0", () => {
    expect(formatVerseLabel(0)).toBe("Title (0)");
    expect(formatVerseLabel(1)).toBe("1");
    expect(toResolveArgs("PSA", 3, 0, null).ref).toBe("PSA 3:0");
  });

  it("formats structured BCV labels without parsing ranges", () => {
    expect(formatBcvLabel("GEN", 1, 1)).toBe("GEN 1:1");
    expect(formatBcvLabel("SIR", 36, 13, "a")).toBe("SIR 36:13a");
  });
});

describe("toResolveArgs", () => {
  it("sends part as a separate field never embedded in ref", () => {
    expect(toResolveArgs("SIR", 36, 13, "a")).toEqual({
      ref: "SIR 36:13",
      part: "a",
    });
    expect(
      columnToResolveArgs({ book: "GEN", chapter: 1, verse: 1, part: null }),
    ).toEqual({
      ref: "GEN 1:1",
      part: null,
    });
  });

  it("TC-UI-037: builds single-verse refs only from structured BCV / jump navigation", () => {
    // Display labels may be ranges (e.g. PSA 3:0-8); jump uses navigation, not a range parser.
    const rangeLabel = "PSA 3:0-8";
    expect(rangeLabel.includes("-")).toBe(true);

    const bcv = navigationToBcv({
      book: "PSA",
      chapter: 3,
      verse: 0,
      part: null,
    });
    const args = toResolveArgs(bcv.book, bcv.chapter, bcv.verse, bcv.part);
    expect(args).toEqual({ ref: "PSA 3:0", part: null });
    expect(args.ref.includes("-")).toBe(false);

    expect(columnToResolveArgs(bcv).ref).toBe("PSA 3:0");
  });
});
