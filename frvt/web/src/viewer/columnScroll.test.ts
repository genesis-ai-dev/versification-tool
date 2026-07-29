import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { scrollColumnToSeq, seqForBcv } from "./columnScroll";

describe("seqForBcv", () => {
  const spans = [
    { book: "GEN", chapter: 1, verse: 1, part: null, seq: 0 },
    { book: "GEN", chapter: 1, verse: 2, part: null, seq: 1 },
    { book: "GEN", chapter: 1, verse: 3, part: "a", seq: 2 },
  ];

  it("returns seq for an exact BCV match", () => {
    expect(seqForBcv(spans, { book: "GEN", chapter: 1, verse: 2, part: null })).toBe(1);
  });

  it("matches part including null vs empty", () => {
    expect(seqForBcv(spans, { book: "GEN", chapter: 1, verse: 3, part: "a" })).toBe(2);
    expect(seqForBcv(spans, { book: "GEN", chapter: 1, verse: 1, part: "" })).toBe(0);
  });

  it("returns null when BCV is missing or unmatched", () => {
    expect(seqForBcv(spans, null)).toBeNull();
    expect(
      seqForBcv(spans, { book: "EXO", chapter: 1, verse: 1, part: null }),
    ).toBeNull();
  });
});

describe("scrollColumnToSeq", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scrolls the matching seq element and holds scroll-lock briefly", () => {
    const target = document.createElement("div");
    target.dataset.seq = "5";
    target.scrollIntoView = vi.fn();
    const root = document.createElement("div");
    root.appendChild(target);
    const lock = { current: false };

    expect(scrollColumnToSeq(root, 5, lock)).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth",
    });
    expect(lock.current).toBe(true);
    vi.advanceTimersByTime(400);
    expect(lock.current).toBe(false);
  });

  it("leaves the lock alone when the target is already visible", () => {
    const target = document.createElement("div");
    target.dataset.seq = "5";
    target.scrollIntoView = vi.fn();
    target.getBoundingClientRect = () => ({ top: 20, bottom: 60, height: 40 }) as DOMRect;
    const root = document.createElement("div");
    root.appendChild(target);
    root.getBoundingClientRect = () => ({ top: 0, bottom: 500, height: 500 }) as DOMRect;
    const lock = { current: false };

    expect(scrollColumnToSeq(root, 5, lock)).toBe(true);
    expect(target.scrollIntoView).not.toHaveBeenCalled();
    expect(lock.current).toBe(false);
  });

  it("scrolls when the target sits outside the scrollport", () => {
    const target = document.createElement("div");
    target.dataset.seq = "9";
    target.scrollIntoView = vi.fn();
    target.getBoundingClientRect = () =>
      ({ top: 800, bottom: 840, height: 40 }) as DOMRect;
    const root = document.createElement("div");
    root.appendChild(target);
    root.getBoundingClientRect = () => ({ top: 0, bottom: 500, height: 500 }) as DOMRect;
    const lock = { current: false };

    expect(scrollColumnToSeq(root, 9, lock)).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(lock.current).toBe(true);
  });

  it("returns false when root or seq element is missing", () => {
    const lock = { current: false };
    expect(scrollColumnToSeq(null, 1, lock)).toBe(false);
    expect(scrollColumnToSeq(document.createElement("div"), 1, lock)).toBe(false);
    expect(lock.current).toBe(false);
  });
});
