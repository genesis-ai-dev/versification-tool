import { schemeSet3 } from "d3";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Donut, LAYER_COLORS, sliceColor } from "./Donut";
import type { Slice } from "./breakdown";

const numbering: Slice = {
  key: "layer-scheme",
  label: "Numbering",
  value: 1000,
  percent: 10,
};

/** The sentence the numbering slice shows after the wait. */
const numberingTip = "Numbering: 1,000 (10% of this comparison)";

function renderDonut() {
  render(
    <Donut layers={[numbering]} types={[]} scope="this comparison" locale="en-US" />,
  );
  return screen.getByRole("img", { name: numberingTip });
}

describe("Donut slice tip", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the slice tip only after the short delay", () => {
    vi.useFakeTimers();
    const slice = renderDonut();
    expect(
      screen
        .getByRole("group", { name: "Share of the visible differences" })
        .querySelector("title"),
    ).toBeNull();
    fireEvent.pointerEnter(slice, { clientX: 8, clientY: 16 });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent(numberingTip);
  });

  it("skips the tip when the pointer leaves first", () => {
    vi.useFakeTimers();
    const slice = renderDonut();
    fireEvent.pointerEnter(slice, { clientX: 8, clientY: 16 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.pointerLeave(slice);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("paints a type with its catalog color and drops a stale tip", () => {
    vi.useFakeTimers();
    const moved: Slice = { key: "type-3", label: "Merge", value: 1, percent: 100 };
    const { rerender } = render(
      <Donut layers={[numbering]} types={[]} scope="this comparison" locale="en-US" />,
    );
    const slice = screen.getByRole("img", { name: numberingTip });
    expect(slice).toHaveAttribute("fill", sliceColor(numbering.key, LAYER_COLORS));
    fireEvent.pointerEnter(slice, { clientX: 8, clientY: 16 });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    rerender(
      <Donut layers={[]} types={[moved]} scope="this comparison" locale="en-US" />,
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Merge/ })).toHaveAttribute(
      "fill",
      sliceColor(moved.key, schemeSet3),
    );
  });
});
