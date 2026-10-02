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
  it("uses a type's catalog index and a layer's visible position", () => {
    expect(sliceColor("type-3", 0, ["a", "b", "c", "d", "e"])).toBe("d");
    expect(sliceColor("layer-scheme", 0, LAYER_COLORS)).toBe(LAYER_COLORS[0]);
    expect(sliceColor("layer-text", 2, LAYER_COLORS)).toBe(LAYER_COLORS[2]);
    expect(sliceColor("type-3", 0, ["a", "b"])).toBe("b");
  });
});
