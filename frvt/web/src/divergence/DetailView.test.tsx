import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { DivergenceReport, EventRow, RunRow } from "./types";
import { DetailView, type DetailViewProps } from "./DetailView";
import { buildIndex } from "./model/index";

/** An event on Genesis ``chapter``. Type 0 is RENUMBER. */
function event(chapter: number): EventRow {
  const span = ["GEN", chapter, 1, chapter, 2] as EventRow[1];
  return [0, span, span, span, 2, "renumber", []];
}

/** The chapter 1 run that overlaps the first event. */
const run: RunRow = [
  ["GEN", 1, 1, 1, 2],
  ["GEN", 1, 1, 1, 2],
  ["GEN", 1, 1, 1, 2],
  0,
  "",
  "",
  "",
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
      events: [event(1), event(2)],
      runs: [run],
      warnings: { a: [], b: [], aCount: 0, bCount: 0 },
    },
  ],
  eventNotes: [],
  org: { GEN: [31, 25] },
  catalog: [["GEN", "Genesis", "OT"]],
  sides: [],
  engineVersion: "1",
  computedAt: "",
};

function Harness(props: Omit<DetailViewProps, "highlight">) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  return (
    <DetailView
      {...props}
      highlight={{
        activeKey,
        onPick: (key) => {
          if (key === null) {
            return;
          }
          setActiveKey((current) => (current === key ? null : key));
        },
      }}
    />
  );
}

function renderDetail() {
  const index = buildIndex(report);
  return render(
    <Harness
      index={index}
      runs={report.comparisons[0]?.runs ?? []}
      org={report.org}
      layersOn={new Set(["scheme"])}
      book="GEN"
      sideNames={{ a: "Source Name", b: "Target Name" }}
      onBook={() => undefined}
    />,
  );
}

function chapterRow(chapter: number) {
  return screen.getByRole("row", { name: new RegExp(`GEN ${chapter}:1`) });
}

async function ladderPath() {
  const { container } = renderDetail();
  await waitFor(() => {
    expect(container.querySelector(".dv-ladder path")).not.toBeNull();
  });
  const path = container.querySelector(".dv-ladder path");
  if (path === null) {
    throw new Error("ladder path missing");
  }
  return path;
}

describe("DetailView selection", () => {
  it("selects a table row and clears it on the second click", () => {
    renderDetail();
    const row = chapterRow(1);
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-selected", "true");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-selected", "false");
  });

  it("selects the matching table row from a ladder ribbon", async () => {
    const path = await ladderPath();
    fireEvent.click(path);
    expect(chapterRow(1)).toHaveAttribute("aria-selected", "true");
    fireEvent.click(path);
    expect(chapterRow(1)).toHaveAttribute("aria-selected", "false");
  });

  it("leaves a row with no overlapping run unselected", () => {
    renderDetail();
    const row = chapterRow(2);
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-selected", "false");
  });

  it("places the translation names around the strip and names the visible chapters", async () => {
    const { container } = renderDetail();
    const names = container.querySelectorAll(".dv-ladder-name");
    const stage = container.querySelector(".dv-ladder-stage");
    expect(names[0]?.textContent).toBe("Source Name");
    expect(names[1]?.textContent).toBe("Target Name");
    expect(stage).not.toBeNull();
    expect(
      names[0]?.compareDocumentPosition(stage!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      stage?.compareDocumentPosition(names[1]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Genesis 1–2")).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector(".dv-tick")?.textContent).toBe("GEN 1");
    });
    expect(container.querySelector(".dv-ladder-stage")?.textContent).not.toContain("Source Name");
  });
});
