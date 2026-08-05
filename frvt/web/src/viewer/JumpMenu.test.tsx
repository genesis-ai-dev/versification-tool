import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DriveSide } from "./overlay/drawPlan";
import { JumpMenu } from "./JumpMenu";
import type { ViewerSessionValue } from "./ViewerSession";

function buildSession(overrides: Partial<ViewerSessionValue> = {}): ViewerSessionValue {
  return {
    url: {
      left: "left-id",
      right: "right-id",
      leftBcv: { book: "GEN", chapter: 1, verse: 1, part: null },
      rightBcv: { book: "GEN", chapter: 1, verse: 1, part: null },
      leftVers: null,
      rightVers: null,
      drive: "left",
      mapMode: "current",
    },
    translations: [],
    translationTotal: 2,
    versifications: [],
    resolveResult: null,
    resolveDriveSide: null,
    chapterResolveItems: null,
    chapterResolveLoading: false,
    resolveLoading: false,
    selectionPending: false,
    errorBanner: null,
    authRequired: false,
    spansFor: () => [
      {
        id: "span-1",
        book: "GEN",
        chapter: 1,
        verse: 1,
        part: null,
        seq: 1,
        ref: "GEN 1:1",
        text: "In the beginning",
      },
    ],
    navigationFor: () => [],
    associationsFor: () => [],
    canResolve: true,
    jumpBooksFor: (_side: DriveSide) => new Set(),
    updateUrl: vi.fn(),
    setColumnBcv: vi.fn(),
    setColumnTranslation: vi.fn(),
    setColumnVersification: vi.fn(),
    setMapMode: vi.fn(),
    registerScrollRoot: vi.fn(),
    refreshCatalogs: vi.fn(async () => undefined),
    ...overrides,
  };
}

vi.mock("./ViewerSession", () => ({
  useViewerSession: vi.fn(),
}));

vi.mock("../api/resolve", () => ({
  loadJumpMenu: vi.fn(async () => ({
    deltas: { items: [], total: 0 },
    misalignments: { items: [], total: 0 },
  })),
}));

import { useViewerSession } from "./ViewerSession";

describe("JumpMenu dismiss", () => {
  it("closes when clicking outside the menu", async () => {
    const user = userEvent.setup();
    vi.mocked(useViewerSession).mockReturnValue(buildSession());

    render(<JumpMenu side="left" />);
    await user.click(screen.getByRole("button", { name: "Jump" }));
    expect(screen.getByRole("heading", { name: "Mapped deltas" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("heading", { name: "Mapped deltas" })).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    vi.mocked(useViewerSession).mockReturnValue(buildSession());

    render(<JumpMenu side="left" />);
    await user.click(screen.getByRole("button", { name: "Jump" }));
    expect(screen.getByRole("heading", { name: "Mapped deltas" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Mapped deltas" })).not.toBeInTheDocument();
  });

  it("closes after selecting a current-chapter verse", async () => {
    const user = userEvent.setup();
    const setColumnBcv = vi.fn();
    vi.mocked(useViewerSession).mockReturnValue(buildSession({ setColumnBcv }));

    render(<JumpMenu side="left" />);
    await user.click(screen.getByRole("button", { name: "Jump" }));
    await user.click(screen.getByRole("button", { name: "GEN 1:1" }));

    expect(setColumnBcv).toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Mapped deltas" })).not.toBeInTheDocument();
  });
});
