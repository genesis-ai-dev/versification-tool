import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DriveDirectionIndicator } from "./DriveDirectionIndicator";

describe("DriveDirectionIndicator", () => {
  it("points left→right when left drives", () => {
    render(<DriveDirectionIndicator drive="left" />);
    const indicator = screen.getByLabelText("Drive: left → right");
    expect(indicator).toHaveTextContent("→");
  });

  it("points right→left when right drives", () => {
    render(<DriveDirectionIndicator drive="right" />);
    const indicator = screen.getByLabelText("Drive: right → left");
    expect(indicator).toHaveTextContent("←");
  });
});
