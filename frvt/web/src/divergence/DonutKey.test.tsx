import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DonutKey } from "./DonutKey";
import type { Slice } from "./breakdown";
import { LAYER_IDS, LAYER_LABELS, TYPE_IDS, TYPE_LABELS } from "./taxonomy";

const numbering: Slice = {
  key: "layer-scheme",
  label: "Numbering",
  value: 2,
  percent: 50,
};

const renumbered: Slice = {
  key: "type-2",
  label: "Renumbered run",
  value: 2,
  percent: 100,
};

describe("DonutKey", () => {
  it("starts closed and lists the drawn slices after it is opened", async () => {
    const user = userEvent.setup();
    render(<DonutKey layers={[numbering]} types={[renumbered]} />);
    const key = screen.getByText("Key").closest("details");
    expect(key).not.toHaveAttribute("open");
    await user.click(screen.getByText("Key"));
    expect(key).toHaveAttribute("open");
    expect(screen.getByText("Numbering")).toBeInTheDocument();
    expect(screen.getByText("Renumbered run")).toBeInTheDocument();
    const numberingTip = screen.getByRole("button", { name: "Numbering explanation" });
    const renumberedTip = screen.getByRole("button", {
      name: "Renumbered run explanation",
    });
    await user.click(numberingTip);
    const layerTip = screen.getByRole("tooltip");
    expect(layerTip.parentElement).toBe(document.body);
    expect(key).not.toContainElement(layerTip);
    expect(layerTip).toHaveTextContent("Psalm-title numbering");
    await user.click(numberingTip);
    await user.click(renumberedTip);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Genesis 32:1–32");
    expect(screen.queryByText("Bridges and omissions")).not.toBeInTheDocument();
  });

  it("explains every layer and every divergence type", async () => {
    const user = userEvent.setup();
    const layers: Slice[] = LAYER_IDS.map((id) => ({
      key: `layer-${id}`,
      label: LAYER_LABELS[id],
      value: 1,
      percent: 1,
    }));
    const types: Slice[] = TYPE_IDS.map((_id, index) => ({
      key: `type-${index}`,
      label: TYPE_LABELS[index],
      value: 1,
      percent: 1,
    }));
    render(<DonutKey layers={layers} types={types} />);
    await user.click(screen.getByText("Key"));
    expect(screen.getAllByRole("button", { name: /explanation$/ })).toHaveLength(
      LAYER_IDS.length + TYPE_IDS.length,
    );
  });

  it("draws no explanation for a slice it does not recognize", async () => {
    const user = userEvent.setup();
    render(
      <DonutKey
        layers={[]}
        types={[{ key: "note", label: "Note", value: 1, percent: 100 }]}
      />,
    );
    await user.click(screen.getByText("Key"));
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says when the chart has no slices", async () => {
    const user = userEvent.setup();
    render(<DonutKey layers={[]} types={[]} />);
    await user.click(screen.getByText("Key"));
    expect(screen.getByText("No slices in this chart.")).toBeInTheDocument();
  });
});
