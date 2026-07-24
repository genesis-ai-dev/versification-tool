import { describe, expect, it } from "vitest";
import { formatBcvLabel, formatVerseLabel } from "../lib/formatRef";
import { columnToResolveArgs, toResolveArgs } from "../lib/bcv";

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
});
