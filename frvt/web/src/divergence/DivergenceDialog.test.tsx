import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DivergenceDialog } from "./DivergenceDialog";
import type { DivergenceReport, EventRow } from "./types";

const approximate: EventRow = [
  0,
  ["GEN", 1, 1, 1, 2],
  ["GEN", 1, 1, 1, 2],
  ["GEN", 1, 1, 1, 2],
  2,
  "renumber",
  ["approximate"],
];

const report: DivergenceReport = {
  types: [{ id: "RENUMBER", severity: 2, layer: "scheme" }],
  comparisons: [
    {
      id: "a-b",
      a: "A",
      b: "B",
      mode: "schemes",
      note: "",
      books: [{ code: "GEN", name: "Genesis", section: "OT", a: [31, 25], b: [31, 25] }],
      events: [approximate],
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

describe("DivergenceDialog", () => {
  it("keeps the column on the comparison until a chapter is clicked", async () => {
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
    const chapter = container.querySelector(".dv-matrix rect[fill='transparent']");
    if (chapter === null) {
      throw new Error("chapter target missing");
    }
    fireEvent.mouseEnter(chapter);
    expect(
      screen.getByRole("heading", { level: 2, name: /^All Deviances/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Click a chapter, book, or event/)).not.toBeInTheDocument();
    fireEvent.click(chapter);
    expect(
      screen.getByRole("heading", { level: 2, name: "Genesis 1" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".dv-donut")).not.toBeNull();
    expect(screen.queryByText("No deviances in this chapter.")).not.toBeInTheDocument();
  });

  it("hides the donut for a chapter with no deviances", async () => {
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
        container.querySelectorAll(".dv-matrix rect[fill='transparent']").length,
      ).toBeGreaterThan(1);
    });
    const chapter = container.querySelectorAll(".dv-matrix rect[fill='transparent']")[1];
    if (chapter === undefined) {
      throw new Error("empty chapter target missing");
    }
    fireEvent.click(chapter);
    expect(
      screen.getByRole("heading", { level: 2, name: "Genesis 2" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No deviances in this chapter.")).toBeInTheDocument();
    expect(screen.queryByText("No differences in this chapter.")).not.toBeInTheDocument();
    expect(screen.queryByText("No slices in this chart.")).not.toBeInTheDocument();
    expect(container.querySelector(".dv-donut")).toBeNull();
  });
});
