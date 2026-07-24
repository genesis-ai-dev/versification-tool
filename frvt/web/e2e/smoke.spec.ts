import { test, expect } from "@playwright/test";

/**
 * Smoke e2e against an already-running FRVT server (external server mode).
 * Phase gate project: smoke.
 */
test.describe("FRVT smoke (external server)", () => {
  test("TC-SERVER-004: manage translations deep link resolves", async ({ page }) => {
    const response = await page.goto("/manage/translations");
    expect(response, "navigation should return a response").not.toBeNull();
    expect(response!.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/manage\/translations/);
    await expect(page.getByRole("heading", { name: "Translations" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

    // Static SPA mount must not shadow /api routes.
    const health = await page.request.get("/api/health");
    expect(health.status(), "GET /api/health should remain an API route").toBe(200);
    const body = await health.json();
    expect(body).toMatchObject({ status: "ok" });
  });
});
