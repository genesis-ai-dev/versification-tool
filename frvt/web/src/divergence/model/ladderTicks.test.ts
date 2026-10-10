import { scaleLinear } from "d3-scale";
import { describe, expect, it } from "vitest";
import type { LadderAxis } from "./detail";
import { MIN_TICK_LABEL_GAP_PX, tickMarks } from "./ladderTicks";

/** Psalms-sized axis: 150 chapters of 10 verses, each followed by one gap slot. */
function psalmsAxis(): LadderAxis {
  return {
    books: ["PSA"],
    length: 1650,
    ticks: Array.from({ length: 150 }, (_, item) => ({
      x: 11 * item,
      label: item === 0 ? "PSA 1" : String(item + 1),
      major: item === 0,
    })),
    position: () => 0,
  };
}

describe("tickMarks", () => {
  it("keeps labels apart and labels the first chapter at full scale", () => {
    const toPx = scaleLinear().domain([0, 1650]).range([0, 600]);
    const marks = tickMarks(psalmsAxis(), [0, 1650], toPx, 600);
    const labeled = marks.filter((mark) => mark.label !== null);
    expect(marks).toHaveLength(150);
    expect(labeled[0]?.label).toBe("PSA 1");
    for (const [item, mark] of labeled.entries()) {
      const previous = labeled[item - 1];
      if (previous !== undefined) {
        expect(mark.x - previous.x).toBeGreaterThanOrEqual(MIN_TICK_LABEL_GAP_PX);
      }
    }
  });

  it("labels every visible chapter when zoomed in", () => {
    const toPx = scaleLinear().domain([0, 33]).range([0, 600]);
    const marks = tickMarks(psalmsAxis(), [0, 33], toPx, 600);
    expect(marks.map((mark) => mark.label)).toEqual(["PSA 1", "2", "3", "4"]);
  });
});
