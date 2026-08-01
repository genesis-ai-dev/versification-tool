/**
 * API seeding helpers for Playwright e2e (Basic auth via request context).
 * Fail with clear messages when ingest or catalog calls do not succeed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { APIRequestContext } from "@playwright/test";

/** Minimal translation row returned by list/ingest endpoints. */
export interface TranslationOut {
  id: string;
  name: string;
  language: string;
  text_direction: "ltr" | "rtl";
  source_format: string;
}

/** Scheme summary from versification list/upload. */
export interface VersificationOut {
  id: string;
  name: string;
  based_on_name: string | null;
  based_on_id: string | null;
  canonical: boolean;
  associated_translation_names?: string[];
}

/** Association of a scheme with a translation. */
export interface AssociationOut {
  id: string;
  translation_id: string;
  scheme_id: string;
  preferred: boolean;
}

/** Project ingest success body. */
export interface ProjectIngestOut {
  translation: TranslationOut;
  versification: VersificationOut;
}

/** Paginated list envelope. */
interface Page<T> {
  items: T[];
  total: number;
}

/** Repo root: frvt/web/e2e/helpers → four levels up. */
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

/** Absolute path to the primary sample project zip used by ingest happy paths. */
export function primaryProjectZipPath(): string {
  return path.join(repoRoot, "research", "SampleTranslations", "biblica-spanish-1.zip");
}

/** Absolute path to a second sample zip when two distinct projects are needed. */
export function secondaryProjectZipPath(): string {
  return path.join(repoRoot, "research", "SampleTranslations", "american-standard-1.zip");
}

/** Absolute path to a Paratext VRS file for standalone versification upload. */
export function paratextVrsPath(name: string): string {
  return path.join(repoRoot, "research", "ParatextFormat", `${name}.vrs`);
}

/**
 * Absolute path to the minimal PSA verse-0 project zip (Title (0) fixture).
 * Built under frvt/testops/fixtures/assets for e2e cases that need verse 0 text.
 */
export function verse0ProjectZipPath(): string {
  return path.join(
    repoRoot,
    "frvt",
    "testops",
    "fixtures",
    "assets",
    "psa-verse0-project.zip",
  );
}

/**
 * Assert a response succeeded; throw with status + body snippet on failure.
 * Use after every seed call so e2e failures point at API readiness, not UI flakes.
 */
async function assertOk(
  response: { ok: () => boolean; status: () => number; text: () => Promise<string> },
  action: string,
): Promise<void> {
  if (response.ok()) {
    return;
  }
  const body = (await response.text()).slice(0, 500);
  throw new Error(
    `API seed failed (${action}): HTTP ${response.status()}. ` +
      `Is the FRVT server running at the e2e base URL with Postgres up? Body: ${body}`,
  );
}

/**
 * Ingest a project zip via multipart POST /api/ingest/project.
 * Defaults to the primary sample zip; fails clearly when the file is missing.
 */
export async function ingestProject(
  request: APIRequestContext,
  options: {
    name: string;
    language?: string;
    zipPath?: string;
  },
): Promise<ProjectIngestOut> {
  const zipPath = options.zipPath ?? primaryProjectZipPath();
  if (!fs.existsSync(zipPath)) {
    throw new Error(
      `API seed failed (ingest project): sample zip not found at ${zipPath}`,
    );
  }
  const multipart: {
    file: { name: string; mimeType: string; buffer: Buffer };
    name?: string;
    language?: string;
  } = {
    file: {
      name: path.basename(zipPath),
      mimeType: "application/zip",
      buffer: fs.readFileSync(zipPath),
    },
    name: options.name,
  };
  if (options.language !== undefined) {
    multipart.language = options.language;
  }
  const response = await request.post("/api/ingest/project", {
    multipart,
  });
  await assertOk(response, `ingest project "${options.name}"`);
  return (await response.json()) as ProjectIngestOut;
}

/** List user translations (anchors excluded server-side). */
export async function listTranslations(
  request: APIRequestContext,
): Promise<Page<TranslationOut>> {
  const response = await request.get("/api/translations", {
    params: { limit: 500 },
  });
  await assertOk(response, "list translations");
  return (await response.json()) as Page<TranslationOut>;
}

/** Delete one translation by id (cascades spans/associations). */
export async function deleteTranslation(
  request: APIRequestContext,
  translationId: string,
): Promise<void> {
  // Full-bible cascades can take well over the default API timeout.
  const response = await request.delete(`/api/translations/${translationId}`, {
    timeout: 180_000,
  });
  if (response.status() === 404) {
    return;
  }
  if (response.status() !== 204 && !response.ok()) {
    await assertOk(response, `delete translation ${translationId}`);
  }
}

/**
 * Delete every user translation so empty/one-translation UI states are reachable.
 * Safe on a dedicated e2e database; do not point at shared production data.
 */
/**
 * Delete every user translation so empty/one-translation UI states are reachable.
 * Prefers a fast SQL wipe via the testops runner; this API path is a fallback.
 */
export async function deleteAllTranslations(request: APIRequestContext): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    const page = await listTranslations(request);
    if (page.items.length === 0) {
      return;
    }
    // Prefer deleting empty shells first (fast), then any remaining projects.
    const ordered = [...page.items].sort((a, b) => a.name.localeCompare(b.name));
    for (const item of ordered) {
      try {
        await deleteTranslation(request, item.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/HTTP 404/.test(message)) {
          continue;
        }
        await new Promise((r) => setTimeout(r, 250));
        try {
          await deleteTranslation(request, item.id);
        } catch {
          // Continue wiping remaining rows; leftover check below is authoritative.
        }
      }
    }
  }
  const leftover = await listTranslations(request);
  if (leftover.items.length > 0) {
    throw new Error(
      `API seed failed (delete all): ${leftover.items.length} translations remain after cleanup`,
    );
  }
}

/** List versification schemes (optionally canonical-only). */
export async function listVersifications(
  request: APIRequestContext,
  options?: { canonical?: boolean },
): Promise<Page<VersificationOut>> {
  const params: Record<string, string | number | boolean> = { limit: 500 };
  if (options?.canonical !== undefined) {
    params.canonical = options.canonical;
  }
  const response = await request.get("/api/versifications", { params });
  await assertOk(response, "list versifications");
  return (await response.json()) as Page<VersificationOut>;
}

/** Find a canonical scheme by lowercase name (e.g. eng, org). */
export async function findCanonicalScheme(
  request: APIRequestContext,
  name: string,
): Promise<VersificationOut> {
  const page = await listVersifications(request, { canonical: true });
  const match = page.items.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!match) {
    throw new Error(
      `API seed failed (find canonical "${name}"): scheme not in bootstrap catalog`,
    );
  }
  return match;
}

/** List associations for a translation. */
export async function listAssociations(
  request: APIRequestContext,
  translationId: string,
): Promise<AssociationOut[]> {
  const response = await request.get(`/api/translations/${translationId}/versifications`);
  await assertOk(response, `list associations for ${translationId}`);
  return (await response.json()) as AssociationOut[];
}

/** Associate an existing scheme with a translation. */
export async function associateScheme(
  request: APIRequestContext,
  translationId: string,
  schemeId: string,
): Promise<AssociationOut> {
  const response = await request.post(
    `/api/translations/${translationId}/versifications`,
    { data: { scheme_id: schemeId } },
  );
  await assertOk(response, `associate scheme ${schemeId} → ${translationId}`);
  return (await response.json()) as AssociationOut;
}

/** Make an association preferred for a translation. */
export async function setPreferredScheme(
  request: APIRequestContext,
  translationId: string,
  schemeId: string,
): Promise<AssociationOut> {
  const response = await request.put(
    `/api/translations/${translationId}/versifications/${schemeId}/preferred`,
  );
  await assertOk(response, `set preferred ${schemeId} on ${translationId}`);
  return (await response.json()) as AssociationOut;
}

/**
 * Associate a scheme when missing; no-op when already associated.
 * Prefer this in seed helpers that may re-run against leftover data.
 */
export async function ensureAssociated(
  request: APIRequestContext,
  translationId: string,
  schemeId: string,
): Promise<AssociationOut> {
  const existing = await listAssociations(request, translationId);
  const found = existing.find((row) => row.scheme_id === schemeId);
  if (found) {
    return found;
  }
  return associateScheme(request, translationId, schemeId);
}

/** Upload a standalone versification file (VRS or JSON). */
export async function uploadVersificationFile(
  request: APIRequestContext,
  filePath: string,
  name?: string,
): Promise<VersificationOut> {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `API seed failed (upload versification): file not found at ${filePath}`,
    );
  }
  const multipart: Record<
    string,
    string | { name: string; mimeType: string; buffer: Buffer }
  > = {
    file: {
      name: path.basename(filePath),
      mimeType: filePath.endsWith(".json") ? "application/json" : "text/plain",
      buffer: fs.readFileSync(filePath),
    },
  };
  if (name) {
    multipart.name = name;
  }
  const response = await request.post("/api/versifications/upload", { multipart });
  await assertOk(response, `upload versification ${path.basename(filePath)}`);
  return (await response.json()) as VersificationOut;
}

/**
 * Upload a Copenhagen-style ingredient JSON object as a user versification scheme.
 * Use for exclude/merge/complex overlay seeds that sample eng/org pairs lack.
 */
export async function uploadIngredientJson(
  request: APIRequestContext,
  name: string,
  ingredient: Record<string, unknown>,
): Promise<VersificationOut> {
  const buffer = Buffer.from(JSON.stringify(ingredient), "utf-8");
  const response = await request.post("/api/versifications/upload", {
    multipart: {
      file: {
        name: `${name}.json`,
        mimeType: "application/json",
        buffer,
      },
      name,
    },
  });
  await assertOk(response, `upload ingredient JSON "${name}"`);
  return (await response.json()) as VersificationOut;
}

/** Copenhagen ingredient that excludes GEN 1:1 for overlay void-terminator cases. */
export function excludeIngredient(basedOn = "org"): Record<string, unknown> {
  return {
    basedOn,
    maxVerses: { GEN: ["1"] },
    excludedVerses: ["GEN 1:1"],
    mappedVerses: {},
    partialVerses: {},
    mergedVerses: [],
  };
}

/** Copenhagen ingredient that marks GEN 1:1 part a over an org base. */
export function partialIngredient(basedOn = "org"): Record<string, unknown> {
  return {
    basedOn,
    maxVerses: { GEN: ["31"] },
    excludedVerses: [],
    mappedVerses: {},
    partialVerses: { "GEN 1:1": ["a"] },
    mergedVerses: [],
  };
}

/**
 * Pair of ingredients that resolve GEN 1:1 as a complex hull (shared pivot merge).
 * Left owns GEN 1:1-2 → GEN 1:1; right owns GEN 1:10-11 → GEN 1:1.
 */
export function complexIngredientPair(basedOn = "org"): {
  left: Record<string, unknown>;
  right: Record<string, unknown>;
} {
  return {
    left: {
      basedOn,
      maxVerses: { GEN: ["31"] },
      excludedVerses: [],
      mappedVerses: { "GEN 1:1-2": "GEN 1:1" },
      partialVerses: {},
      mergedVerses: ["GEN 1:1-2"],
    },
    right: {
      basedOn,
      maxVerses: { GEN: ["31"] },
      excludedVerses: [],
      mappedVerses: { "GEN 1:10-11": "GEN 1:1" },
      partialVerses: {},
      mergedVerses: ["GEN 1:10-11"],
    },
  };
}

/** Delete a versification when unassociated (expects 204). */
export async function deleteVersification(
  request: APIRequestContext,
  schemeId: string,
): Promise<void> {
  const response = await request.delete(`/api/versifications/${schemeId}`);
  if (response.status() !== 204 && !response.ok()) {
    await assertOk(response, `delete versification ${schemeId}`);
  }
}

/** Rename a translation via PATCH. */
export async function renameTranslation(
  request: APIRequestContext,
  translationId: string,
  name: string,
): Promise<TranslationOut> {
  const response = await request.patch(`/api/translations/${translationId}`, {
    data: { name },
  });
  await assertOk(response, `rename translation ${translationId}`);
  return (await response.json()) as TranslationOut;
}

/** Create an empty translation shell (no spans/associations). */
export async function createEmptyTranslation(
  request: APIRequestContext,
  name: string,
  language = "en",
): Promise<TranslationOut> {
  const response = await request.post("/api/translations", {
    data: { name, language, source_format: "usx" },
  });
  await assertOk(response, `create translation "${name}"`);
  return (await response.json()) as TranslationOut;
}

/**
 * Seed two user translations with eng/org associated for non-identity overlays.
 * Returns left (eng) and right (org) translation ids plus scheme ids.
 */
export async function seedContrastingPair(request: APIRequestContext): Promise<{
  left: TranslationOut;
  right: TranslationOut;
  leftSchemeId: string;
  rightSchemeId: string;
  engId: string;
  orgId: string;
}> {
  const suffix = Date.now().toString(36);
  const leftIngest = await ingestProject(request, {
    name: `E2E-Left-${suffix}`,
    zipPath: primaryProjectZipPath(),
  });
  const rightIngest = await ingestProject(request, {
    name: `E2E-Right-${suffix}`,
    zipPath: secondaryProjectZipPath(),
  });
  // Confirm both rows are readable before associating (guards mid-seed wipe races).
  for (const id of [leftIngest.translation.id, rightIngest.translation.id]) {
    let lastStatus = 0;
    let lastBody = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const probe = await request.get(`/api/translations/${id}`);
      lastStatus = probe.status();
      if (probe.ok()) {
        break;
      }
      lastBody = (await probe.text()).slice(0, 300);
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      if (attempt === 4) {
        throw new Error(
          `API seed failed (verify seeded translation ${id}): HTTP ${lastStatus}. ` +
            `Is the FRVT server running at the e2e base URL with Postgres up? Body: ${lastBody}`,
        );
      }
    }
  }
  const eng = await findCanonicalScheme(request, "eng");
  const org = await findCanonicalScheme(request, "org");
  await ensureAssociated(request, leftIngest.translation.id, eng.id);
  await ensureAssociated(request, rightIngest.translation.id, org.id);
  return {
    left: leftIngest.translation,
    right: rightIngest.translation,
    leftSchemeId: leftIngest.versification.id,
    rightSchemeId: rightIngest.versification.id,
    engId: eng.id,
    orgId: org.id,
  };
}

/**
 * Ensure at least one ingested translation exists; ingest primary if catalog empty.
 * Returns the first translation (and may create it).
 */
export async function ensureAtLeastOneTranslation(
  request: APIRequestContext,
): Promise<TranslationOut> {
  const page = await listTranslations(request);
  if (page.items[0]) {
    return page.items[0];
  }
  const ingested = await ingestProject(request, {
    name: `E2E-Solo-${Date.now().toString(36)}`,
  });
  return ingested.translation;
}

/** Paths to generated visual-demo project zips (created by Python testops builders). */
export function visualDemoZipPath(language: "en" | "es"): string {
  return path.join(
    repoRoot,
    "frvt",
    "testops",
    "fixtures",
    "assets",
    `visual-demo-${language}.zip`,
  );
}

/** Path to the Arabic sample translation zip for RTL layout checks. */
export function arabicSampleZipPath(): string {
  return path.join(repoRoot, "research", "SampleTranslations", "biblica-arabic-1.zip");
}

function demoMaxVersesSubset(): Record<string, string[]> {
  return {
    JHN: Array.from({ length: 21 }, () => "25"),
    PSA: Array.from({ length: 150 }, (_, i) => String((i % 20) + 5)),
    GEN: Array.from({ length: 50 }, () => "30"),
    ACT: Array.from({ length: 28 }, () => "30"),
    SIR: Array.from({ length: 51 }, () => "20"),
  };
}

function schemeAIngredient(): Record<string, unknown> {
  return {
    basedOn: "org",
    maxVerses: demoMaxVersesSubset(),
    mappedVerses: {
      "PSA 3:0-8": "PSA 3:1-9",
      "GEN 31:55": "GEN 32:1",
      "GEN 2:1": "GEN 2:2",
      "GEN 2:5-7": "GEN 2:4-5",
      "GEN 1:1-2": "GEN 1:1",
    },
    excludedVerses: ["ACT 24:7"],
    mergedVerses: ["GEN 1:1-2"],
    partialVerses: { "SIR 36:13": ["a"] },
  };
}

function schemeBIngredient(): Record<string, unknown> {
  return {
    basedOn: "org",
    maxVerses: demoMaxVersesSubset(),
    mappedVerses: {
      "PSA 3:1-8": "PSA 3:2-9",
      "GEN 31:55": "GEN 32:1",
      "GEN 2:1": "GEN 3:1",
      "GEN 1:10-11": "GEN 1:1",
    },
    excludedVerses: [],
    mergedVerses: ["GEN 1:10-11"],
    partialVerses: {},
  };
}

/** Visual demo corpus seed return shape (mirrors pytest ``seed_visual_demo_corpus``). */
export interface VisualDemoSeedOut {
  enTranslationId: string;
  esTranslationId: string;
  schemes: Record<string, string>;
}

/**
 * Seed Visual Demo Corpus translations and schemes for e2e overlay walks.
 * Requires pre-built zips under ``frvt/testops/fixtures/assets/visual-demo-*.zip``
 * (run Python ``demo_project_zip_path`` once). Does not insert partial DB spans.
 */
export async function seedVisualDemoCorpus(
  request: APIRequestContext,
): Promise<VisualDemoSeedOut> {
  const enPath = visualDemoZipPath("en");
  const esPath = visualDemoZipPath("es");
  for (const zipPath of [enPath, esPath]) {
    if (!fs.existsSync(zipPath)) {
      throw new Error(
        `API seed failed (visual demo): missing ${zipPath}. ` +
          "Generate zips via Python testops demo_project_zip_path first.",
      );
    }
  }
  const enIngest = await ingestProject(request, {
    name: `E2E-VisualDemo-EN-${Date.now().toString(36)}`,
    language: "en",
    zipPath: enPath,
  });
  const esIngest = await ingestProject(request, {
    name: `E2E-VisualDemo-ES-${Date.now().toString(36)}`,
    language: "es",
    zipPath: esPath,
  });
  const schemes: Record<string, string> = {
    "identity-en": enIngest.versification.id,
    "identity-es": esIngest.versification.id,
  };
  const uploads: Array<[string, Record<string, unknown>]> = [
    ["visual-demo-scheme-a", schemeAIngredient()],
    ["visual-demo-scheme-b", schemeBIngredient()],
    [
      "visual-demo-lxx",
      { ...schemeAIngredient(), mappedVerses: { "PSA 3:0-8": "PSA 3:1-9" } },
    ],
    [
      "visual-demo-synodal",
      {
        basedOn: "org",
        maxVerses: demoMaxVersesSubset(),
        mappedVerses: { "GEN 31:55": "GEN 32:1" },
        excludedVerses: [],
        mergedVerses: [],
        partialVerses: {},
      },
    ],
    [
      "visual-demo-nt-omit",
      {
        basedOn: "org",
        maxVerses: demoMaxVersesSubset(),
        mappedVerses: {},
        excludedVerses: ["ACT 24:7"],
        mergedVerses: [],
        partialVerses: {},
      },
    ],
  ];
  const logicalNames: Record<string, string> = {
    "visual-demo-scheme-a": "scheme-a",
    "visual-demo-scheme-b": "scheme-b",
    "visual-demo-lxx": "visual-demo-lxx",
    "visual-demo-synodal": "visual-demo-synodal",
    "visual-demo-nt-omit": "visual-demo-nt-omit",
  };
  for (const [uploadName, ingredient] of uploads) {
    const uploaded = await uploadIngredientJson(request, uploadName, ingredient);
    const logical = logicalNames[uploadName] ?? uploadName;
    schemes[logical] = uploaded.id;
    await ensureAssociated(request, enIngest.translation.id, uploaded.id);
    await ensureAssociated(request, esIngest.translation.id, uploaded.id);
  }
  const psalmA = await uploadIngredientJson(
    request,
    "visual-demo-psalm-a",
    psalmStyleA(),
  );
  const psalmB = await uploadIngredientJson(
    request,
    "visual-demo-psalm-b",
    psalmStyleB(),
  );
  schemes["psalm-a"] = psalmA.id;
  schemes["psalm-b"] = psalmB.id;
  await ensureAssociated(request, enIngest.translation.id, psalmA.id);
  await ensureAssociated(request, enIngest.translation.id, psalmB.id);
  await ensureAssociated(request, esIngest.translation.id, psalmA.id);
  await ensureAssociated(request, esIngest.translation.id, psalmB.id);
  return {
    enTranslationId: enIngest.translation.id,
    esTranslationId: esIngest.translation.id,
    schemes,
  };
}

function psalmStyleA(basedOn = "org"): Record<string, unknown> {
  return {
    basedOn,
    maxVerses: { PSA: ["150"], "1SA": ["31"], GEN: ["50"] },
    excludedVerses: [],
    mappedVerses: {
      "PSA 3:1-8": "PSA 3:2-9",
      "1SA 20:42": "1SA 21:1",
      "GEN 31:55": "GEN 32:1",
    },
    partialVerses: {},
    mergedVerses: [],
  };
}

function psalmStyleB(basedOn = "org"): Record<string, unknown> {
  return {
    basedOn,
    maxVerses: { PSA: ["150"] },
    excludedVerses: [],
    mappedVerses: { "PSA 3:0-8": "PSA 3:1-9" },
    partialVerses: {},
    mergedVerses: [],
  };
}
