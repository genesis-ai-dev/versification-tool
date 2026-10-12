import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DivergenceDialog } from "./DivergenceDialog";
import type { DivergenceReport, EventRow } from "./types";

const numbering: EventRow = [
  0,
  ["GEN", 1, 1, 1, 2],
  ["GEN", 1, 1, 1, 2],
  ["GEN", 1, 1, 1, 2],
  2,
  "renumber",
  [],
];

const bridge: EventRow = [
  1,
  ["GEN", 1, 1, 1, 1],
  ["GEN", 1, 1, 1, 1],
  ["GEN", 1, 1, 1, 1],
  1,
  "bridge",
  [],
];

const report: DivergenceReport = {
  types: [
    { id: "RENUMBER", severity: 2, layer: "scheme" },
    { id: "BRIDGE", severity: 1, layer: "text" },
  ],
  comparisons: [
    {
      id: "a-b",
      a: "A",
      b: "B",
      mode: "schemes",
      note: "",
      books: [{ code: "GEN", name: "Genesis", section: "OT", a: [31, 25], b: [31, 25] }],
      events: [numbering, bridge],
      runs: [],
      warnings: { a: [], b: [], aCount: 0, bCount: 0 },
    },
  ],
  eventNotes: [],
  org: {},
  catalog: [["GEN", "Genesis", "OT"]],
  sides: [],
  engineVersion: "1",
  computedAt: "",
};

vi.mock("./useDivergenceReport", () => ({
  useDivergenceReport: () => ({
    status: null,
    report,
    error: null,
    retry: () => undefined,
  }),
}));

describe("DivergenceDialog with two layers", () => {
  it("keeps the chart until every layer with events is off", async () => {
    const { container } = render(
      <DivergenceDialog
        fromTranslationId="from"
        toTranslationId="to"
        fromSchemeId={null}
        toSchemeId={null}
        onClose={() => undefined}
      />,
    );
    await waitFor(() => {
      expect(
        container.querySelector(".dv-matrix rect[fill='transparent']"),
      ).not.toBeNull();
    });
    expect(
      screen.getByRole("heading", { level: 2, name: "All Deviances (2)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No differences in this comparison."),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".dv-donut")).not.toBeNull();
    expect(
      screen.getByRole("checkbox", { name: /^Numbering: 1 \(50%\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /^Bridges & omissions: 1 \(50%\)/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /^Numbering/ }));
    expect(
      screen.getByRole("heading", { level: 2, name: "All Deviances (2)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No differences in this comparison."),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".dv-donut")).not.toBeNull();
    expect(screen.queryByText("No slices in this chart.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /^Bridges & omissions/ }));
    expect(
      screen.getByRole("heading", { level: 2, name: "All Deviances (2)" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("No differences in this comparison.")).toHaveLength(1);
    expect(container.querySelector(".dv-donut")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Open / })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear selection" }),
    ).not.toBeInTheDocument();

    const chapter = container.querySelector(".dv-matrix rect[fill='transparent']");
    if (chapter === null) {
      throw new Error("chapter target missing");
    }
    fireEvent.click(chapter);
    expect(
      screen.getByRole("heading", { level: 2, name: "Genesis 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No deviances in this chapter.")).toBeInTheDocument();
    expect(
      screen.queryByText("No differences in this comparison."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open GEN in book detail" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /^Numbering/ }));
    expect(
      screen.getByRole("heading", { level: 2, name: "Genesis 1" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No differences in this comparison."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("No deviances in this chapter.")).not.toBeInTheDocument();
    expect(container.querySelector(".dv-donut")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Open GEN in book detail" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeInTheDocument();
  });
});
