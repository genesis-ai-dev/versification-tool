import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildIndex } from "./model/index";
import { Inspector } from "./Inspector";
import type { DivergenceReport, EventRow } from "./types";

/** One numbering event. ``verses`` is the count shown in parentheses. */
const event = (book: string, verses = 1): EventRow => [
  2,
  [book, 1, 1, 1, 1],
  null,
  [book, 1, 1, 1, 1],
  verses,
  "renumber",
  [],
];

/**
 * A one-book report.
 * A chapter length of zero is the side the inspector prints as "no".
 */
function reportFor(
  verses: number,
  chaptersA: number,
  chaptersB: number,
): DivergenceReport {
  return {
    types: [{ id: "RENUMBER", severity: 2, layer: "scheme" }],
    comparisons: [
      {
        id: "a-b",
        a: "A",
        b: "B",
        mode: "schemes",
        note: "",
        books: [
          {
            code: "GEN",
            name: "Genesis",
            section: "OT",
            a: Array.from({ length: chaptersA }, () => 1),
            b: Array.from({ length: chaptersB }, () => 1),
          },
        ],
        events: [event("GEN", verses)],
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

const index = buildIndex(reportFor(1, 1, 1));

describe("Inspector", () => {
  it("shows the hover hint and no actions when nothing is selected", () => {
    render(
      <Inspector
        index={index}
        selection={null}
        layersOn={new Set(["scheme"])}
        notes={[]}
        sideNames={{ a: "A", b: "B" }}
      />,
    );
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(
      screen.getByText("Hover or click a chapter. Arrow keys move through the matrix."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("lists the chapter events without a title or actions", () => {
    render(
      <Inspector
        index={index}
        selection={{ bookCode: "GEN", chapter: 1, summary: false }}
        layersOn={new Set(["scheme"])}
        notes={[]}
        sideNames={{ a: "A", b: "B" }}
        locale="en-US"
      />,
    );
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    expect(screen.getByText(/GEN 1:1 \/ GEN 1:1 \(1\)/)).toBeInTheDocument();
  });

  it("formats chapter totals and verse counts, and keeps an empty side as no", () => {
    render(
      <Inspector
        index={buildIndex(reportFor(1000, 1000, 0))}
        selection={{ bookCode: "GEN", chapter: null, summary: true }}
        layersOn={new Set(["scheme"])}
        notes={[]}
        sideNames={{ a: "A", b: "B" }}
        locale="en-US"
      />,
    );
    expect(screen.getByText("1,000 chapters in A, no in B.")).toBeInTheDocument();
    expect(screen.getByText(/GEN 1:1 \/ GEN 1:1 \(1,000\)/)).toBeInTheDocument();
  });

  it("shows the hover hint when the book is not in the index", () => {
    render(
      <Inspector
        index={index}
        selection={{ bookCode: "ZZZ", chapter: 1, summary: false }}
        layersOn={new Set(["scheme"])}
        notes={[]}
        sideNames={{ a: "A", b: "B" }}
      />,
    );
    expect(
      screen.getByText("Hover or click a chapter. Arrow keys move through the matrix."),
    ).toBeInTheDocument();
  });
});
