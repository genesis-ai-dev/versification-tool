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
  // URL defaults / span load can lag behind translation selection under catalog load.
  await expect
    .poll(async () => page.getByLabel("left book").getAttribute("data-value"), {
      timeout: 45_000,
    })
    .not.toBe("");
  await waitForVerseSpans(page);
}

/** Read current viewer URL search params. */
export function viewerParams(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}

/** Wait until chapter-mode mapping fetch has finished (toolbar loading hint gone). */
export async function waitForChapterMappings(page: Page): Promise<void> {
  // Do not treat "not yet shown" as done — poll until the toolbar is idle.
  await expect
    .poll(
      async () => {
        const ctx = await page.locator(".pair-context").innerText();
        if (ctx.includes("Loading chapter mappings…") || ctx.includes("Resolving…")) {
          return "loading";
        }
        return "idle";
      },
      { timeout: 60_000 },
    )
    .toBe("idle");
}

/**
 * Wait until overlay paint is idle and connector paths meet ``minCount``.
 * Ignores transient clears while resolve/chapter requests are in flight.
 */
export async function waitForConnectorCount(
  page: Page,
  minCount: number,
): Promise<number> {
  let last = 0;
  await expect
    .poll(
      async () => {
        const ctx = await page.locator(".pair-context").innerText();
        if (ctx.includes("Loading chapter mappings…") || ctx.includes("Resolving…")) {
          return -1;
        }
        last = await connectorCount(page);
        return last;
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThanOrEqual(minCount);
  return last;
}

/** Wait until the overlay has painted at least one connector path. */
export async function waitForConnectors(page: Page): Promise<void> {
  await waitForConnectorCount(page, 1);
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
  const verse = page.locator(`.verse-span[data-side="${side}"]`).first();
  await expect(verse).toBeVisible({ timeout: 45_000 });
  await verse.click();
}

/**
 * Open a BCV typeahead and click the option with the given data-value.
 * Returns false when that option is absent.
 */
export async function selectTypeaheadValue(
  page: Page,
  ariaLabel: string,
  value: string,
): Promise<boolean> {
  const combobox = page.getByLabel(ariaLabel);
  await combobox.click();
  const listbox = page.getByRole("listbox", { name: ariaLabel });
  const option = listbox.locator(`[role="option"][data-value="${value}"]`);
  if ((await option.count()) === 0) {
    await page.keyboard.press("Escape");
    return false;
  }
  await option.click();
  await expect(combobox).toHaveAttribute("data-value", value);
  return true;
}

/** True when the open listbox for ``ariaLabel`` contains ``value``. */
async function typeaheadHasValue(
  page: Page,
  ariaLabel: string,
  value: string,
): Promise<boolean> {
  const combobox = page.getByLabel(ariaLabel);
  await combobox.click();
  const count = await page
    .getByRole("listbox", { name: ariaLabel })
    .locator(`[role="option"][data-value="${value}"]`)
    .count();
  await page.keyboard.press("Escape");
  return count > 0;
}

/**
 * Select a book/chapter/verse via column chrome typeaheads when options exist.
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
  if (!(await typeaheadHasValue(page, `${side} book`, book))) {
    return false;
  }
  if ((await bookSelect.getAttribute("data-value")) !== book) {
    await selectTypeaheadValue(page, `${side} book`, book);
  }
  await expect
    .poll(async () => typeaheadHasValue(page, `${side} chapter`, chapter))
    .toBe(true);
  const chapterSelect = page.getByLabel(`${side} chapter`);
  if ((await chapterSelect.getAttribute("data-value")) !== chapter) {
    await selectTypeaheadValue(page, `${side} chapter`, chapter);
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
    const verseKey = `${verse}|`;
    await expect
      .poll(async () => typeaheadHasValue(page, `${side} verse`, verseKey))
      .toBe(true);
    await selectTypeaheadValue(page, `${side} verse`, verseKey);
  }
  await waitForVerseSpans(page);
  return true;
}
