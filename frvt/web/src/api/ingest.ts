import { apiUpload } from "./client";
import type { ProjectIngestOut } from "./types";

/**
 * Upload a Paratext-style project zip (USX + custom.vrs).
 * Blocks until the synchronous ingest completes.
 */
export function ingestProject(
  file: File,
  name: string,
  language: string,
): Promise<ProjectIngestOut> {
  const form = new FormData();
  form.append("file", file);
  form.append("name", name);
  form.append("language", language);
  return apiUpload<ProjectIngestOut>("/api/ingest/project", form);
}
