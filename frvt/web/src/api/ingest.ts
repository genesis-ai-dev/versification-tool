import { apiUpload } from "./client";
import type { ProjectIngestOut } from "./types";

/** Optional translation name and language overrides for project ingest. */
export interface IngestProjectOptions {
  /** Translation display name; omitted when metadata.xml supplies it. */
  name?: string;
  /** Language tag; omitted when metadata.xml supplies it. */
  language?: string;
}

/**
 * Upload a Paratext-style project zip (USX + custom.vrs).
 * Blocks until the synchronous ingest completes.
 */
export function ingestProject(
  file: File,
  options: IngestProjectOptions = {},
): Promise<ProjectIngestOut> {
  const form = new FormData();
  form.append("file", file);
  const trimmedName = options.name?.trim();
  const trimmedLanguage = options.language?.trim();
  if (trimmedName) {
    form.append("name", trimmedName);
  }
  if (trimmedLanguage) {
    form.append("language", trimmedLanguage);
  }
  return apiUpload<ProjectIngestOut>("/api/ingest/project", form);
}
