import { describe, expect, it } from "vitest";
import { highlightKeysFor } from "./highlightKeys";

describe("highlightKeysFor", () => {
  it("prefers seq keys when present", () => {
    const keys = highlightKeysFor([
      { seq: 12, ref: "GEN 1:1", part: "a" },
    ]);
    expect(keys).toEqual(new Set(["seq:12"]));
  });

  it("includes whole-verse fallback when only a part-bearing ref is available", () => {
    const keys = highlightKeysFor([
      { seq: null, ref: "GEN 1:1", part: "a" },
    ]);
    expect(keys).toEqual(new Set(["ref:GEN 1:1|a", "ref:GEN 1:1|"]));
  });
});
