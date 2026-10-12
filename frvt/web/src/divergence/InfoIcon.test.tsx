import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoIcon } from "./InfoIcon";

describe("InfoIcon", () => {
  it("draws an info mark", () => {
    const { container } = render(<InfoIcon />);
    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(container).not.toHaveTextContent("?");
  });
});
