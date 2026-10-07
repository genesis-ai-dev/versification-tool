import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScopeActions } from "./ScopeActions";

describe("ScopeActions", () => {
  it("offers book detail and then clear for a pinned book", async () => {
    const user = userEvent.setup();
    const onOpenBook = vi.fn();
    const onClear = vi.fn();
    render(
      <ScopeActions bookCode="GEN" pinned onOpenBook={onOpenBook} onClear={onClear} />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Open GEN in book detail",
      "Clear selection",
    ]);
    await user.click(screen.getByRole("button", { name: "Open GEN in book detail" }));
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onOpenBook).toHaveBeenCalledWith("GEN");
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("offers only book detail for a hovered book", () => {
    render(
      <ScopeActions
        bookCode="GEN"
        pinned={false}
        onOpenBook={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Open GEN in book detail" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear selection" }),
    ).not.toBeInTheDocument();
  });

  it("hides the book detail button while the Details tab is open", () => {
    render(
      <ScopeActions
        bookCode="GEN"
        pinned
        showDetails={false}
        onOpenBook={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Open GEN in book detail" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeInTheDocument();
  });

  it("renders nothing when no button applies", () => {
    const { container, rerender } = render(
      <ScopeActions
        bookCode={null}
        pinned
        onOpenBook={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <ScopeActions
        bookCode="GEN"
        pinned={false}
        showDetails={false}
        onOpenBook={() => undefined}
        onClear={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
