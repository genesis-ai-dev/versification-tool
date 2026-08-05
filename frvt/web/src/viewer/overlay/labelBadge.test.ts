import { describe, expect, it } from "vitest";
import { LABEL_BADGE_MAX_WIDTH, appendLabelBadge, syncAllLabelBadges } from "./labelBadge";
import { paintPlan } from "./paintPlan";
import type { DrawPlan } from "./drawPlan";

describe("labelBadge", () => {
  it("creates a centered foreignObject badge with CSS outline classes", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(group);
    const ns = "http://www.w3.org/2000/svg";
    appendLabelBadge(group, ns, {
      centerX: 50,
      centerY: 20,
      text: "range / split / renumber / merge",
      color: "var(--rel-range)",
    });
    syncAllLabelBadges(svg);
    const badge = group.querySelector(".overlay-label-badge");
    const foreign = group.querySelector(".overlay-label-badge-foreign");
    const text = group.querySelector(".overlay-label-badge-text");
    expect(badge?.getAttribute("transform")).toBe("translate(50 20)");
    expect(foreign).not.toBeNull();
    expect(text).not.toBeNull();
    expect(text?.className).toContain("overlay-label-badge-text");
    expect(Number(foreign?.getAttribute("width"))).toBeGreaterThan(0);
    expect(Number(foreign?.getAttribute("width"))).toBeLessThanOrEqual(LABEL_BADGE_MAX_WIDTH);
    expect(Number(foreign?.getAttribute("height"))).toBeGreaterThan(0);
    document.body.removeChild(svg);
  });

  it("applies emphasis styling for hub badges", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(group);
    appendLabelBadge(group, "http://www.w3.org/2000/svg", {
      centerX: 0,
      centerY: 0,
      text: "complex",
      color: "var(--rel-complex)",
      emphasis: true,
    });
    expect(group.querySelector(".overlay-label-badge-text-emphasis")).not.toBeNull();
    document.body.removeChild(svg);
  });
});

describe("paintPlan", () => {
  it("paints connector and hub labels as outlined badges", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);
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
    expect(svg.querySelectorAll(".overlay-label-badge-text")).toHaveLength(2);
    expect(svg.querySelector(".overlay-label-badge-text-emphasis")?.textContent).toBe(
      "range / split",
    );
    expect(svg.querySelector(".overlay-connector-labels")).not.toBeNull();
    document.body.removeChild(svg);
  });
});
