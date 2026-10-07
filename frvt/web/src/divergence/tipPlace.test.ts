import { describe, expect, it } from "vitest";
import { placeTip } from "./tipPlace";

const viewport = { width: 800, height: 600 };

describe("placeTip", () => {
  it("leaves a tip that fits under its trigger", () => {
    expect(
      placeTip(new DOMRect(40, 20, 16, 16), new DOMRect(0, 0, 200, 40), viewport),
    ).toEqual({
      left: 40,
      top: 40,
    });
  });

  it("shifts a tip left only far enough to stay on screen", () => {
    const placed = placeTip(
      new DOMRect(700, 20, 16, 16),
      new DOMRect(0, 0, 200, 40),
      viewport,
    );
    expect(placed.top).toBe(40);
    expect(placed.left + 200).toBe(viewport.width - 8);
    expect(placed.left).toBeGreaterThan(40);
  });

  it("opens above the trigger when there is no room below", () => {
    const placed = placeTip(
      new DOMRect(40, 540, 16, 16),
      new DOMRect(0, 0, 200, 80),
      viewport,
    );
    expect(placed.left).toBe(40);
    expect(placed.top).toBeLessThan(540);
  });
});
