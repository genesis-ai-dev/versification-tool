import { describe, expect, it } from "vitest";
import { ApiError } from "./api/errors";
import type { RelationType, ResolvedSpan, ResolveResult } from "./api/types";
import { toResolveArgs } from "./lib/bcv";
import { formatBcvLabel, formatVerseLabel } from "./lib/formatRef";
import { navigationToBcv } from "./viewer/jumpNavigation";
import {
  anchorKey,
  buildDrawPlan,
  expectedConnectorCount,
  type AnchorMaps,
  type Rect,
} from "./viewer/overlay/drawPlan";
import { visualForRelation } from "./viewer/overlay/visualLanguage";

const source = span("PSA 3:0", "PSA", 3, 0, 10);
const target = span("PSA 3:1", "PSA", 3, 1, 20);
const targetTwo = span("PSA 3:2", "PSA", 3, 2, 21);
const sourceTwo = span("PSA 3:1", "PSA", 3, 1, 11);

describe("reference display and request construction", () => {
  it("keeps verse zero machine data while displaying its title label", () => {
    expect(formatVerseLabel(0)).toBe("Title (0)");
    expect(formatBcvLabel("PSA", 3, 0)).toBe("PSA 3:Title (0)");
    expect(toResolveArgs("PSA", 3, 0, null)).toEqual({
      ref: "PSA 3:0",
      part: null,
    });
  });

  it("sends a sub-verse part separately from the reference", () => {
    expect(toResolveArgs("SIR", 36, 13, "a")).toEqual({
      ref: "SIR 36:13",
      part: "a",
    });
  });
});

describe("structured jump navigation", () => {
  it("copies structured coordinates without parsing the display range", () => {
    const navigation = { book: "PSA", chapter: 3, verse: 0, part: null };
    expect(navigationToBcv(navigation)).toEqual(navigation);
  });
});

describe("API error envelopes", () => {
  it("maps an invalid-request envelope", async () => {
    const error = await ApiError.fromResponse(
      response(400, {
        detail: "Bad reference",
        code: "bad_request",
        errors: [{ field: "ref", message: "Malformed" }],
      }),
    );
    expect(error).toMatchObject({
      status: 400,
      code: "bad_request",
      detail: "Bad reference",
      errors: [{ field: "ref", message: "Malformed" }],
    });
  });

  it("maps an internal-error envelope", async () => {
    const error = await ApiError.fromResponse(
      response(500, { detail: "Resolver failed", code: "internal_error" }),
    );
    expect(error).toMatchObject({
      status: 500,
      code: "internal_error",
      detail: "Resolver failed",
    });
  });
});

describe("relation visual language", () => {
  it.each<[RelationType, string]>([
    ["one_to_one", "direct"],
    ["shift", "direct"],
    ["renumber", "direct"],
    ["split", "branch"],
    ["merge", "converge"],
    ["partial", "direct"],
    ["exclude", "to_void"],
    ["complex", "graph"],
  ])("assigns %s its connector topology", (relation, topology) => {
    expect(visualForRelation(relation).topology).toBe(topology);
  });
});

describe("overlay draw plans", () => {
  it("draws direct relations between both outlined spans", () => {
    const plan = buildDrawPlan(result("shift", [source], [target]), anchors(), true);
    expect(plan.outlines).toHaveLength(2);
    expect(plan.connectors).toHaveLength(1);
    expect(plan.connectors[0].label).toBe("shift");
  });

  it("branches a split from one source to every target", () => {
    const value = result("split", [source], [target, targetTwo]);
    const plan = buildDrawPlan(value, anchors(), true);
    expect(plan.outlines).toHaveLength(3);
    expect(plan.connectors).toHaveLength(2);
    expect(expectedConnectorCount(value)).toBe(2);
  });

  it("converges a merge from every source into one target", () => {
    const value = result("merge", [source, sourceTwo], [target]);
    const plan = buildDrawPlan(value, anchors(), true);
    expect(plan.outlines).toHaveLength(3);
    expect(plan.connectors).toHaveLength(2);
  });

  it("draws exclusions to void without target outlines", () => {
    const plan = buildDrawPlan(result("exclude", [source], []), anchors(), true);
    expect(plan.outlines).toHaveLength(1);
    expect(plan.connectors).toHaveLength(1);
    expect(plan.connectors[0]).toMatchObject({
      toVoid: true,
      label: "absent",
    });
  });

  it("uses a dashed part-only direct treatment for partials", () => {
    const partSource = { ...source, part: "a" };
    const partTarget = { ...target, part: "a" };
    const plan = buildDrawPlan(
      result("partial", [partSource], [partTarget]),
      anchors(partSource, partTarget),
      true,
    );
    expect(plan.outlines).toHaveLength(2);
    expect(plan.outlines.every((outline) => outline.dashArray === "6 4")).toBe(true);
    expect(plan.connectors[0].label).toBe("part a");
  });

  it("draws one independently colored connector per complex edge", () => {
    const value: ResolveResult = {
      ...result("complex", [source, sourceTwo], [target, targetTwo]),
      edges: [
        { source_index: 0, target_index: 0, relation: "shift" },
        { source_index: 1, target_index: 1, relation: "partial" },
      ],
    };
    const plan = buildDrawPlan(value, anchors(), true);
    expect(plan.outlines).toHaveLength(4);
    expect(plan.connectors).toHaveLength(2);
    expect(plan.connectors.map((connector) => connector.color)).toEqual([
      "var(--rel-shift)",
      "var(--rel-partial)",
    ]);
  });

  it("reverses physical connector direction when the right column drives", () => {
    const plan = buildDrawPlan(
      result("one_to_one", [source], [target]),
      anchors(source, target, "right"),
      true,
    );
    expect(plan.connectors[0].from.x).toBeGreaterThan(plan.connectors[0].to.x);
  });

  it("returns an empty scene when mapping is disabled", () => {
    expect(
      buildDrawPlan(result("one_to_one", [source], [target]), anchors(), false),
    ).toEqual({ outlines: [], connectors: [] });
  });
});

/** Build a denormalized span fixture with server-style structured coordinates. */
function span(
  ref: string,
  book: string,
  chapter: number,
  verse: number,
  seq: number,
): ResolvedSpan {
  return { ref, book, chapter, verse, seq, part: null };
}

/** Build a resolve result fixture for one topology. */
function result(
  relation: RelationType,
  sourceSpans: ResolvedSpan[],
  targetSpans: ResolvedSpan[],
): ResolveResult {
  return {
    relation,
    source_spans: sourceSpans,
    target_spans: targetSpans,
    edges: [],
  };
}

/** Build measured anchors for both physical drive directions. */
function anchors(
  sourceSpan = source,
  targetSpan = target,
  driveSide: "left" | "right" = "left",
): AnchorMaps {
  const driveRect: Rect =
    driveSide === "left"
      ? { x: 10, y: 10, width: 30, height: 20 }
      : { x: 200, y: 10, width: 30, height: 20 };
  const followerRect: Rect =
    driveSide === "left"
      ? { x: 200, y: 10, width: 30, height: 20 }
      : { x: 10, y: 10, width: 30, height: 20 };
  return {
    driveSide,
    gutterX: 120,
    drive: new Map([
      [anchorKey(sourceSpan), driveRect],
      [anchorKey(sourceTwo), { ...driveRect, y: 45 }],
    ]),
    follower: new Map([
      [anchorKey(targetSpan), followerRect],
      [anchorKey(targetTwo), { ...followerRect, y: 45 }],
    ]),
  };
}

/** Build a JSON response for envelope parsing without mocking fetch wrappers. */
function response(status: number, body: object): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: "Request failed",
    headers: { "Content-Type": "application/json" },
  });
}
