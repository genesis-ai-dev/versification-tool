import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.useRealTimers();
  });

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
    expect(screen.getByText("Renumbered run")).toBeInTheDocument();
    expect(screen.getByText("1 (renumber)")).toBeInTheDocument();
  });

  it("formats a large verse count", () => {
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
    expect(screen.getByText("1,000 (renumber)")).toBeInTheDocument();
  });

  it("shows a long side name in full in a hover tip", () => {
    vi.useFakeTimers();
    const name = "American Standard Version of 1901 [eng] ASV";
    render(
      <Inspector
        index={index}
        selection={{ bookCode: "GEN", chapter: 1, summary: false }}
        layersOn={new Set(["scheme"])}
        notes={[]}
        sideNames={{ a: name, b: "B" }}
      />,
    );
    fireEvent.pointerEnter(screen.getByText(name), { clientX: 8, clientY: 16 });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent(name);
  });

  it("shows a data warning as an accent chip", () => {
    const warned = reportFor(1, 1, 1);
    const row = warned.comparisons[0]?.events[0];
    if (row !== undefined) {
      row[6] = ["dataWarning"];
    }
    render(
      <Inspector
        index={buildIndex(warned)}
        selection={{ bookCode: "GEN", chapter: 1, summary: false }}
        layersOn={new Set(["scheme"])}
        notes={[]}
        sideNames={{ a: "A", b: "B" }}
      />,
    );
    expect(document.querySelector(".dv-flag.is-warning")).toHaveTextContent(
      "data warning",
    );
  });

  it("keeps a data warning chip and omits a bridge chip that repeats the rows", () => {
    const bridged = reportFor(2, 1, 1);
    const row = bridged.comparisons[0]?.events[0];
    if (row !== undefined) {
      row[6] = ["bridgeInB", "dataWarning"];
    }
    render(
      <Inspector
        index={buildIndex(bridged)}
        selection={{ bookCode: "GEN", chapter: 1, summary: false }}
        layersOn={new Set(["scheme"])}
        notes={[]}
        sideNames={{ a: "A", b: "B" }}
      />,
    );
    expect(screen.getByText("data warning")).toBeInTheDocument();
    expect(screen.queryByText(/bridged in/)).not.toBeInTheDocument();
  });

  it("omits a missing-side chip", () => {
    const missing = reportFor(1, 1, 1);
    const row = missing.comparisons[0]?.events[0];
    if (row !== undefined) {
      row[6] = ["missingInA"];
    }
    const { container } = render(
      <Inspector
        index={buildIndex(missing)}
        selection={{ bookCode: "GEN", chapter: 1, summary: false }}
        layersOn={new Set(["scheme"])}
        notes={[]}
        sideNames={{ a: "A", b: "B" }}
      />,
    );
    expect(container.querySelector(".dv-flag")).toBeNull();
    expect(screen.getAllByText("GEN 1:1").length).toBeGreaterThan(0);
  });

  it("omits the source-note chips", () => {
    const noted = reportFor(1, 1, 1);
    const row = noted.comparisons[0]?.events[0];
    if (row !== undefined) {
      row[6] = ["vrsSupplement", "textOmission"];
    }
    const { container } = render(
      <Inspector
        index={buildIndex(noted)}
        selection={{ bookCode: "GEN", chapter: 1, summary: false }}
        layersOn={new Set(["scheme"])}
        notes={[]}
        sideNames={{ a: "A", b: "B" }}
      />,
    );
    expect(container.querySelector(".dv-flag")).toBeNull();
    expect(screen.queryByText("from .vrs supplement")).not.toBeInTheDocument();
    expect(screen.queryByText("text omission")).not.toBeInTheDocument();
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
