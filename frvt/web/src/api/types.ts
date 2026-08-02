/**
 * API DTO mirrors for the FRVT HTTP contract.
 * Keep field names aligned with the server response models.
 */

/** Mapping classification vocabulary returned by resolve and jump endpoints. */
export type RelationType =
  | "one_to_one"
  | "shift"
  | "renumber"
  | "split"
  | "merge"
  | "exclude"
  | "partial"
  | "complex"
  | "range";

/** Public translation row (canonical anchors are excluded server-side). */
export interface TranslationOut {
  id: string;
  name: string;
  language: string;
  text_direction: "ltr" | "rtl";
  source_format: string;
  created_at: string;
  updated_at: string;
}

/** One scripture span for column rendering, ordered by ``seq``. */
export interface VerseSpanOut {
  id: string;
  seq: number;
  book: string;
  chapter: number;
  verse: number;
  part: string | null;
  verse_label: string | null;
  verse_range: string | null;
  content: string;
}

/** Scheme summary without the full ingredient payload. */
export interface VersificationOut {
  id: string;
  name: string;
  based_on_name: string | null;
  based_on_id: string | null;
  canonical: boolean;
  created_at: string;
  updated_at: string;
  /** Non-anchor translations associated with this scheme; populated on list. */
  associated_translation_names: string[];
}

/** Scheme detail including the stored Copenhagen ingredient. */
export interface VersificationDetailOut extends VersificationOut {
  ingredient: Record<string, unknown>;
}

/** Association of a scheme with a translation, including preferred flag. */
export interface AssociationOut {
  id: string;
  translation_id: string;
  scheme_id: string;
  preferred: boolean;
}

/** Denormalized single-verse span with structured coordinates for the UI. */
export interface ResolvedSpan {
  ref: string;
  book: string;
  chapter: number;
  verse: number;
  seq: number | null;
  part: string | null;
  verse_label?: string | null;
  verse_range?: string | null;
}

/** One connector for a ``complex`` resolve result. */
export interface ResolveEdge {
  source_index: number;
  target_index: number;
  relation: RelationType;
}

/** Resolve response with denormalized spans and optional complex edges. */
export interface ResolveResult {
  source_spans: ResolvedSpan[];
  target_spans: ResolvedSpan[];
  relation: RelationType;
  edges: ResolveEdge[];
  /** Present only for composed hulls with a non-identity source axis. */
  source_rel?: RelationType;
  /** Present only for composed hulls with a non-identity target axis. */
  target_rel?: RelationType;
}

/** Book with available chapter numbers for navigation selectors. */
export interface NavBook {
  book: string;
  chapters: number[];
}

/** Structured single-verse navigation target (UI never parses ranges). */
export interface NavRef {
  book: string;
  chapter: number;
  verse: number;
  part: string | null;
}

/** Explicit mapping delta between two schemes for the jump menu. */
export interface DeltaEntry {
  source_ref: string;
  base_ref: string | null;
  relation: RelationType;
  navigation_ref: string;
  navigation: NavRef;
}

/** Categorized misalignment entry for the jump menu. */
export interface MisalignmentEntry {
  category: string;
  source_ref: string;
  relation: RelationType;
  navigation_ref: string;
  navigation: NavRef;
}

/** Paginated collection envelope ``{items, total}``. */
export interface Page<T> {
  items: T[];
  total: number;
}

/** Combined jump-menu deltas and misalignments from one filtered server pass. */
export interface JumpMenuEntries {
  deltas: Page<DeltaEntry>;
  misalignments: Page<MisalignmentEntry>;
}

/** Distinct from-side books with jump-relevant mapping differences. */
export interface JumpBooksOut {
  books: string[];
}

/** Success body for project ingest (translation plus preferred scheme). */
export interface ProjectIngestOut {
  translation: TranslationOut;
  versification: VersificationOut;
}

/** Per-item validation detail attached to ingest/schema failures. */
export interface FieldError {
  field: string;
  message: string;
}

/** Machine-readable error codes from the server envelope. */
export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "validation_failed"
  | "internal_error"
  | "database_unavailable";
