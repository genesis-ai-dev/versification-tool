import { describe, expect, it } from "vitest";
import { LAYER_COLORS, sliceColor, sliceTip } from "./Donut";

describe("sliceTip", () => {
  it("formats the slice value and leaves the percent plain", () => {
    expect(sliceTip("Renumbered run", 1000, 10, "this comparison", "en-US")).toBe(
      "Renumbered run: 1,000 (10% of this comparison)",
    );
  });
});

describe("sliceColor", () => {
  it("keeps a type's catalog color and a layer's own color", () => {
    expect(sliceColor("type-3", ["a", "b", "c", "d", "e"])).toBe("d");
    expect(sliceColor("layer-canon", LAYER_COLORS)).toBe(LAYER_COLORS[3]);
    expect(sliceColor("layer-text", LAYER_COLORS)).toBe(LAYER_COLORS[2]);
    expect(sliceColor("type-3", ["a", "b"])).toBe("b");
    expect(sliceColor("layer-missing", ["a", "b"])).toBe("a");
  });
});
