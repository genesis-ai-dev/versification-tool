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
    versifications: [
      {
        id: "scheme-eng",
        name: "English",
        based_on_name: "org",
        based_on_id: null,
        canonical: false,
        created_at: "",
        updated_at: "",
      },
      {
        id: "scheme-org",
        name: "org",
        based_on_name: null,
        based_on_id: null,
        canonical: true,
        created_at: "",
        updated_at: "",
      },
    ],
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
    associationsFor: () => [
      {
        id: "assoc-eng",
        translation_id: "left-id",
        scheme_id: "scheme-eng",
        preferred: true,
      },
      {
        id: "assoc-org",
        translation_id: "left-id",
        scheme_id: "scheme-org",
        preferred: false,
      },
    ],
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

/** Open a BCV typeahead and return its listbox. */
async function openTypeahead(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByLabelText(label));
  return screen.getByRole("listbox", { name: label });
}

describe("ColumnChrome book jump indicators", () => {
  it("suffixes flagged books and shows a visible, described explanation", async () => {
    const user = userEvent.setup();
    vi.mocked(useViewerSession).mockReturnValue(buildSession());

    const { container } = render(<ColumnChrome side="left" resolveDisabled={false} />);

    const bookSelect = screen.getByLabelText("left book");
    expect(bookSelect).toHaveAttribute("aria-describedby", "left-book-jump-legend");
    const legend = container.querySelector("#left-book-jump-legend");
    expect(legend).not.toHaveClass("sr-only");
    const labelRow = container.querySelector(".book-chrome-label-row");
    expect(labelRow).toContainElement(legend);
    expect(legend).toHaveTextContent("●Book has mapping differences");
    expect(legend?.querySelector(".book-jump-marker")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    await openTypeahead(user, "left book");
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
    await openTypeahead(user, "left book");
    await user.click(screen.getByRole("option", { name: "PSA ●" }));

    expect(setColumnBcv).toHaveBeenCalledWith("left", {
      book: "PSA",
      chapter: 1,
      verse: 1,
      part: null,
    });
  });

  it("shows no markers when jump-books data is empty", async () => {
    const user = userEvent.setup();
    vi.mocked(useViewerSession).mockReturnValue(
      buildSession({
        jumpBooksFor: () => new Set(),
      }),
    );

    render(<ColumnChrome side="left" resolveDisabled={false} />);

    await openTypeahead(user, "left book");
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /●/ })).not.toBeInTheDocument();
    });
    expect(document.getElementById("left-book-jump-legend")).toHaveTextContent(
      "Book has mapping differences",
    );
  });

  it("formats versification options with based-on and preferred star", () => {
    vi.mocked(useViewerSession).mockReturnValue(buildSession());

    render(<ColumnChrome side="left" resolveDisabled={false} />);

    expect(
      screen.getByRole("option", { name: "English (based on org) ★" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "org" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Preferred (default)" }),
    ).toBeInTheDocument();
  });
});
