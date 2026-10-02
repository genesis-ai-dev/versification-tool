import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DonutKey } from "./DonutKey";
import type { Slice } from "./breakdown";

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
    expect(
      screen.getByRole("button", { name: "Numbering explanation" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Renumbered run explanation" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Bridges and omissions")).not.toBeInTheDocument();
  });

  it("says when the chart has no slices", async () => {
    const user = userEvent.setup();
    render(<DonutKey layers={[]} types={[]} />);
    await user.click(screen.getByText("Key"));
    expect(screen.getByText("No slices in this chart.")).toBeInTheDocument();
  });
});
