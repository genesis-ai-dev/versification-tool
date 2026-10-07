import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { buildIndex } from "./model/index";
import { ScopeHeading, scopeHeading } from "./ScopeHeading";
import type { DivergenceReport } from "./types";

/** One indexed Genesis book, enough to name a selection. */
const index = buildIndex(indexReport());

describe("ScopeHeading", () => {
  it("centers the comparison title", () => {
    render(<ScopeHeading title="All Deviances (None)" centered />);
    const heading = screen.getByRole("heading", { name: "All Deviances (None)" });
    expect(heading.closest("header")).toHaveClass("is-centered");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens the subtitle from an info control beside the title", async () => {
    const user = userEvent.setup();
    const subtitle = "Chapter 3: A 27 verses; B 27 verses";
    render(<ScopeHeading title="2 Kings 3" subtitle={subtitle} centered={false} />);
    expect(screen.queryByText(subtitle)).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "2 Kings 3 details" });
    expect(screen.getByRole("heading").closest("header")).toContainElement(button);
    await user.click(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent(subtitle);
  });

  it("draws no info control for a blank subtitle", () => {
    render(<ScopeHeading title="Genesis" subtitle="   " centered={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

const sides = { a: "A", b: "B" };
const layers = new Set<string>(["scheme"]);

describe("scopeHeading", () => {
  it("centers a locale total when nothing is selected", () => {
    expect(scopeHeading(null, index, 1234, sides, layers, "en-US")).toEqual({
      title: "All Deviances (1,234)",
      subtitle: null,
      centered: true,
      bookCode: null,
    });
    expect(scopeHeading(null, index, 0, sides, layers, "en-US").title).toBe(
      "All Deviances (None)",
    );
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
        sides,
        layers,
        "en-US",
      ),
    ).toEqual({
      title: "Genesis 21:1–21:4",
      subtitle: "Chapter 21: A absent; B absent",
      centered: false,
      bookCode: "GEN",
    });
  });

  it("names a chapter with an ungrouped chapter number", () => {
    expect(
      scopeHeading(
        { bookCode: "GEN", chapter: 1000, summary: false },
        index,
        5,
        sides,
        layers,
        "en-US",
      ),
    ).toEqual({
      title: "Genesis 1000",
      subtitle: "Chapter 1000: A absent; B absent",
      centered: false,
      bookCode: "GEN",
    });
  });

  it("names the book for a summary cell and for a cell with no chapter", () => {
    const whole = {
      title: "Genesis",
      subtitle: "Whole book: 1 chapters in A, 1 in B",
      centered: false,
      bookCode: "GEN",
    };
    expect(
      scopeHeading(
        { bookCode: "GEN", chapter: 5, summary: true },
        index,
        5,
        sides,
        layers,
        "en-US",
      ),
    ).toEqual(whole);
    expect(
      scopeHeading(
        { bookCode: "GEN", chapter: null, summary: false },
        index,
        5,
        sides,
        layers,
        "en-US",
      ),
    ).toEqual(whole);
  });

  it("says a missing chapter side is absent and keeps one verse singular", () => {
    const oneVerse = buildIndex({
      ...indexReport(),
      comparisons: [
        {
          ...indexReport().comparisons[0]!,
          books: [{ code: "GEN", name: "Genesis", section: "OT", a: [1], b: null }],
        },
      ],
    });
    expect(
      scopeHeading(
        { bookCode: "GEN", chapter: 1, summary: false },
        oneVerse,
        1,
        sides,
        layers,
      ),
    ).toMatchObject({ subtitle: "Chapter 1: A 1 verse; B absent" });
  });

  it("formats a large chapter total and keeps an empty side as no", () => {
    const long = buildIndex({
      ...indexReport(),
      comparisons: [
        {
          ...indexReport().comparisons[0]!,
          books: [
            {
              code: "GEN",
              name: "Genesis",
              section: "OT",
              a: Array.from({ length: 1000 }, () => 1),
              b: null,
            },
          ],
        },
      ],
    });
    expect(
      scopeHeading(
        { bookCode: "GEN", chapter: null, summary: true },
        long,
        1,
        sides,
        layers,
        "en-US",
      ),
    ).toMatchObject({ subtitle: "Whole book: 1,000 chapters in A, no in B" });
  });

  it("names a selected event by its catalog label", () => {
    const moved: DivergenceReport = {
      ...indexReport(),
      types: [{ id: "CHAPTER_MOVE", severity: 4, layer: "scheme" }],
      comparisons: [
        {
          ...indexReport().comparisons[0]!,
          events: [
            [
              0,
              ["GEN", 1, 1, 1, 2],
              ["GEN", 1, 1, 1, 2],
              ["GEN", 1, 1, 1, 2],
              2,
              "1:1",
              [],
            ],
          ],
        },
      ],
    };
    expect(
      scopeHeading(
        {
          bookCode: "GEN",
          chapter: 1,
          summary: false,
          verseLabel: "Genesis 1:1–1:2",
          eventIndex: 0,
        },
        buildIndex(moved),
        1,
        sides,
        layers,
      ),
    ).toMatchObject({ title: "Chapter move", subtitle: "Genesis 1:1–1:2" });
  });

  it("centers the comparison title when the book is missing", () => {
    expect(
      scopeHeading(
        { bookCode: "ZZZ", chapter: 1, summary: false },
        index,
        0,
        sides,
        layers,
        "en-US",
      ),
    ).toEqual({
      title: "All Deviances (None)",
      subtitle: null,
      centered: true,
      bookCode: null,
    });
  });
});

/** The report behind ``index``, so a case can replace its books. */
function indexReport(): DivergenceReport {
  return {
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
  };
}
