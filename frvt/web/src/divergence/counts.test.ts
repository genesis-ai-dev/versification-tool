import { describe, expect, it } from "vitest";
import { comparisonTitle, comparisonTotal, formatCount } from "./counts";

describe("formatCount", () => {
  it("formats quantities with the requested separators", () => {
    expect(formatCount(0, "en-US")).toBe("0");
    expect(formatCount(29, "en-US")).toBe("29");
    expect(formatCount(1000, "en-US")).toBe("1,000");
    expect(formatCount(1234567, "en-US")).toBe("1,234,567");
    expect(formatCount(1000, "de-DE")).toBe("1.000");
  });
});

describe("comparisonTotal", () => {
  it("adds every layer, including a layer whose count is zero", () => {
    expect(comparisonTotal([{ count: 1000 }, { count: 0 }, { count: 234 }])).toBe(1234);
  });
});

describe("comparisonTitle", () => {
  it("names a positive total with locale separators", () => {
    expect(comparisonTitle(29, "en-US")).toBe("All Deviances (29)");
    expect(comparisonTitle(1234, "en-US")).toBe("All Deviances (1,234)");
  });

  it("uses None when the comparison has no deviances", () => {
    expect(comparisonTitle(0, "en-US")).toBe("All Deviances (None)");
  });
});
