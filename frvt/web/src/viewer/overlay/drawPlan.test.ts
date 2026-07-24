import { describe, expect, it } from "vitest";
import type { ResolveResult } from "../../api/types";
import {
  anchorKey,
  buildDrawPlan,
  expectedConnectorCount,
  type AnchorMaps,
  type Rect,
} from "./drawPlan";
import { visualForRelation } from "./visualLanguage";

function rect(x: number, y: number): Rect {
  return { x, y, width: 100, height: 20 };
}

function anchors(
  driveSide: "left" | "right",
  driveSeqs: number[],
  followerSeqs: number[],
): AnchorMaps {
  const drive = new Map<string, Rect>();
  const follower = new Map<string, Rect>();
  driveSeqs.forEach((seq, i) =>
    drive.set(`seq:${seq}`, rect(driveSide === "left" ? 0 : 400, 40 * i)),
  );
  followerSeqs.forEach((seq, i) =>
    follower.set(`seq:${seq}`, rect(driveSide === "left" ? 400 : 0, 40 * i)),
  );
  return { drive, follower, driveSide, gutterX: 300 };
}

function span(seq: number, ref = "GEN 1:1", part: string | null = null) {
  return {
    ref,
    book: "GEN",
    chapter: 1,
    verse: 1,
    seq,
    part,
  };
}

describe("visualLanguage", () => {
  it("covers each relation topology", () => {
    expect(visualForRelation("one_to_one").topology).toBe("direct");
    expect(visualForRelation("split").topology).toBe("branch");
    expect(visualForRelation("merge").topology).toBe("converge");
    expect(visualForRelation("exclude").topology).toBe("to_void");
    expect(visualForRelation("complex").topology).toBe("graph");
    expect(visualForRelation("partial").dashArray).toBeTruthy();
  });
});

describe("buildDrawPlan", () => {
  it("returns an empty scene when map toggle is off", () => {
    const result: ResolveResult = {
      relation: "one_to_one",
      source_spans: [span(1)],
      target_spans: [span(2)],
      edges: [],
    };
    const plan = buildDrawPlan(result, anchors("left", [1], [2]), false);
    expect(plan.outlines).toHaveLength(0);
    expect(plan.connectors).toHaveLength(0);
  });

  it("draws a direct connector for one_to_one", () => {
    const result: ResolveResult = {
      relation: "one_to_one",
      source_spans: [span(1)],
      target_spans: [span(2)],
      edges: [],
    };
    const plan = buildDrawPlan(result, anchors("left", [1], [2]), true);
    expect(plan.connectors).toHaveLength(1);
    expect(plan.outlines).toHaveLength(2);
    // Drive left exits mid-right; follower right enters mid-left → left→right.
    expect(plan.connectors[0].from.x).toBeLessThan(plan.connectors[0].to.x);
  });

  it("branches for split and converges for merge", () => {
    const split: ResolveResult = {
      relation: "split",
      source_spans: [span(1)],
      target_spans: [span(2), span(3)],
      edges: [],
    };
    const splitPlan = buildDrawPlan(split, anchors("left", [1], [2, 3]), true);
    expect(splitPlan.connectors).toHaveLength(2);
    expect(expectedConnectorCount(split)).toBe(2);

    const merge: ResolveResult = {
      relation: "merge",
      source_spans: [span(1), span(2)],
      target_spans: [span(3)],
      edges: [],
    };
    const mergePlan = buildDrawPlan(merge, anchors("left", [1, 2], [3]), true);
    expect(mergePlan.connectors).toHaveLength(2);
    expect(mergePlan.outlines.some((o) => o.emphasis === "strong")).toBe(true);
  });

  it("draws exclude as connector-to-void with zero target outlines", () => {
    const result: ResolveResult = {
      relation: "exclude",
      source_spans: [span(1)],
      target_spans: [],
      edges: [],
    };
    const plan = buildDrawPlan(result, anchors("left", [1], []), true);
    expect(plan.outlines).toHaveLength(1);
    expect(plan.connectors).toHaveLength(1);
    expect(plan.connectors[0].toVoid).toBe(true);
    expect(plan.connectors[0].label).toBe("absent");
    expect(plan.connectors[0].to.x).toBe(300);
  });

  it("outlines only the part-bearing node for partial", () => {
    const result: ResolveResult = {
      relation: "partial",
      source_spans: [span(1, "SIR 36:13", "a")],
      target_spans: [span(2, "SIR 36:13", "a")],
      edges: [],
    };
    const plan = buildDrawPlan(result, anchors("left", [1], [2]), true);
    expect(plan.connectors[0].label).toBe("part a");
    expect(plan.connectors[0].dashArray).toBeTruthy();
  });

  it("draws one connector per complex edge with per-edge coloring", () => {
    const result: ResolveResult = {
      relation: "complex",
      source_spans: [span(1), span(2)],
      target_spans: [span(3), span(4)],
      edges: [
        { source_index: 0, target_index: 0, relation: "shift" },
        { source_index: 1, target_index: 1, relation: "renumber" },
      ],
    };
    const plan = buildDrawPlan(result, anchors("left", [1, 2], [3, 4]), true);
    expect(plan.connectors).toHaveLength(2);
    expect(plan.outlines).toHaveLength(4);
    expect(plan.connectors[0].color).toBe(visualForRelation("shift").color);
    expect(plan.connectors[1].color).toBe(visualForRelation("renumber").color);
    expect(plan.connectors[0].label).toContain("complex");
    expect(plan.connectors[0].label).toContain("shift");
  });

  it("reverses edge attachment when drive is right", () => {
    const result: ResolveResult = {
      relation: "one_to_one",
      source_spans: [span(10)],
      target_spans: [span(20)],
      edges: [],
    };
    const plan = buildDrawPlan(result, anchors("right", [10], [20]), true);
    expect(plan.connectors).toHaveLength(1);
    // Drive on right exits mid-left; follower on left enters mid-right → right→left.
    expect(plan.connectors[0].from.x).toBeGreaterThan(plan.connectors[0].to.x);
  });

  it("TC-OVERLAY-010: prefers seq keys and falls back to ref+part", () => {
    expect(anchorKey(span(42))).toBe("seq:42");
    expect(anchorKey({ ...span(1), seq: null })).toBe("ref:GEN 1:1|");
  });
});
