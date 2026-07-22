export type UUID = string
export type ISODateTime = string
export type SourceFormat = 'usx' | 'usfm'

export const RELATION_TYPES = [
  'one_to_one',
  'shift',
  'renumber',
  'split',
  'merge',
  'exclude',
  'partial',
] as const

export type RelationType = (typeof RELATION_TYPES)[number]

export type MisalignmentCategory =
  | 'psalm_title'
  | 'chapter_boundary'
  | 'chapter_count'
  | 'lxx_psalm'
  | 'synodal'
  | 'nt_omission'
  | 'other'

export interface ApiFieldError {
  field: string
  message: string
}

export interface ApiErrorBody {
  detail: string
  code:
    | 'bad_request'
    | 'unauthorized'
    | 'not_found'
    | 'conflict'
    | 'payload_too_large'
    | 'validation_failed'
    | 'internal_error'
    | 'database_unavailable'
  errors?: ApiFieldError[]
}

export interface Paginated<T> {
  items: T[]
  total: number
}

export interface PaginationQuery {
  limit?: number
  offset?: number
}

export interface TranslationCreate {
  name: string
  language: string
  source_format: SourceFormat
}

export interface TranslationUpdate {
  name?: string
  language?: string
}

export interface Translation {
  id: UUID
  name: string
  language: string
  source_format: SourceFormat
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface VerseSpan {
  id: UUID
  seq: number
  book: string
  chapter: number
  verse: number
  part: string | null
  content: string
}

export interface SpansQuery extends PaginationQuery {
  translationId: UUID
  book: string
  chapter?: number
}

export interface Versification {
  id: UUID
  name: string
  based_on: string | null
  canonical: boolean
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface VersificationDetail extends Versification {
  ingredient: Record<string, unknown>
}

export interface VersificationUpdate {
  name?: string
}

export interface VersificationsQuery extends PaginationQuery {
  canonical?: boolean
}

export interface AssociationCreate {
  scheme_id: UUID
}

export interface Association {
  id: UUID
  translation_id: UUID
  scheme_id: UUID
  active: boolean
}

export interface ResolvedSpan {
  ref: string
  seq: number | null
  part: string | null
}

export interface ResolveResult {
  source_spans: ResolvedSpan[]
  target_spans: ResolvedSpan[]
  relation: RelationType
}

export interface ResolveQuery {
  fromTranslation: UUID
  toTranslation: UUID
  ref: string
}

export interface NavBook {
  book: string
  chapters: number[]
}

export interface DeltaEntry {
  source_ref: string
  base_ref: string | null
  relation: RelationType
}

export interface DeltasQuery extends PaginationQuery {
  fromTranslation: UUID
  toTranslation: UUID
  book?: string
}

export interface MisalignmentEntry {
  category: MisalignmentCategory
  source_ref: string
  relation: RelationType
}

export interface MisalignmentsQuery extends PaginationQuery {
  fromTranslation: UUID
  toTranslation: UUID
  category?: MisalignmentCategory
}

export interface ProjectIngestInput {
  file: Blob
  filename?: string
  name: string
  language: string
}

export interface ProjectIngestResult {
  translation: Translation
  versification: Versification
}

export interface VersificationUploadInput {
  file: Blob
  filename: string
  name?: string
}

export interface HealthResult {
  status: 'ok'
}

// UI aliases preserve the response-model names used in the server specification.
export type TranslationOut = Translation
export type VerseSpanOut = VerseSpan
export type VersificationOut = Versification
export type AssociationOut = Association

export interface ApiClient {
  listTranslations(query?: PaginationQuery): Promise<Paginated<Translation>>
  createTranslation(input: TranslationCreate): Promise<Translation>
  getTranslation(id: UUID): Promise<Translation>
  updateTranslation(id: UUID, input: TranslationUpdate): Promise<Translation>
  deleteTranslation(id: UUID): Promise<void>
  listSpans(query: SpansQuery): Promise<Paginated<VerseSpan>>

  listVersifications(query?: VersificationsQuery): Promise<Paginated<Versification>>
  getVersification(id: UUID): Promise<VersificationDetail>
  updateVersification(id: UUID, input: VersificationUpdate): Promise<Versification>
  deleteVersification(id: UUID): Promise<void>
  uploadVersification(input: VersificationUploadInput): Promise<Versification>

  listAssociations(translationId: UUID): Promise<Association[]>
  createAssociation(translationId: UUID, input: AssociationCreate): Promise<Association>
  activateAssociation(translationId: UUID, schemeId: UUID): Promise<Association>
  deleteAssociation(translationId: UUID, schemeId: UUID): Promise<void>

  ingestProject(input: ProjectIngestInput): Promise<ProjectIngestResult>
  resolve(query: ResolveQuery): Promise<ResolveResult>
  getNavigation(translationId: UUID): Promise<NavBook[]>
  listDeltas(query: DeltasQuery): Promise<Paginated<DeltaEntry>>
  listMisalignments(query: MisalignmentsQuery): Promise<Paginated<MisalignmentEntry>>
  getHealth(): Promise<HealthResult>
}
