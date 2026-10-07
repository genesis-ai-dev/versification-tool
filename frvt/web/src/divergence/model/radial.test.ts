import { describe, expect, it } from "vitest";
import { BOOK_MOVE, severityColor } from "./colors";
import { bookLabelTransform, ribbonCurve, ribbonStyle } from "./radial";

describe("ribbonStyle", () => {
  it("gives a cross-book move its own color and an arrow", () => {
    expect(ribbonStyle("CROSS_BOOK", 4)).toEqual({ color: BOOK_MOVE, arrow: true });
  });

  it("gives a chapter move the severity color and an arrow", () => {
    expect(ribbonStyle("CHAPTER_MOVE", 4)).toEqual({
      color: severityColor(4),
      arrow: true,
    });
  });

  it("gives an order inversion the severity color and no arrow", () => {
    expect(ribbonStyle("ORDER_INVERSION", 4)).toEqual({
      color: severityColor(4),
      arrow: false,
    });
  });
});

describe("ribbonCurve", () => {
  it("stops an arrow 7px short of the destination", () => {
    const end: readonly [number, number] = [100, 0];
    const path = ribbonCurve([0, 0], end, true);
    expect(path).not.toBeNull();
    const match = /Q[\d.-]+,[\d.-]+ ([\d.-]+),([\d.-]+)$/.exec(path ?? "");
    expect(match).not.toBeNull();
    const drawn: readonly [number, number] = [Number(match?.[1]), Number(match?.[2])];
    expect(Math.hypot(end[0] - drawn[0], end[1] - drawn[1])).toBeCloseTo(7);
  });

  it("returns null when both ends are the same point", () => {
    expect(ribbonCurve([3, 4], [3, 4], true)).toBeNull();
  });
});

describe("bookLabelTransform", () => {
  it("flips a label on the left half and leaves the right half upright", () => {
    expect(bookLabelTransform((3 * Math.PI) / 2, 100).anchor).toBe("end");
    expect(bookLabelTransform((3 * Math.PI) / 2, 100).transform).toContain("rotate(180)");
    expect(bookLabelTransform(Math.PI / 2, 100).anchor).toBe("start");
    expect(bookLabelTransform(Math.PI / 2, 100).transform).not.toContain("rotate(180)");
  });
});
