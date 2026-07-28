import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DriveSide } from "./overlay/drawPlan";
import { ColumnChrome } from "./ColumnChrome";
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
    chapterResolveItems: null,
    chapterResolveLoading: false,
    resolveLoading: false,
    errorBanner: null,
    authRequired: false,
    spansFor: () => [{ verse: 1, part: null }],
    navigationFor: () => [
      { book: "GEN", chapters: [1] },
      { book: "PSA", chapters: [1] },
    ],
    associationsFor: () => [],
    canResolve: true,
    jumpBooksFor: (side: DriveSide) => (side === "left" ? new Set(["PSA"]) : new Set()),
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

import { useViewerSession } from "./ViewerSession";

describe("ColumnChrome book jump indicators", () => {
  it("suffixes flagged books and shows the legend", () => {
    vi.mocked(useViewerSession).mockReturnValue(buildSession());

    render(<ColumnChrome side="left" resolveDisabled={false} />);

    expect(screen.getByLabelText("left book")).toHaveAttribute(
      "aria-describedby",
      "left-book-jump-legend",
    );
    expect(screen.getByText("● Book has mapping differences")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "PSA ●" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "GEN" })).toBeInTheDocument();
  });

  it("keeps bare book codes in option values when selecting a marked book", async () => {
    const user = userEvent.setup();
    const setColumnBcv = vi.fn();
    vi.mocked(useViewerSession).mockReturnValue(
      buildSession({
        setColumnBcv,
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
      }),
    );

    render(<ColumnChrome side="left" resolveDisabled={false} />);
    await user.selectOptions(screen.getByLabelText("left book"), "PSA");

    expect(setColumnBcv).toHaveBeenCalledWith("left", {
      book: "PSA",
      chapter: 1,
      verse: 1,
      part: null,
    });
  });

  it("shows no markers when jump-books data is empty", async () => {
    vi.mocked(useViewerSession).mockReturnValue(
      buildSession({
        jumpBooksFor: () => new Set(),
      }),
    );

    render(<ColumnChrome side="left" resolveDisabled={false} />);

    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /●/ })).not.toBeInTheDocument();
    });
    expect(screen.getByText("● Book has mapping differences")).toBeInTheDocument();
  });
});
