import { describe, expect, it } from "vitest";
import { layerToggleLabel } from "./layerLabel";

describe("layerToggleLabel", () => {
  it("prints the comparison count with a colon", () => {
    expect(layerToggleLabel("Numbering", { count: 29, percent: 10 }, null, "en-US")).toBe(
      "Numbering: 29 (10%)",
    );
  });

  it("prints None when the comparison has no events in the layer", () => {
    expect(layerToggleLabel("Numbering", { count: 0, percent: 0 }, null, "en-US")).toBe(
      "Numbering: None (0%)",
    );
  });

  it("keeps a positive count whose percent rounds to zero", () => {
    expect(layerToggleLabel("Numbering", { count: 1, percent: 0.4 }, null, "en-US")).toBe(
      "Numbering: 1 (0%)",
    );
  });

  it("appends the selection share when a cell is pinned", () => {
    expect(
      layerToggleLabel(
        "Numbering",
        { count: 29, percent: 10 },
        { count: 4, percent: 50 },
        "en-US",
      ),
    ).toBe("Numbering: 29 (10%), selected: 4 (50%)");
  });

  it("prints None for an empty selection", () => {
    expect(
      layerToggleLabel(
        "Numbering",
        { count: 29, percent: 10 },
        { count: 0, percent: 0 },
        "en-US",
      ),
    ).toBe("Numbering: 29 (10%), selected: None (0%)");
  });

  it("omits the selection when the comparison count is zero", () => {
    expect(
      layerToggleLabel(
        "Numbering",
        { count: 0, percent: 0 },
        { count: 4, percent: 50 },
        "en-US",
      ),
    ).toBe("Numbering: None (0%)");
  });

  it("groups thousands in the comparison and selection counts", () => {
    expect(
      layerToggleLabel(
        "Numbering",
        { count: 1234, percent: 10 },
        { count: 1000, percent: 50 },
        "en-US",
      ),
    ).toBe("Numbering: 1,234 (10%), selected: 1,000 (50%)");
  });
});
