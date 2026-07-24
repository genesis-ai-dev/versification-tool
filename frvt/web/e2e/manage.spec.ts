import { test, expect } from "@playwright/test";
import {
  deleteAllTranslations,
  ensureAssociated,
  findCanonicalScheme,
  ingestProject,
  listAssociations,
  listTranslations,
  listVersifications,
  paratextVrsPath,
  primaryProjectZipPath,
  seedContrastingPair,
  setPreferredScheme,
  uploadVersificationFile,
} from "./helpers/api";
import { openViewerSession, viewerParams, waitForVerseSpans } from "./helpers/viewer";

/**
 * Manage CRUD and out-of-scope confirmation e2e.
 * Modals must not change the URL route; preferred removal stays blocked in UI.
 */
test.describe("Manage e2e", () => {
  test("TC-MANAGE-001: translations manage CRUD workflow", async ({ page }) => {
    await deleteAllTranslations(page.request);
    const suffix = Date.now().toString(36);
    await ingestProject(page.request, {
      name: `E2E-Manage-${suffix}`,
      zipPath: primaryProjectZipPath(),
    });

    await page.goto("/manage/translations");
    await expect(page.getByRole("heading", { name: "Translations" })).toBeVisible();
    await expect(page.getByText(`E2E-Manage-${suffix}`)).toBeVisible();

    // Rename via modal (URL must stay on manage/translations).
    await page.getByRole("button", { name: "Rename" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/manage/translations");
    await page.getByRole("textbox", { name: "Name" }).fill(`E2E-Renamed-${suffix}`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(`E2E-Renamed-${suffix}`)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/manage/translations");

    // Associate a canonical scheme.
    await page.getByRole("button", { name: "Associate" }).first().click();
    const associateDialog = page.getByRole("dialog");
    await expect(associateDialog).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/manage/translations");
    await associateDialog.getByRole("button", { name: "Associate" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Upload another project via modal.
    await page.getByRole("button", { name: "Upload project" }).click();
    await expect(page.getByRole("heading", { name: "Upload project" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/manage/translations");
    await page.locator('input[type="file"]').setInputFiles(primaryProjectZipPath());
    await page.getByLabel("Translation name").fill(`E2E-Upload-${suffix}`);
    await page.getByLabel("Language").fill("en");
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByText(`E2E-Upload-${suffix}`)).toBeVisible({
      timeout: 120_000,
    });

    // Delete the uploaded translation (confirm modal). Full-project cascades are slow.
    const row = page.locator("tr", { hasText: `E2E-Upload-${suffix}` });
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Delete translation" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/manage/translations");
    await page.getByRole("button", { name: "Delete" }).last().click();
    await expect(page.getByRole("heading", { name: "Delete translation" })).toHaveCount(0, {
      timeout: 180_000,
    });
    await expect(page.getByText(`E2E-Upload-${suffix}`)).toHaveCount(0, {
      timeout: 60_000,
    });
  });

  test("TC-MANAGE-002: versifications manage workflow incl. delete unassociated", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const schemeName = `E2E-Vrs-${suffix}`;
    await uploadVersificationFile(page.request, paratextVrsPath("eng"), schemeName);

    await page.goto("/manage/versifications");
    await expect(page.getByRole("heading", { name: "Versifications" })).toBeVisible();
    await expect(page.getByText(schemeName)).toBeVisible();

    const row = page.locator("tr", { hasText: schemeName });
    await row.getByRole("button", { name: "Rename" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/manage/versifications");
    const renamed = `${schemeName}-renamed`;
    await page.getByRole("textbox", { name: "Name" }).fill(renamed);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(renamed)).toBeVisible();

    // Upload another standalone scheme via UI.
    await page.getByRole("button", { name: "Upload versification" }).click();
    await expect(page.getByRole("heading", { name: "Upload versification" })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(paratextVrsPath("org"));
    await page.getByLabel(/Display name/i).fill(`E2E-VrsUp-${suffix}`);
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByText(`E2E-VrsUp-${suffix}`)).toBeVisible({ timeout: 60_000 });

    // Delete the unassociated renamed scheme.
    const deleteRow = page.locator("tr", { hasText: renamed });
    await deleteRow.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Delete versification" })).toBeVisible();
    await page.getByRole("button", { name: "Delete" }).last().click();
    await expect(page.locator("tbody tr").filter({ hasText: renamed })).toHaveCount(0);
  });

  test("TC-MANAGE-003: removing the preferred association is blocked", async ({
    page,
  }) => {
    await deleteAllTranslations(page.request);
    const ingested = await ingestProject(page.request, {
      name: `E2E-Pref-${Date.now().toString(36)}`,
    });
    await page.goto("/manage/translations");
    await expect(page.getByText(ingested.translation.name)).toBeVisible();
    // Preferred scheme shows "(preferred)" without a Remove action.
    const preferredItem = page.locator("li", { hasText: "(preferred)" }).first();
    await expect(preferredItem).toBeVisible();
    await expect(preferredItem.getByRole("button", { name: "Remove" })).toHaveCount(0);
  });

  test("TC-MANAGE-004: upload and associate are separate steps", async ({ page }) => {
    await deleteAllTranslations(page.request);
    const ingested = await ingestProject(page.request, {
      name: `E2E-AssocSep-${Date.now().toString(36)}`,
    });
    const suffix = Date.now().toString(36);
    const schemeName = `E2E-Standalone-${suffix}`;

    await page.goto("/manage/versifications");
    await page.getByRole("button", { name: "Upload versification" }).click();
    await page.locator('input[type="file"]').setInputFiles(paratextVrsPath("eng"));
    await page.getByLabel(/Display name/i).fill(schemeName);
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByText(schemeName)).toBeVisible({ timeout: 60_000 });

    // Scheme exists unassociated until Translations → Associate.
    const schemes = await listVersifications(page.request);
    const uploaded = schemes.items.find((s) => s.name === schemeName);
    expect(uploaded).toBeTruthy();
    const before = await listAssociations(page.request, ingested.translation.id);
    expect(before.some((a) => a.scheme_id === uploaded!.id)).toBe(false);

    await page.getByRole("link", { name: "Translations" }).click();
    await page.getByRole("button", { name: "Associate" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("select").selectOption(uploaded!.id);
    await dialog.getByRole("button", { name: "Associate" }).click();
    await expect(page.getByText(schemeName)).toBeVisible();
    const after = await listAssociations(page.request, ingested.translation.id);
    expect(after.some((a) => a.scheme_id === uploaded!.id)).toBe(true);
  });

  test("TC-MANAGE-005: manage actions are local-state modals, not routes", async ({
    page,
  }) => {
    await deleteAllTranslations(page.request);
    await ingestProject(page.request, {
      name: `E2E-Modal-${Date.now().toString(36)}`,
    });
    await page.goto("/manage/translations");
    const pathBefore = new URL(page.url()).pathname;

    for (const label of ["Upload project", "Rename", "Associate", "Delete"] as const) {
      await page.getByRole("button", { name: label }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(pathBefore);
      await page.getByRole("button", { name: "Close" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }

    // Preferred has no Remove; associate a second scheme to exercise remove-assoc modal.
    const pageData = await listTranslations(page.request);
    const eng = await findCanonicalScheme(page.request, "eng");
    await ensureAssociated(page.request, pageData.items[0]!.id, eng.id);
    await page.reload();
    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByRole("heading", { name: "Remove association" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(pathBefore);
    await page.getByRole("button", { name: "Close" }).click();
  });

  test("TC-MANAGE-006: set preferred in Manage does not reset viewer override", async ({
    page,
  }) => {
    const pair = await seedContrastingPair(page.request);
    await openViewerSession(page, {
      left: pair.left.id,
      right: pair.right.id,
      lvers: pair.engId,
    });
    await expect.poll(() => viewerParams(page).get("lvers")).toBe(pair.engId);
    const viewerUrl = page.url();

    // Make eng preferred in Manage (was project scheme).
    await setPreferredScheme(page.request, pair.left.id, pair.engId);
    const assocs = await listAssociations(page.request, pair.left.id);
    expect(assocs.find((a) => a.scheme_id === pair.engId)?.preferred).toBe(true);

    await page.goto(viewerUrl);
    await waitForVerseSpans(page);
    await expect.poll(() => viewerParams(page).get("lvers")).toBe(pair.engId);
  });

  test("TC-MANAGE-010: delete confirmation modal cancel leaves data", async ({
    page,
  }) => {
    await deleteAllTranslations(page.request);
    const ingested = await ingestProject(page.request, {
      name: `E2E-CancelDel-${Date.now().toString(36)}`,
    });
    await page.goto("/manage/translations");
    await page.getByRole("button", { name: "Delete" }).first().click();
    await expect(page.getByRole("heading", { name: "Delete translation" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(ingested.translation.name)).toBeVisible();
    const still = await listTranslations(page.request);
    expect(still.items.some((t) => t.id === ingested.translation.id)).toBe(true);
  });

  test("TC-MANAGE-011: conflict responses produce actionable UX", async ({ page }) => {
    await deleteAllTranslations(page.request);
    const ingested = await ingestProject(page.request, {
      name: `E2E-Conflict-${Date.now().toString(36)}`,
    });
    await page.goto("/manage/versifications");
    // Deleting a scheme still associated with the translation should 409.
    const schemeName = ingested.versification.name;
    const row = page.locator("tbody tr").filter({ hasText: schemeName }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: "Delete versification" })).toBeVisible();
    await page.getByRole("button", { name: "Delete" }).last().click();
    // Conflict may surface as inline error text, banner, or a still-open dialog message.
    await expect
      .poll(async () => {
        const inline = await page.locator(".error-text, .error-banner, .banner").count();
        const dialogText = await page.getByRole("dialog").innerText().catch(() => "");
        return inline > 0 || /conflict|associated|cannot delete|in use/i.test(dialogText);
      })
      .toBe(true);
  });

  test("TC-OOS-001: no versification sniffer/detector in UI", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/sniffer|detect versification|auto-detect/i)).toHaveCount(
      0,
    );
    await page.goto("/manage/versifications");
    await expect(page.getByRole("heading", { name: "Versifications" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sniff|detect|auto.?detect/i }),
    ).toHaveCount(0);
    // Unknown /api/sniffer is not a real endpoint — SPA may HTML-fallback (200),
    // but must not return a sniffer JSON API payload.
    const sniff = await page.request.get("/api/sniffer");
    const contentType = sniff.headers()["content-type"] ?? "";
    if (contentType.includes("application/json")) {
      const body = await sniff.json();
      expect(body).not.toHaveProperty("detected");
      expect(body).not.toHaveProperty("sniffer");
    } else {
      expect(contentType).toMatch(/text\/html/);
    }
  });
});
