import { test, expect } from "@playwright/test";
import {
  complexIngredientPair,
  ensureAssociated,
  excludeIngredient,
  seedContrastingPair,
  uploadIngredientJson,
} from "./helpers/api";
import {
  clickFirstVerse,
  connectorCount,
  openViewerSession,
  trySelectBcv,
  viewerParams,
  waitForConnectors,
} from "./helpers/viewer";

/**
 * Overlay e2e: map toggle, drive attachment, current-result-only connectors.
 * Associates contrasting eng/org schemes via API for non-identity overlays.
 */
test.describe("Overlay e2e", () => {
  test("TC-OVERLAY-001: map toggle draws current result only", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      map: true,
      drive: "left",
      lvers: pair.engId,
      rvers: pair.orgId,
      lb: "PSA",
      lc: "3",
      lv: "1",
    });
    await trySelectBcv(page, "left", "PSA", "3", "1");
    await clickFirstVerse(page, "left");
    await waitForConnectors(page);
    const withMap = await connectorCount(page);
    expect(withMap).toBeGreaterThan(0);

    await page.locator(".map-toggle input").click();
    await expect.poll(() => viewerParams(page).get("map")).toBe("0");
    await expect.poll(async () => connectorCount(page)).toBe(0);

    await page.locator(".map-toggle input").click();
    await expect.poll(() => viewerParams(page).get("map")).toBe("1");
    await waitForConnectors(page);
    // Current alignment only — connector count stays small (not chapter-wide).
    const again = await connectorCount(page);
    expect(again).toBeGreaterThan(0);
    expect(again).toBeLessThan(40);
  });

  test("TC-OVERLAY-002: topologies for one-to-one / shift connectors present", async ({
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
    // Observable contract: at least one path connector for the current result.
    expect(await connectorCount(page)).toBeGreaterThan(0);
    await expect(page.locator("svg.mapping-overlay path").first()).toBeAttached();
  });

  test("TC-OVERLAY-003: complex multi-edge connectors when present", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
    const suffix = Date.now().toString(36);
    const ingredients = complexIngredientPair();
    const leftScheme = await uploadIngredientJson(
      page.request,
      `E2E-CxL-${suffix}`,
      ingredients.left,
    );
    const rightScheme = await uploadIngredientJson(
      page.request,
      `E2E-CxR-${suffix}`,
      ingredients.right,
    );
    await ensureAssociated(page.request, pair.left.id, leftScheme.id);
    await ensureAssociated(page.request, pair.right.id, rightScheme.id);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      map: true,
      lvers: leftScheme.id,
      rvers: rightScheme.id,
      lb: "GEN",
      lc: "1",
      lv: "1",
    });
    await trySelectBcv(page, "left", "GEN", "1", "1");
    await clickFirstVerse(page, "left");
    await waitForConnectors(page);
    // Complex hull paints one connector path per edge (more than a single blob).
    await expect.poll(async () => connectorCount(page)).toBeGreaterThan(1);
  });

  test("TC-OVERLAY-004: exclude draws void terminator when exclude result occurs", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
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
      page.locator('.verse-span[data-side="left"].is-highlighted').first(),
    ).toBeVisible();
    await expect(page.locator('.verse-span[data-side="right"].is-highlighted')).toHaveCount(
      0,
    );
  });

  test("TC-OVERLAY-005: partial outline/label when part-bearing result occurs", async ({
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
    const labels = page.locator("svg.mapping-overlay text.overlay-label");
    const outlines = page.locator("svg.mapping-overlay rect");
    expect((await outlines.count()) + (await labels.count())).toBeGreaterThan(0);
  });

  test("TC-OVERLAY-006: text highlight independent of map connectors", async ({
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
    await expect(page.locator(".verse-span.is-highlighted").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.locator(".map-toggle input").click();
    await expect.poll(() => viewerParams(page).get("map")).toBe("0");
    await expect.poll(async () => connectorCount(page)).toBe(0);
    await expect(page.locator(".verse-span.is-highlighted").first()).toBeVisible();
  });

  test("TC-OVERLAY-011: drive=right attachment mirrors exits", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      drive: "right",
      map: true,
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    await clickFirstVerse(page, "right");
    await expect.poll(() => viewerParams(page).get("drive")).toBe("right");
    await waitForConnectors(page);
    // Drive-right: connectors exist and toolbar reflects drive side.
    await expect(page.locator(".pair-context")).toContainText("drive: right");
    expect(await connectorCount(page)).toBeGreaterThan(0);
  });

  test("TC-OVERLAY-012: chapter-wide overlay is absent", async ({ page }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      map: true,
      lvers: pair.engId,
      rvers: pair.orgId,
    });
    // Enable map without hunting every delta — only current resolve should paint.
    await clickFirstVerse(page, "left");
    await waitForConnectors(page);
    const paths = await connectorCount(page);
    const leftVerses = await page.locator('.verse-span[data-side="left"]').count();
    // Chapter-wide would approach verse-count scale; current-result stays small.
    expect(paths).toBeLessThan(Math.max(8, Math.floor(leftVerses / 2)));
    expect(paths).toBeGreaterThan(0);
  });
});
