import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedSpan } from "../../api/types";
import { findAnchor, OverlayController } from "./OverlayController";

/** Build a minimal two-column workspace for controller unit tests. */
function mountWorkspace(): {
  workspace: HTMLElement;
  svg: SVGSVGElement;
  leftRoot: HTMLElement;
  rightRoot: HTMLElement;
} {
  const workspace = document.createElement("div");
  const leftRoot = document.createElement("div");
  const rightRoot = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  workspace.append(leftRoot, rightRoot, svg);
  document.body.append(workspace);
  return { workspace, svg, leftRoot, rightRoot };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OverlayController", () => {
  it("TC-OVERLAY-007: coalesces redraws via rAF and cleans listeners on dispose", () => {
    const frames: FrameRequestCallback[] = [];
    const cancelSpy = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", cancelSpy);

    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect = disconnect;
      },
    );

    const { workspace, svg, leftRoot, rightRoot } = mountWorkspace();
    const removeLeft = vi.spyOn(leftRoot, "removeEventListener");
    const removeRight = vi.spyOn(rightRoot, "removeEventListener");
    const controller = new OverlayController(workspace, svg, leftRoot, rightRoot);

    controller.scheduleRedraw();
    controller.scheduleRedraw();
    leftRoot.dispatchEvent(new Event("scroll"));
    rightRoot.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(1);

    controller.dispose();
    expect(cancelSpy).toHaveBeenCalledWith(1);
    expect(disconnect).toHaveBeenCalled();
    expect(removeLeft).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeRight).toHaveBeenCalledWith("scroll", expect.any(Function));

    const before = frames.length;
    leftRoot.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(before);
  });
});

describe("findAnchor", () => {
  it("TC-OVERLAY-010: falls back to data-ref + data-part when seq is missing", () => {
    const root = document.createElement("div");
    const el = document.createElement("span");
    el.dataset.ref = "GEN 1:1";
    el.dataset.part = "a";
    root.append(el);
    document.body.append(root);

    const span: ResolvedSpan = {
      ref: "GEN 1:1",
      book: "GEN",
      chapter: 1,
      verse: 1,
      seq: null,
      part: "a",
    };
    expect(findAnchor(root, span)).toBe(el);

    // Prefers seq when present, but still falls back if the seq node is absent.
    const withSeq: ResolvedSpan = { ...span, seq: 99 };
    expect(findAnchor(root, withSeq)).toBe(el);
  });

  it("falls back to whole-verse node when part-bearing DOM is absent", () => {
    const root = document.createElement("div");
    const el = document.createElement("span");
    el.dataset.ref = "GEN 1:1";
    el.dataset.part = "";
    root.append(el);
    document.body.append(root);

    const span: ResolvedSpan = {
      ref: "GEN 1:1",
      book: "GEN",
      chapter: 1,
      verse: 1,
      seq: null,
      part: "a",
    };
    expect(findAnchor(root, span)).toBe(el);
  });
});
