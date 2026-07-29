import { test, expect } from "@playwright/test";
import {
  complexIngredientPair,
  ensureAssociated,
  excludeIngredient,
  partialIngredient,
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
  waitForChapterMappings,
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

    await page.getByLabel("Mapping").selectOption("off");
    await expect.poll(() => viewerParams(page).get("map")).toBe("0");
    await expect.poll(async () => connectorCount(page)).toBe(0);

    await page.getByLabel("Mapping").selectOption("current");
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
    const partialScheme = await uploadIngredientJson(
      page.request,
      `E2E-Partial-${Date.now().toString(36)}`,
      partialIngredient(),
    );
    await ensureAssociated(page.request, pair.left.id, partialScheme.id);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      map: true,
      lvers: partialScheme.id,
      rvers: pair.orgId,
      lb: "GEN",
      lc: "1",
      lv: "1",
      rb: "GEN",
      rc: "1",
      rv: "1",
    });

    const clickPartialJump = async (side: "left" | "right") => {
      await expect(page.getByText("Resolving…")).toHaveCount(0);
      // ViewerSession holds a 400 ms input lock while smooth-scrolling the follower.
      await page.waitForTimeout(450);
      const column = page.locator(`.scripture-column[data-side="${side}"]`);
      await column.getByRole("button", { name: "Jump", exact: true }).click();
      const panel = column.locator(".jump-menu-panel");
      await expect(panel.getByText("Loading…")).toHaveCount(0, {
        timeout: 45_000,
      });
      const mappedSection = panel
        .locator(".jump-menu-section")
        .filter({ hasText: "Mapped deltas" });
      await expect(mappedSection.getByRole("heading")).toContainText("(1)");
      const partialJump = mappedSection.getByRole("button", {
        name: "GEN 1:1 → GEN 1:1",
        exact: true,
      });
      await expect(partialJump).toHaveCount(1);
      await partialJump.click();
    };

    const assertPartialOverlay = async () => {
      await waitForConnectors(page);
      await expect(
        page.locator('svg.mapping-overlay rect[stroke-dasharray="6 4"]'),
      ).toHaveCount(2);
      await expect(
        page.locator('svg.mapping-overlay path[stroke-dasharray="6 4"]'),
      ).toHaveCount(1);
      await expect(page.locator("svg.mapping-overlay text.overlay-label")).toHaveText(
        "part a",
      );
      await expect(
        page.locator('.verse-span[data-side="left"][data-ref="GEN 1:1"].is-highlighted'),
      ).toHaveCount(1);
      await expect(
        page.locator('.verse-span[data-side="right"][data-ref="GEN 1:1"].is-highlighted'),
      ).toHaveCount(1);
    };

    await waitForConnectors(page);
    await clickPartialJump("left");
    await expect.poll(() => viewerParams(page).get("lp")).toBe("a");
    await expect.poll(() => viewerParams(page).get("drive")).toBe("left");
    await assertPartialOverlay();

    await clickPartialJump("right");
    await expect.poll(() => viewerParams(page).get("rp")).toBe("a");
    await expect.poll(() => viewerParams(page).get("drive")).toBe("right");
    await assertPartialOverlay();
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
    await page.getByLabel("Mapping").selectOption("off");
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
    // Drive-right: connectors exist and between-column arrow reflects drive side.
    await expect(page.getByLabel("Drive: right → left")).toBeVisible();
    await expect(page.locator(".pair-context")).toContainText("drive: right");
    expect(await connectorCount(page)).toBeGreaterThan(0);
  });

  test("TC-OVERLAY-012: chapter mode draws multiple dimmed connectors", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      mapMode: "current",
      lvers: pair.engId,
      rvers: pair.orgId,
      lb: "PSA",
      lc: "3",
      lv: "1",
    });
    await trySelectBcv(page, "left", "PSA", "3", "1");
    await clickFirstVerse(page, "left");
    await waitForConnectors(page);
    const currentOnly = await connectorCount(page);

    await page.getByLabel("Mapping").selectOption("All (dimmed)");
    await expect.poll(() => viewerParams(page).get("map")).toBe("all");
    await waitForChapterMappings(page);
    await waitForConnectors(page);
    const chapterMode = await connectorCount(page);
    expect(chapterMode).toBeGreaterThan(currentOnly);
    await expect(page.locator('svg.mapping-overlay g[opacity="0.25"]').first()).toBeAttached();
  });

  test("TC-OVERLAY-013: current mode stays single-alignment with map=1", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      mapMode: "chapter",
      lvers: pair.engId,
      rvers: pair.orgId,
      lb: "GEN",
      lc: "1",
      lv: "1",
    });
    await trySelectBcv(page, "left", "GEN", "1", "1");
    await clickFirstVerse(page, "left");
    await waitForChapterMappings(page);
    await waitForConnectors(page);
    const chapterPaths = await connectorCount(page);

    await page.getByLabel("Mapping").selectOption("current");
    await expect.poll(() => viewerParams(page).get("map")).toBe("1");
    await waitForConnectors(page);
    const currentPaths = await connectorCount(page);
    expect(currentPaths).toBeGreaterThan(0);
    expect(currentPaths).toBeLessThan(chapterPaths);
  });
});
