import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TypeaheadSelect } from "./TypeaheadSelect";

const BOOK_OPTIONS = [
  { value: "", label: "—" },
  { value: "GEN", label: "GEN" },
  { value: "PSA", label: "PSA ●" },
];

describe("TypeaheadSelect", () => {
  it("filters by value and label, then commits the bare value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TypeaheadSelect
        value="GEN"
        options={BOOK_OPTIONS}
        aria-label="left book"
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("left book");
    await user.click(input);
    await user.type(input, "psa");

    expect(screen.getByRole("option", { name: "PSA ●" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "GEN" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "PSA ●" }));
    expect(onChange).toHaveBeenCalledWith("PSA");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports keyboard selection of the active option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TypeaheadSelect
        value=""
        options={BOOK_OPTIONS}
        aria-label="left book"
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("left book");
    await user.click(input);
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("PSA");
  });
});
