import { test, expect } from "@playwright/test";
import {
  createEmptyTranslation,
  deleteAllTranslations,
  deleteVersification,
  ensureAssociated,
  excludeIngredient,
  findCanonicalScheme,
  ingestProject,
  listAssociations,
  listTranslations,
  primaryProjectZipPath,
  seedContrastingPair,
  uploadIngredientJson,
  uploadVersificationFile,
  paratextVrsPath,
  verse0ProjectZipPath,
} from "./helpers/api";
import {
  clickFirstVerse,
  connectorCount,
  openViewerSession,
  trySelectBcv,
  viewerParams,
  waitForConnectors,
  waitForEmptyState,
  waitForVerseSpans,
} from "./helpers/viewer";

/**
 * Viewer e2e: URL session, columns, jumps, and deferred nav/ingest cases.
 * Seeds via API (Basic on page.request); fails clearly when seed fails.
 */
test.describe("Viewer e2e", () => {
  test("TC-UI-001: empty state explains required upload", async ({ page }) => {
    await deleteAllTranslations(page.request);
    await page.goto("/");
    await waitForEmptyState(page);
    await expect(page.getByText(/USX/i)).toBeVisible();
    await expect(page.getByText(/\.vrs/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /upload project/i })).toBeVisible();
  });

  test("TC-UI-002: two-column session state lives in the URL", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      drive: "left",
      map: true,
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    await clickFirstVerse(page, "left");
    await expect
      .poll(() => {
        const p = viewerParams(page);
        return [
          p.get("left"),
          p.get("right"),
          p.get("drive"),
          p.get("map"),
          p.has("lb"),
          p.has("lc"),
          p.has("lv"),
        ].join("|");
      })
      .toContain(pair.left.id);

    const params = viewerParams(page);
    expect(params.get("left")).toBe(pair.left.id);
    expect(params.get("right")).toBe(pair.right.id);
    expect(params.get("drive")).toMatch(/left|right/);
    expect(params.get("map")).toMatch(/0|1/);
    expect(params.get("lb")).toBeTruthy();
    expect(params.get("lc")).toBeTruthy();
    expect(params.get("lv")).toBeTruthy();
    expect(params.get("lvers")).toBe(pair.engId);
    expect(params.get("rvers")).toBe(pair.orgId);

    const snapshot = page.url();
    await page.reload();
    await expect(page).toHaveURL(snapshot);
    await waitForVerseSpans(page);
  });

  test("TC-UI-003: spans render in seq order regardless of scheme", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      lvers: pair.engId,
    });
    const before = await page
      .locator('.verse-span[data-side="left"]')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset.seq ?? ""));
    expect(before.length).toBeGreaterThan(0);
    for (let i = 1; i < before.length; i += 1) {
      expect(Number(before[i])).toBeGreaterThanOrEqual(Number(before[i - 1]));
    }

    await page.getByLabel("left versification").selectOption(pair.leftSchemeId);
    await expect.poll(() => viewerParams(page).get("lvers")).toBe(pair.leftSchemeId);
    await waitForVerseSpans(page);
    const after = await page
      .locator('.verse-span[data-side="left"]')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset.seq ?? ""));
    expect(after).toEqual(before);
  });

  test("TC-UI-004: verse 0 renders as Title (0)", async ({ page }) => {
    const suffix = Date.now().toString(36);
    const left = await ingestProject(page.request, {
      name: `E2E-Verse0-${suffix}`,
      zipPath: verse0ProjectZipPath(),
    });
    const right = await ingestProject(page.request, {
      name: `E2E-Verse0Peer-${suffix}`,
    });
    await openViewerSession(page, {
      left: left.translation.id,
      right: right.translation.id,
      lb: "PSA",
      lc: "1",
      lv: "0",
    });
    const found = await trySelectBcv(page, "left", "PSA", "1", "0");
    expect(found).toBe(true);
    const titleSpan = page.locator('.verse-span[data-verse="0"] .verse-num');
    await expect(titleSpan.first()).toHaveText("Title (0)");
    await expect(page.locator('.verse-span[data-verse="0"]').first()).toHaveAttribute(
      "data-verse",
      "0",
    );
  });

  test("TC-UI-005: drive side controls resolve direction and overlay", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      drive: "left",
      map: true,
      lvers: pair.engId,
      rvers: pair.orgId,
      lb: "PSA",
      lc: "3",
      lv: "1",
    });
    await trySelectBcv(page, "left", "PSA", "3", "1");
    await clickFirstVerse(page, "left");
    await expect.poll(() => viewerParams(page).get("drive")).toBe("left");
    await expect(page.getByLabel("Drive: left → right")).toBeVisible();
    await expect(page.locator(".pair-context")).toContainText("drive: left");
    await expect.poll(async () => connectorCount(page)).toBeGreaterThan(0);

    // Switch drive via URL (follower auto-scroll can briefly lock click→drive).
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      drive: "right",
      map: true,
      lvers: pair.engId,
      rvers: pair.orgId,
      lb: "PSA",
      lc: "3",
      lv: "1",
      rb: "PSA",
      rc: "3",
      rv: "2",
    });
    await expect.poll(() => viewerParams(page).get("drive")).toBe("right");
    await expect(page.getByLabel("Drive: right → left")).toBeVisible();
    await expect(page.locator(".pair-context")).toContainText("drive: right");
    await trySelectBcv(page, "right", "PSA", "3", "2");
    const rightVerse = page.locator('.verse-span[data-side="right"]').nth(1);
    await rightVerse.click();
    await expect
      .poll(async () => connectorCount(page), { timeout: 45_000 })
      .toBeGreaterThan(0);
  });

  test("TC-UI-006: column scheme selection is per-request only", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
    });
    await page.getByLabel("left versification").selectOption(pair.engId);
    await expect.poll(() => viewerParams(page).get("lvers")).toBe(pair.engId);

    await page.getByRole("link", { name: "Translations" }).click();
    await expect(page).toHaveURL(/\/manage\/translations/);
    await expect(page.getByRole("heading", { name: "Translations" })).toBeVisible();
    const preferred = await listAssociations(page.request, pair.left.id);
    const preferredRow = preferred.find((row) => row.preferred);
    expect(preferredRow?.scheme_id).toBe(pair.leftSchemeId);
    expect(preferredRow?.scheme_id).not.toBe(pair.engId);
  });

  test("TC-UI-007: follower loads target chapter; exclude invents no scroll", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
    // Cross-chapter: eng GEN 31:55 maps into org GEN 32.
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      map: true,
      lvers: pair.engId,
      rvers: pair.orgId,
      lb: "GEN",
      lc: "31",
      lv: "55",
    });
    await trySelectBcv(page, "left", "GEN", "31", "55");
    await clickFirstVerse(page, "left");
    // Prefer the verse-55 span when present so resolve uses the cross-chapter mapping.
    const gen55 = page.locator('.verse-span[data-side="left"][data-verse="55"]');
    if ((await gen55.count()) > 0) {
      await gen55.first().click();
    }
    await expect
      .poll(() => {
        const p = viewerParams(page);
        return `${p.get("rb")}|${p.get("rc")}`;
      })
      .toBe("GEN|32");

    // Exclude: seed an exclude scheme and confirm no fabricated follower highlight.
    const excl = await uploadIngredientJson(
      page.request,
      `E2E-Excl-${Date.now().toString(36)}`,
      excludeIngredient(),
    );
    await ensureAssociated(page.request, pair.left.id, excl.id);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      map: true,
      lvers: excl.id,
      rvers: pair.orgId,
      lb: "GEN",
      lc: "1",
      lv: "1",
    });
    await trySelectBcv(page, "left", "GEN", "1", "1");
    await clickFirstVerse(page, "left");
    await expect(page.locator("svg.mapping-overlay circle").first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(
      page.locator('.verse-span[data-side="right"].is-highlighted'),
    ).toHaveCount(0);
  });

  test("TC-UI-009: viewer and manage routes render with cross-links", async ({
    page,
  }) => {
    await deleteAllTranslations(page.request);
    await page.goto("/");
    await waitForEmptyState(page);
    await expect(page.getByRole("link", { name: "Viewer" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Translations" })).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/manage\/translations/),
      page.getByRole("link", { name: "Translations" }).click(),
    ]);
    await expect(page.getByRole("heading", { name: "Translations" })).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/manage\/versifications/),
      page.getByRole("link", { name: "Versifications" }).click(),
    ]);
    await expect(page.getByRole("heading", { name: "Versifications" })).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/($|\?)/),
      page.getByRole("link", { name: "Viewer" }).click(),
    ]);
  });

  test("TC-UI-010: error UX mapping surfaces actionable messages", async ({ page }) => {
    // Provoke 404 via a bogus translation id in the URL; UI should show a toast/banner.
    await page.goto(
      "/?left=00000000-0000-4000-8000-000000000000&right=00000000-0000-4000-8000-000000000001&map=1&drive=left",
    );
    await expect(page.locator(".banner.error-banner, .error-text").first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("TC-UI-020: single-translation placeholder disables second column", async ({
    page,
  }) => {
    // Prefer a metadata-only translation so cleanup stays cheap.
    await deleteAllTranslations(page.request);
    const alone = await createEmptyTranslation(
      page.request,
      `E2E-Only-${Date.now().toString(36)}`,
    );
    await page.goto(`/?left=${alone.id}&map=1&drive=left`);
    await expect(page.getByText("Select a second translation")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByLabel("Mapping")).toBeDisabled();
    const jumpButtons = page.getByRole("button", { name: "Jump" });
    await expect(jumpButtons).toHaveCount(2);
  });

  test("TC-UI-021: in-flight resolve is superseded when driving ref changes", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
    let resolveCount = 0;
    await page.route("**/api/resolve**", async (route) => {
      resolveCount += 1;
      const hit = resolveCount;
      if (hit === 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
      await route.continue();
    });
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      map: true,
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    const verses = page.locator('.verse-span[data-side="left"]');
    await verses.nth(0).click();
    await verses.nth(Math.min(2, (await verses.count()) - 1)).click();
    await expect
      .poll(() => viewerParams(page).get("lv"), { timeout: 30_000 })
      .toBeTruthy();
    // Latest selection should stick; no assertion on intermediate stale highlight.
    await expect(page.locator(".pair-context")).not.toContainText("Resolving…", {
      timeout: 30_000,
    });
  });

  test("TC-UI-022: deleted scheme clears the column override", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    const uploaded = await uploadVersificationFile(
      page.request,
      paratextVrsPath("eng"),
      `E2E-DelScheme-${Date.now().toString(36)}`,
    );
    await ensureAssociated(page.request, pair.left.id, uploaded.id);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      lvers: uploaded.id,
    });
    await expect.poll(() => viewerParams(page).get("lvers")).toBe(uploaded.id);

    // Remove association then delete scheme so override becomes invalid.
    await page.request.delete(
      `/api/translations/${pair.left.id}/versifications/${uploaded.id}`,
    );
    await deleteVersification(page.request, uploaded.id);
    await page.reload();
    await waitForVerseSpans(page);
    await expect.poll(() => viewerParams(page).get("lvers") ?? "").toBe("");
  });

  test("TC-UI-023: no resolve without associated schemes", async ({ page }) => {
    const bare = await createEmptyTranslation(
      page.request,
      `E2E-Bare-${Date.now().toString(36)}`,
    );
    const withData = await ingestProject(page.request, {
      name: `E2E-With-${Date.now().toString(36)}`,
    });
    await page.goto(
      `/?left=${bare.id}&right=${withData.translation.id}&map=1&drive=left`,
    );
    await expect(page.getByLabel("Mapping")).toBeDisabled({ timeout: 30_000 });
    expect(await connectorCount(page)).toBe(0);
  });

  test("TC-UI-024: desktop two-column layout at ≥1280", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
    });
    // Column wrappers use display:contents; measure the verse panels instead.
    const leftPanel = page.locator('.scripture-column[data-side="left"] .verse-list');
    const rightPanel = page.locator('.scripture-column[data-side="right"] .verse-list');
    await expect(leftPanel).toBeVisible();
    await expect(rightPanel).toBeVisible();
    const boxes = await Promise.all([
      leftPanel.boundingBox(),
      rightPanel.boundingBox(),
    ]);
    expect(boxes[0]).toBeTruthy();
    expect(boxes[1]).toBeTruthy();
    expect(boxes[0]!.y).toBeCloseTo(boxes[1]!.y, 0);
    expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  });

  test("TC-UI-025: accessibility floor — labeled controls are keyboard reachable", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
    });
    await expect(page.getByLabel("left translation")).toBeVisible();
    await expect(page.getByLabel("left book")).toBeVisible();
    await expect(page.getByLabel("Mapping")).toBeVisible();
    await page.getByLabel("left translation").focus();
    await expect(page.getByLabel("left translation")).toBeFocused();
    await page.keyboard.press("Tab");
    // Some control after translation should receive focus.
    await expect(page.locator(":focus")).not.toHaveCount(0);
  });

  test("TC-UI-027: independent per-column scrolling keeps overlay present", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      map: true,
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    await clickFirstVerse(page, "left");
    await waitForConnectors(page);
    const before = await connectorCount(page);
    await page
      .locator(".verse-list")
      .first()
      .evaluate((el) => {
        el.scrollTop = Math.min(el.scrollHeight, 200);
      });
    await expect.poll(async () => connectorCount(page)).toBeGreaterThan(0);
    expect(before).toBeGreaterThan(0);
  });

  test("TC-UI-030: per-column BCV selectors update URL", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
    });
    const bookSelect = page.getByLabel("left book");
    const options = await bookSelect.locator("option").allTextContents();
    const book = options.find((o) => o && o !== "—");
    expect(book).toBeTruthy();
    await bookSelect.selectOption(book!);
    await expect.poll(() => viewerParams(page).get("lb")).toBe(book);
    const chapters = await page
      .getByLabel("left chapter")
      .locator("option")
      .allTextContents();
    expect(chapters.length).toBeGreaterThan(0);
    await page.getByLabel("left chapter").selectOption(chapters[0]!);
    await expect.poll(() => viewerParams(page).get("lc")).toBe(chapters[0]!);
    await waitForVerseSpans(page);
    const verseOptions = page.getByLabel("left verse").locator("option");
    const verseCount = await verseOptions.count();
    expect(verseCount).toBeGreaterThan(0);
    const verseValue = await verseOptions.nth(0).getAttribute("value");
    await page.getByLabel("left verse").selectOption(verseValue!);
    await expect.poll(() => viewerParams(page).get("lv")).toBeTruthy();
  });

  test("TC-UI-031: clicking a verse sets column ref and drives resolve", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      map: true,
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    const target = page.locator('.verse-span[data-side="left"]').nth(1);
    const verse = await target.getAttribute("data-verse");
    await target.click();
    await expect.poll(() => viewerParams(page).get("lv")).toBe(verse);
    await expect.poll(() => viewerParams(page).get("drive")).toBe("left");
  });

  test("TC-UI-032: URL defaults applied when params are missing", async ({ page }) => {
    await deleteAllTranslations(page.request);
    const pair = await seedContrastingPair(page.request);
    await page.goto("/");
    await expect.poll(() => viewerParams(page).get("left")).toBeTruthy();
    const params = viewerParams(page);
    expect(params.get("left")).toBeTruthy();
    expect(params.get("right")).toBeTruthy();
    expect(params.get("drive") ?? "left").toBe("left");
    expect(params.get("map") ?? "1").toBe("1");
    expect(params.get("lvers")).toBeNull();
    expect(params.get("rvers")).toBeNull();
    // Defaults pick the first two catalog entries (order from API).
    const catalog = await listTranslations(page.request);
    expect([pair.left.id, pair.right.id]).toEqual(
      expect.arrayContaining([params.get("left"), params.get("right")]),
    );
    expect(catalog.total).toBeGreaterThanOrEqual(2);
    await waitForVerseSpans(page);
  });

  test("TC-UI-033: scheme switch does not show a stale alignment", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      map: true,
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    await clickFirstVerse(page, "left");
    await waitForConnectors(page);
    const seqBefore = await page
      .locator('.verse-span[data-side="left"]')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset.seq ?? ""));

    await page.getByLabel("left versification").selectOption({ index: 0 });
    await expect.poll(() => viewerParams(page).get("lvers") ?? "").toBe("");
    await waitForVerseSpans(page);
    const seqAfter = await page
      .locator('.verse-span[data-side="left"]')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset.seq ?? ""));
    expect(seqAfter).toEqual(seqBefore);
  });

  test("TC-UI-034: follower auto-scroll does not loop resolve", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    let resolveHits = 0;
    await page.route("**/api/resolve?**", async (route) => {
      resolveHits += 1;
      await route.continue();
    });
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      map: true,
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    await clickFirstVerse(page, "left");
    await expect.poll(() => resolveHits, { timeout: 30_000 }).toBeGreaterThan(0);
    const settled = resolveHits;
    await page.waitForTimeout(1500);
    // Allow one settle/retry but not a continuous loop.
    expect(resolveHits - settled).toBeLessThan(4);
  });

  test("TC-UI-035: scheme control options and Preferred (default) clear", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      lvers: pair.engId,
    });
    const select = page.getByLabel("left versification");
    await expect(select.locator("option").first()).toHaveText("Preferred (default)");
    expect(await select.locator("option").count()).toBeGreaterThanOrEqual(2);
    // Non-root schemes include "(based on …)"; preferred ★ is after the full label when present.
    const optionTexts = await select.locator("option").allTextContents();
    const basedOn = optionTexts.filter((t) => t.includes("(based on "));
    expect(basedOn.length).toBeGreaterThan(0);
    await select.selectOption({ index: 0 });
    await expect.poll(() => viewerParams(page).get("lvers") ?? "").toBe("");
  });

  test("TC-UI-036: column scheme override affects resolve and stays in URL", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      map: true,
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    await clickFirstVerse(page, "left");
    await expect.poll(() => viewerParams(page).get("lvers")).toBe(pair.engId);
    const leftJump = page.locator(".scripture-column").first().getByRole("button", {
      name: "Jump",
    });
    await leftJump.click();
    await expect(page.getByRole("heading", { name: "Mapped deltas" })).toBeVisible();
    await page.keyboard.press("Escape").catch(() => undefined);
    // Preferred in Manage unchanged.
    const assocs = await listAssociations(page.request, pair.left.id);
    expect(assocs.find((a) => a.preferred)?.scheme_id).toBe(pair.leftSchemeId);
  });

  test("TC-NAV-005: jump uses navigation object, never parses source_ref", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
    // PSA eng↔org deltas include range labels (e.g. PSA 3:0-8); book filter must match.
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      lvers: pair.engId,
      rvers: pair.orgId,
      lb: "PSA",
      lc: "3",
      lv: "1",
    });
    const leftJump = page.locator(".scripture-column").first().getByRole("button", {
      name: "Jump",
    });
    await leftJump.click();
    await expect(page.getByRole("heading", { name: "Mapped deltas" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText("Loading…")).toHaveCount(0);
    const mappedSection = page.locator(".jump-menu-panel section").first();
    const rangeEntry = mappedSection
      .locator("button.linkish")
      .filter({ hasText: /-/ })
      .first();
    await expect(rangeEntry).toBeVisible({ timeout: 30_000 });
    const label = (await rangeEntry.innerText()).trim();
    expect(label).toMatch(/-/);
    await rangeEntry.evaluate((el: HTMLElement) => el.click());
    await expect.poll(() => viewerParams(page).get("lb")).toBe("PSA");
    // Structured navigation lands on verse_start, never a mis-parsed range token.
    await expect.poll(() => viewerParams(page).get("lv")).toMatch(/^\d+$/);
    expect(viewerParams(page).get("lv")).not.toContain("-");
    expect(label.includes(viewerParams(page).get("lv") ?? "___")).toBeTruthy();
  });

  test("TC-NAV-006: jump menu has three sections", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    await page
      .locator(".scripture-column")
      .first()
      .getByRole("button", { name: "Jump" })
      .click();
    await expect(page.getByRole("heading", { name: "Mapped deltas" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "Misalignments" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Current chapter verses" }),
    ).toBeVisible();
  });

  test("TC-NAV-007: jump selection sets structured BCV", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    await page
      .locator(".scripture-column")
      .first()
      .getByRole("button", { name: "Jump" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Current chapter verses" }),
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Loading…")).toHaveCount(0);
    const verseJump = page
      .locator(".jump-menu-panel section")
      .nth(2)
      .locator("button.linkish")
      .nth(1);
    await verseJump.evaluate((el: HTMLElement) => el.click());
    await expect.poll(() => viewerParams(page).get("lv")).toBeTruthy();
  });

  test("TC-NAV-015: book dropdown markers and legend", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    await expect(page.getByText("● Book has mapping differences")).toHaveCount(2, {
      timeout: 30_000,
    });
    const leftBook = page.getByLabel("left book");
    await expect(leftBook).toHaveAttribute("aria-describedby", "left-book-jump-legend");
    // Legend sits with the Book label (before the select), not under the dropdown.
    const legendBeforeSelect = await leftBook.evaluate((select) => {
      const legend = document.getElementById("left-book-jump-legend");
      return Boolean(
        legend &&
        (legend.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      );
    });
    expect(legendBeforeSelect).toBe(true);
    await expect
      .poll(async () => leftBook.locator('option[value="PSA"]').textContent())
      .toMatch(/PSA ●/);
    await leftBook.selectOption("PSA");
    await expect.poll(() => viewerParams(page).get("lb")).toBe("PSA");
  });

  test("TC-UI-039: drive-direction arrow between columns", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      drive: "left",
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    await expect(page.getByLabel("Drive: left → right")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(".pair-context")).toContainText("drive: left");

    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      drive: "right",
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    await expect(page.getByLabel("Drive: right → left")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(".pair-context")).toContainText("drive: right");

    await deleteAllTranslations(page.request);
    const alone = await createEmptyTranslation(
      page.request,
      `E2E-DriveSolo-${Date.now().toString(36)}`,
    );
    await page.goto(`/?left=${alone.id}`);
    await expect(page.getByText("Select a second translation")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByLabel(/Drive:/)).toHaveCount(0);
  });

  test("TC-NAV-011: counterpart jump disabled with a single translation", async ({
    page,
  }) => {
    await deleteAllTranslations(page.request);
    const alone = await createEmptyTranslation(
      page.request,
      `E2E-NavSolo-${Date.now().toString(36)}`,
    );
    await page.goto(`/?left=${alone.id}`);
    await expect(page.getByText("Select a second translation")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.locator(".scripture-column").nth(1).getByRole("button", { name: "Jump" }),
    ).toBeDisabled();
  });

  test("TC-INGEST-018: UI blocks during upload and surfaces errors inline", async ({
    page,
  }) => {
    await deleteAllTranslations(page.request);
    await page.goto("/");
    await waitForEmptyState(page);
    await page.getByRole("button", { name: /upload project/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Upload project" })).toBeVisible();

    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/ingest/project", async (route) => {
      await gate;
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "Invalid project",
          code: "validation_failed",
          errors: [{ field: "file", message: "missing USX" }],
        }),
      });
    });

    await page.locator('input[type="file"]').setInputFiles(primaryProjectZipPath());
    await page.getByLabel("Translation name").fill("E2E Upload Block");
    await page.getByLabel("Language").fill("en");
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByRole("button", { name: "Uploading…" })).toBeDisabled();
    release?.();
    await expect(page.getByText("Invalid project").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("TC-OOS-002: scripture text is not editable", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
    });
    const text = page.locator(".verse-text").first();
    await expect(text).toBeVisible();
    const editable = await text.evaluate((el) => {
      const node = el as HTMLElement;
      return (
        node.isContentEditable ||
        node.getAttribute("contenteditable") === "true" ||
        node.tagName === "TEXTAREA" ||
        node.tagName === "INPUT"
      );
    });
    expect(editable).toBe(false);
  });
});
