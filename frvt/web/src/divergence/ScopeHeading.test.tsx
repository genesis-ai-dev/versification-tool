import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildIndex } from "./model/index";
import { ScopeHeading, scopeHeading } from "./ScopeHeading";
import type { DivergenceReport } from "./types";

/** One indexed Genesis book, enough to name a selection. */
const index = buildIndex({
  types: [],
  comparisons: [
    {
      id: "a-b",
      a: "A",
      b: "B",
      mode: "schemes",
      note: "",
      books: [{ code: "GEN", name: "Genesis", section: "OT", a: [31], b: [31] }],
      events: [],
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
} satisfies DivergenceReport);

describe("ScopeHeading", () => {
  it("centers the comparison title and offers no actions", () => {
    render(
      <ScopeHeading
        title="All Deviances (None)"
        centered
        bookCode={null}
        onOpenBook={() => undefined}
        onClear={() => undefined}
      />,
    );
    const heading = screen.getByRole("heading", { name: "All Deviances (None)" });
    expect(heading.closest("header")).toHaveClass("is-centered");
    expect(screen.queryByRole("button", { name: "Details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("puts Details and then Clear on the selected chapter", async () => {
    const user = userEvent.setup();
    const onOpenBook = vi.fn();
    const onClear = vi.fn();
    render(
      <ScopeHeading
        title="Genesis 1"
        centered={false}
        bookCode="GEN"
        onOpenBook={onOpenBook}
        onClear={onClear}
      />,
    );
    expect(screen.getByRole("heading", { name: "Genesis 1" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Genesis 1" }).closest("header"),
    ).not.toHaveClass("is-centered");
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Details", "Clear"]);
    await user.click(screen.getByRole("button", { name: "Details" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onOpenBook).toHaveBeenCalledWith("GEN");
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("hides Details and keeps Clear while the Details tab is open", () => {
    render(
      <ScopeHeading
        title="Genesis 1"
        centered={false}
        bookCode="GEN"
        showDetails={false}
        onOpenBook={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: "Details" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });
});

describe("scopeHeading", () => {
  it("centers a locale total when nothing is selected", () => {
    expect(scopeHeading(null, index, 1234, "en-US")).toEqual({
      title: "All Deviances (1,234)",
      centered: true,
      bookCode: null,
    });
    expect(scopeHeading(null, index, 0, "en-US").title).toBe("All Deviances (None)");
  });

  it("uses a verse label when the pin carries one", () => {
    expect(
      scopeHeading(
        {
          bookCode: "GEN",
          chapter: 21,
          summary: false,
          verseLabel: "Genesis 21:1–21:4",
        },
        index,
        5,
        "en-US",
      ),
    ).toEqual({ title: "Genesis 21:1–21:4", centered: false, bookCode: "GEN" });
  });

  it("names a chapter with an ungrouped chapter number", () => {
    expect(
      scopeHeading({ bookCode: "GEN", chapter: 1000, summary: false }, index, 5, "en-US"),
    ).toEqual({ title: "Genesis 1000", centered: false, bookCode: "GEN" });
  });

  it("names the book for a summary cell and for a cell with no chapter", () => {
    expect(
      scopeHeading({ bookCode: "GEN", chapter: 5, summary: true }, index, 5, "en-US"),
    ).toEqual({ title: "Genesis", centered: false, bookCode: "GEN" });
    expect(
      scopeHeading({ bookCode: "GEN", chapter: null, summary: false }, index, 5, "en-US"),
    ).toEqual({ title: "Genesis", centered: false, bookCode: "GEN" });
  });

  it("centers the comparison title when the book is missing", () => {
    expect(
      scopeHeading({ bookCode: "ZZZ", chapter: 1, summary: false }, index, 0, "en-US"),
    ).toEqual({ title: "All Deviances (None)", centered: true, bookCode: null });
  });
});
