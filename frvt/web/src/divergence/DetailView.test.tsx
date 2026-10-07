import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DivergenceReport, EventRow, RunRow } from "./types";
import { DetailView, type DetailViewProps } from "./DetailView";
import { ACCENT } from "./model/colors";
import { buildIndex } from "./model/index";
import { runKey, type ScopedRun } from "./model/detail";
import { pickEvent, pickRun, type DetailPick, type PickContext } from "./model/selection";

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

function Harness({
  onHover = vi.fn(),
  onHoverEvent = vi.fn(),
  ...props
}: Omit<DetailViewProps, "highlight"> & {
  onHover?: (key: string) => void;
  onHoverEvent?: (event: { index: number }) => void;
}) {
  const [pick, setPick] = useState<DetailPick>({ runKey: null, pin: null });
  const context: PickContext = {
    index: props.index,
    runs: props.runs,
    layersOn: props.layersOn,
    book: props.book,
  };
  return (
    <DetailView
      {...props}
      highlight={{
        activeKey: pick.runKey,
        activeEvent: pick.pin?.eventIndex ?? null,
        onPick: (key) => {
          setPick((current) => pickRun(context, current, key) ?? current);
        },
        onPickEvent: (event) => {
          setPick((current) => pickEvent(context, current, event));
        },
        onHover,
        onHoverEvent,
      }}
    />
  );
}

function renderDetail(
  runs: RunRow[] = report.comparisons[0]?.runs ?? [],
  hover: {
    onHover?: (key: string) => void;
    onHoverEvent?: (event: { index: number }) => void;
  } = {},
) {
  const index = buildIndex(report);
  return render(
    <Harness
      index={index}
      runs={runs}
      org={report.org}
      layersOn={new Set(["scheme"])}
      book="GEN"
      sideNames={{ a: "Source Name", b: "Target Name" }}
      onBook={() => undefined}
      {...hover}
    />,
  );
}

function chapterRow(chapter: number) {
  return screen.getByRole("row", { name: new RegExp(`GEN ${chapter}:1`) });
}

async function ladderPath() {
  const { container } = renderDetail();
  await waitFor(() => {
    expect(container.querySelector(".dv-ladder-stage path")).not.toBeNull();
  });
  const path = container.querySelector(".dv-ladder-stage path");
  if (path === null) {
    throw new Error("ladder path missing");
  }
  return path;
}

describe("DetailView selection", () => {
  it("selects a table row and clears it on the second click", () => {
    renderDetail();
    const row = chapterRow(1);
    expect(row).toHaveTextContent("Renumbered run");
    expect(row).toHaveTextContent("2");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-selected", "true");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-selected", "false");
  });

  it("selects a focused row when Enter is pressed", () => {
    renderDetail();
    const row = chapterRow(1);
    row.focus();
    fireEvent.keyDown(row, { key: "Enter" });
    expect(row).toHaveAttribute("aria-selected", "true");
  });

  it("selects the matching table row from a ladder ribbon", async () => {
    const path = await ladderPath();
    fireEvent.click(path);
    expect(chapterRow(1)).toHaveAttribute("aria-selected", "true");
    fireEvent.click(path);
    expect(chapterRow(1)).toHaveAttribute("aria-selected", "false");
  });

  it("does not select an unchanged chapter", async () => {
    const same: RunRow = [
      ["GEN", 3, 1, 3, 4],
      ["GEN", 3, 1, 3, 4],
      ["GEN", 3, 1, 3, 4],
      -1,
      "",
      "",
      "",
    ];
    const comparison = report.comparisons[0];
    if (comparison === undefined) {
      throw new Error("comparison missing");
    }
    const index = buildIndex({
      ...report,
      comparisons: [
        {
          ...comparison,
          books: [
            {
              code: "GEN",
              name: "Genesis",
              section: "OT",
              a: [31, 25, 22],
              b: [31, 25, 22],
            },
          ],
          events: [event(1)],
          runs: [run, same],
        },
      ],
      org: { GEN: [31, 25, 22] },
    });
    const { container } = render(
      <Harness
        index={index}
        runs={[run, same]}
        org={{ GEN: [31, 25, 22] }}
        layersOn={new Set(["scheme"])}
        book="GEN"
        sideNames={{ a: "Source Name", b: "Target Name" }}
        onBook={() => undefined}
      />,
    );
    await waitFor(() => {
      expect(container.querySelector(".dv-ladder path.dv-pick")).not.toBeNull();
    });
    const unchanged = container.querySelector(".dv-ladder-stage path:not(.dv-pick)");
    expect(unchanged).not.toBeNull();
    fireEvent.click(unchanged!);
    expect(chapterRow(1)).toHaveAttribute("aria-selected", "false");
    expect(container.querySelector(".dv-selected")).toBeNull();
  });

  it("reports a ribbon hover with the run key", async () => {
    const onHover = vi.fn();
    const { container } = renderDetail(undefined, { onHover });
    await waitFor(() => {
      expect(container.querySelector(".dv-ladder .dv-pick")).not.toBeNull();
    });
    const ribbon = container.querySelector(".dv-ladder .dv-pick");
    expect(ribbon).not.toBeNull();
    fireEvent.mouseEnter(ribbon!);
    const expected: ScopedRun = {
      a: run[0],
      o: run[1],
      b: run[2],
      type: "RENUMBER",
      flags: "",
      excludedA: "",
      excludedB: "",
    };
    expect(onHover).toHaveBeenCalledWith(runKey(expected));
  });

  it("reports a table-row hover with the event", () => {
    const onHoverEvent = vi.fn();
    renderDetail(undefined, { onHoverEvent });
    fireEvent.mouseEnter(chapterRow(1));
    expect(onHoverEvent).toHaveBeenCalledWith(expect.objectContaining({ index: 0 }));
  });

  it("selects a block for verses on one side only", async () => {
    const sideAOnly: RunRow = [["GEN", 1, 3, 1, 3], null, null, 0, "", "", ""];
    const { container } = renderDetail([run, sideAOnly]);
    await waitFor(() => {
      expect(container.querySelectorAll(".dv-ladder rect.dv-pick")).toHaveLength(1);
    });
    const block = container.querySelector(".dv-ladder rect.dv-pick");
    expect(block).not.toBeNull();
    fireEvent.click(block!);
    await waitFor(() => {
      expect(container.querySelector(".dv-ladder rect.dv-pick")).toHaveClass(
        "dv-selected",
      );
    });
  });

  it("selects a row that has no overlapping run", () => {
    const { container } = renderDetail();
    const row = chapterRow(2);
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector(".dv-selected")).toBeNull();
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
    expect(container.querySelector(".dv-ladder-stage")?.textContent).not.toContain(
      "Source Name",
    );
  });

  it("zooms with the wheel and moves the slider to match", () => {
    const { container } = renderDetail();
    const stage = container.querySelector(".dv-ladder-stage");
    expect(stage).not.toBeNull();
    fireEvent.wheel(stage!, { deltaY: -1000 });
    expect(screen.getByRole("slider")).toHaveValue("4");
  });

  it("keeps a wheel zoom when the strip is dragged in the same frame", () => {
    const { container } = renderDetail();
    const stage = container.querySelector(".dv-ladder-stage");
    expect(stage).not.toBeNull();
    stage!.setPointerCapture = () => undefined;
    fireEvent.wheel(stage!, { deltaY: -1000 });
    fireEvent.pointerDown(stage!, { clientX: 80, button: 0, pointerId: 1 });
    fireEvent.wheel(stage!, { deltaY: -1000 });
    fireEvent.pointerMove(stage!, { clientX: 120, pointerId: 1 });
    expect(screen.getByRole("slider")).toHaveValue("16");
  });

  it("leaves a wheel at the zoom limit to scroll the page", () => {
    const { container } = renderDetail();
    const stage = container.querySelector(".dv-ladder-stage");
    expect(stage).not.toBeNull();
    expect(fireEvent.wheel(stage!, { deltaY: 100 })).toBe(true);
    expect(screen.getByRole("slider")).toHaveValue("1");
  });

  it("explains the verse axes from the range label", async () => {
    const user = userEvent.setup();
    const { container } = renderDetail();
    const place = container.querySelector(".dv-ladder-place");
    expect(place).not.toBeNull();
    expect(place).toHaveTextContent("Genesis");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Verse axes explanation" });
    expect(place).toContainElement(button);
    await user.click(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Three verse axes: Source Name on top, org in the middle, and Target Name below.",
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("drag to pan");
  });

  it("explains the dot plot from the magnify offsets control", async () => {
    const user = userEvent.setup();
    const { container } = renderDetail();
    await user.click(screen.getByRole("tab", { name: "Dot plot" }));
    const checkbox = screen.getByRole("checkbox", { name: "Magnify offsets" });
    expect(checkbox).toBeChecked();
    expect(screen.queryByText(/x is the/)).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Dot plot explanation" });
    expect(container.querySelector(".dv-dot-option")).toContainElement(button);
    await user.click(button);
    expect(checkbox).toBeChecked();
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "x is the Source Name position and y is the Target Name position",
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("Click a run to inspect it.");
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.click(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("at true scale");
  });

  it("opens on the divergence table and switches to the dot plot", () => {
    const { container } = renderDetail();
    expect(chapterRow(1)).toBeInTheDocument();
    expect(container.querySelector(".dv-dot")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Dot plot" }));
    expect(container.querySelector(".dv-dot")).not.toBeNull();
    expect(screen.getByRole("checkbox", { name: "Magnify offsets" })).toBeInTheDocument();
    expect(container.querySelector(".dv-table")).toBeNull();
  });

  it("keeps the selected row after a round trip through the dot plot", () => {
    renderDetail();
    fireEvent.click(chapterRow(1));
    fireEvent.click(screen.getByRole("tab", { name: "Dot plot" }));
    fireEvent.click(screen.getByRole("tab", { name: "Divergences" }));
    expect(chapterRow(1)).toHaveAttribute("aria-selected", "true");
  });

  it("moves to the next tab with the down arrow", () => {
    renderDetail();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Divergences" }), {
      key: "ArrowDown",
    });
    expect(screen.getByRole("tab", { name: "Dot plot" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("dashes an approximate ribbon", async () => {
    const approximate: RunRow = [run[0], run[1], run[2], run[3], "a", "", ""];
    const { container } = renderDetail([approximate]);
    await waitFor(() => {
      expect(
        container.querySelector('.dv-ladder-stage path[stroke-dasharray="3 2"]'),
      ).not.toBeNull();
    });
  });

  it("outlines a data-warning ribbon in the accent color", async () => {
    const warning: RunRow = [run[0], run[1], run[2], run[3], "w", "", ""];
    const { container } = renderDetail([warning]);
    await waitFor(() => {
      expect(
        container.querySelector(".dv-ladder-stage path")?.getAttribute("stroke"),
      ).toBe(ACCENT);
    });
  });

  it("labels the first chapter on all three axes", async () => {
    const { container } = renderDetail();
    await waitFor(() => {
      const labels = Array.from(
        container.querySelectorAll(".dv-tick"),
        (node) => node.textContent,
      );
      expect(labels.filter((text) => text === "GEN 1")).toHaveLength(3);
    });
  });

  it("lines the range label up with org and clips the strip at the axis ends", async () => {
    const oneSided: RunRow = [run[0], run[1], null, run[3], "", "", ""];
    const { container } = renderDetail([run, oneSided]);
    await waitFor(() => {
      expect(container.querySelector(".dv-axis")?.textContent).toBe("org");
    });
    const ladder = container.querySelector(".dv-ladder");
    expect(ladder).toHaveStyle({ "--dv-axis-label-x": "6px" });
    expect(container.querySelector(".dv-axis")?.getAttribute("x")).toBe("6");
    const svg = container.querySelector(".dv-ladder-stage svg");
    const width = Number(svg?.getAttribute("width"));
    const clip = svg?.querySelector("clipPath");
    const rect = clip?.querySelector("rect");
    expect(clip?.id).not.toContain(":");
    expect(rect?.getAttribute("x")).toBe("36");
    expect(rect?.getAttribute("width")).toBe(String(width - 50));
    const ribbon = container.querySelector(".dv-ladder-stage path");
    const block = container.querySelector(".dv-ladder-stage g rect");
    expect(ribbon?.parentElement?.tagName.toLowerCase()).toBe("g");
    expect(block?.parentElement).toBe(ribbon?.parentElement);
    expect(ribbon?.parentElement?.getAttribute("clip-path")).toMatch(/^url\(#/);
    expect(svg?.querySelector("g > line")).not.toBeNull();
    expect(svg?.querySelector("g > text.dv-tick")).not.toBeNull();
    expect(svg?.querySelector(":scope > path")).toBeNull();
    expect(svg?.querySelector(":scope > line")).toBeNull();
    expect(container.querySelector(".dv-axis")?.parentElement).toBe(svg);
  });
});
