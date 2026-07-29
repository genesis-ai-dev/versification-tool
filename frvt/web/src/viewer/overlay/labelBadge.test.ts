import { describe, expect, it } from "vitest";
import { LABEL_BADGE_MAX_WIDTH, layoutLabelBadge } from "./labelBadge";
import { paintPlan } from "./paintPlan";
import type { DrawPlan } from "./drawPlan";

describe("layoutLabelBadge", () => {
  it("fits short labels on one line within the max width", () => {
    const layout = layoutLabelBadge("shift");
    expect(layout.width).toBeLessThanOrEqual(LABEL_BADGE_MAX_WIDTH);
    expect(layout.height).toBeGreaterThanOrEqual(16);
  });

  it("wraps long labels by growing height", () => {
    const short = layoutLabelBadge("range / split");
    const long = layoutLabelBadge("range / split / renumber / merge");
    expect(long.width).toBe(LABEL_BADGE_MAX_WIDTH);
    expect(long.height).toBeGreaterThan(short.height);
  });
});

describe("paintPlan", () => {
  it("paints connector and hub labels as outlined badges", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const plan: DrawPlan = {
      outlines: [],
      connectors: [
        {
          from: { x: 0, y: 10 },
          to: { x: 100, y: 10 },
          color: "var(--rel-shift)",
          strokeWidth: 2,
          label: "shift",
          toVoid: false,
        },
      ],
      hub: { x: 50, y: 10, text: "range / split", color: "var(--rel-range)" },
    };
    paintPlan(svg, plan);
    expect(svg.querySelectorAll(".overlay-label-badge-bg")).toHaveLength(2);
    expect(svg.querySelectorAll(".overlay-label-badge-text")).toHaveLength(2);
    expect(svg.querySelector(".overlay-label-badge-text-emphasis")?.textContent).toBe(
      "range / split",
    );
    expect(svg.querySelector(".overlay-connector-labels")).not.toBeNull();
  });
});
