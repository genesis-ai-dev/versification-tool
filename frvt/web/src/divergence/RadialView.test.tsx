import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RadialView } from "./RadialView";
import { BOOK_MOVE } from "./model/colors";
import { buildIndex } from "./model/index";
import type { DivergenceReport, EventRow } from "./types";

const moved: EventRow = [0, ["GEN", 1, 1, 1, 1], null, ["EXO", 1, 1, 1, 1], 1, "", []];

const report: DivergenceReport = {
  types: [{ id: "CROSS_BOOK", severity: 4, layer: "scheme" }],
  comparisons: [
    {
      id: "a-b",
      a: "A",
      b: "B",
      mode: "schemes",
      note: "",
      books: [
        { code: "GEN", name: "Genesis", section: "OT", a: [31], b: [31] },
        { code: "EXO", name: "Exodus", section: "OT", a: [22], b: [22] },
      ],
      events: [moved],
      runs: [],
      warnings: { a: [], b: [], aCount: 0, bCount: 0 },
    },
  ],
  eventNotes: [],
  org: {},
  catalog: [
    ["GEN", "Genesis", "OT"],
    ["EXO", "Exodus", "OT"],
  ],
  sides: [],
  engineVersion: "1",
  computedAt: "",
};

describe("RadialView", () => {
  it("draws a cross-book move as a blue arrow", () => {
    const { container } = render(
      <RadialView
        index={buildIndex(report)}
        layersOn={new Set(["scheme"])}
        layout="slices"
        onSelect={() => undefined}
      />,
    );
    const path = container.querySelector("path[marker-end]");
    const id = path?.getAttribute("marker-end")?.match(/#([^)]+)/)?.[1] ?? "";
    const marker = container.querySelector(`marker#${CSS.escape(id)} path`);
    expect(marker).toHaveAttribute("fill", BOOK_MOVE);
  });

  it("selects the single event a ribbon stands for", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <RadialView
        index={buildIndex(report)}
        layersOn={new Set(["scheme"])}
        layout="slices"
        onSelect={onSelect}
      />,
    );
    const path = container.querySelector("path[marker-end]");
    expect(path).not.toBeNull();
    fireEvent.click(path!);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ eventIndex: 0 }));
  });
});
