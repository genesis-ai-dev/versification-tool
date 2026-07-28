/**
 * Shared viewer waits and URL helpers for Playwright e2e.
 * Prefer URL/label assertions over fixed sleeps.
 */

import { expect, type Page } from "@playwright/test";

/** Wait until the viewer has rendered at least one verse span. */
export async function waitForVerseSpans(page: Page): Promise<void> {
  await expect(page.locator(".verse-span").first()).toBeVisible({ timeout: 45_000 });
}

/** Wait until the empty-state upload heading is visible. */
export async function waitForEmptyState(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: /upload a translation project/i }),
  ).toBeVisible({ timeout: 30_000 });
}

/**
 * Open the viewer with explicit session params and wait for spans.
 * Pass scheme overrides (lvers/rvers) when non-identity resolve is required.
 */
export async function openViewerSession(
  page: Page,
  params: {
    left: string;
    right?: string | null;
    drive?: "left" | "right";
    map?: boolean;
    mapMode?: "off" | "current" | "chapter";
    lvers?: string | null;
    rvers?: string | null;
    lb?: string;
    lc?: string;
    lv?: string;
    rb?: string;
    rc?: string;
    rv?: string;
  },
): Promise<void> {
  const search = new URLSearchParams();
  search.set("left", params.left);
  if (params.right) {
    search.set("right", params.right);
  }
  search.set("drive", params.drive ?? "left");
  if (params.mapMode) {
    search.set(
      "map",
      params.mapMode === "off" ? "0" : params.mapMode === "chapter" ? "all" : "1",
    );
  } else {
    search.set("map", params.map === false ? "0" : "1");
  }
  if (params.lvers) {
    search.set("lvers", params.lvers);
  }
  if (params.rvers) {
    search.set("rvers", params.rvers);
  }
  if (params.lb) {
    search.set("lb", params.lb);
  }
  if (params.lc) {
    search.set("lc", params.lc);
  }
  if (params.lv) {
    search.set("lv", params.lv);
  }
  if (params.rb) {
    search.set("rb", params.rb);
  }
  if (params.rc) {
    search.set("rc", params.rc);
  }
  if (params.rv) {
    search.set("rv", params.rv);
  }
  await page.goto(`/?${search.toString()}`);
  await expect(page.getByLabel("left translation")).toHaveValue(params.left, {
    timeout: 30_000,
  });
  if (params.right) {
    await expect(page.getByLabel("right translation")).toHaveValue(params.right);
  }
  await waitForVerseSpans(page);
}

/** Read current viewer URL search params. */
export function viewerParams(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

/** Wait until the overlay has painted a path or outline rect. */
export async function waitForConnectors(page: Page): Promise<void> {
  // Paths may be present with zero layout box; attachment is the reliable signal.
  await expect(
    page.locator("svg.mapping-overlay path, svg.mapping-overlay rect").first(),
  ).toBeAttached({
    timeout: 45_000,
  });
}

/** Count SVG connector paths currently painted in the overlay. */
export async function connectorCount(page: Page): Promise<number> {
  return page.locator("svg.mapping-overlay path").count();
}

/** Count outline rects + connector paths (any overlay paint). */
export async function overlayPaintCount(page: Page): Promise<number> {
  return page.locator("svg.mapping-overlay path, svg.mapping-overlay rect").count();
}

/** Click the first verse span in the named column. */
export async function clickFirstVerse(page: Page, side: "left" | "right"): Promise<void> {
  await page.locator(`.verse-span[data-side="${side}"]`).first().click();
}

/**
 * Select a book/chapter/verse via column chrome selects when options exist.
 * Skips redundant book reselection (which resets chapter/verse to defaults).
 * Waits for verse options after chapter changes because options come from spans.
 */
export async function trySelectBcv(
  page: Page,
  side: "left" | "right",
  book: string,
  chapter: string,
  verse?: string,
): Promise<boolean> {
  const bookSelect = page.getByLabel(`${side} book`);
  const option = bookSelect.locator(`option[value="${book}"]`);
  if ((await option.count()) === 0) {
    return false;
  }
  if ((await bookSelect.inputValue()) !== book) {
    await bookSelect.selectOption(book);
    await expect(bookSelect).toHaveValue(book);
  }
  const chapterSelect = page.getByLabel(`${side} chapter`);
  await expect
    .poll(async () => chapterSelect.locator(`option[value="${chapter}"]`).count())
    .toBeGreaterThan(0);
  if ((await chapterSelect.inputValue()) !== chapter) {
    await chapterSelect.selectOption(chapter);
  }
  const bookKey = side === "left" ? "lb" : "rb";
  const chapterKey = side === "left" ? "lc" : "rc";
  await expect
    .poll(() => {
      const params = viewerParams(page);
      return `${params.get(bookKey)}|${params.get(chapterKey)}`;
    })
    .toBe(`${book}|${chapter}`);
  if (verse !== undefined) {
    const verseSelect = page.getByLabel(`${side} verse`);
    const verseOption = verseSelect.locator(`option[value="${verse}|"]`);
    await expect.poll(async () => verseOption.count()).toBeGreaterThan(0);
    await verseSelect.selectOption(`${verse}|`);
  }
  await waitForVerseSpans(page);
  return true;
}
