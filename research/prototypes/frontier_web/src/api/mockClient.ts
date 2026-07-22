import { ApiError } from './client.ts'
import {
  MOCK_TRANSLATION_IDS,
  MOCK_VERSIFICATION_IDS,
  mockAssociations,
  mockSpansByTranslation,
  mockTranslations,
  mockVersifications,
  reverseOnlyViewerFixtures,
  viewerFixtures,
} from './mockData.ts'
import type {
  ApiClient,
  ApiErrorBody,
  Association,
  AssociationCreate,
  DeltaEntry,
  DeltasQuery,
  HealthResult,
  MisalignmentEntry,
  MisalignmentsQuery,
  NavBook,
  Paginated,
  PaginationQuery,
  ProjectIngestInput,
  ProjectIngestResult,
  RelationType,
  ResolveQuery,
  ResolveResult,
  ResolvedSpan,
  SpansQuery,
  Translation,
  TranslationCreate,
  TranslationUpdate,
  UUID,
  VerseSpan,
  Versification,
  VersificationDetail,
  VersificationUpdate,
  VersificationsQuery,
  VersificationUploadInput,
} from './contracts.ts'
import type { ViewerFixture } from './mockData.ts'

export interface MockApiClientOptions {
  latencyMs?: number
}

const MAX_UPLOAD_BYTES = 52_428_800

const inverseRelation = (relation: RelationType): RelationType => {
  if (relation === 'split') return 'merge'
  if (relation === 'merge') return 'split'
  return relation
}

const reverseFixture = (fixture: ViewerFixture): ViewerFixture => ({
  ...fixture,
  id: `${fixture.id}-reverse`,
  relation: inverseRelation(fixture.relation),
  source_spans: fixture.target_spans,
  target_spans: fixture.source_spans,
})

const error = (status: number, body: ApiErrorBody): ApiError => new ApiError(status, body)

const page = <T>(items: T[], query?: PaginationQuery): Paginated<T> => {
  const offset = Math.max(0, query?.offset ?? 0)
  const limit = Math.min(500, Math.max(0, query?.limit ?? 100))
  return { items: items.slice(offset, offset + limit), total: items.length }
}

const versificationSummary = (detail: VersificationDetail): Versification => ({
  id: detail.id,
  name: detail.name,
  based_on: detail.based_on,
  canonical: detail.canonical,
  created_at: detail.created_at,
  updated_at: detail.updated_at,
})

const spanRef = (span: VerseSpan): string =>
  `${span.book} ${span.chapter}:${span.verse}`

const spansAsRange = (spans: ResolvedSpan[]): string | null => {
  if (spans.length === 0) return null
  if (spans.length === 1) return spans[0]?.ref ?? null

  const first = spans[0]?.ref
  const last = spans.at(-1)?.ref
  if (first === undefined || last === undefined) return null

  const firstMatch = /^([A-Z1-6]{3}) (\d+):(\d+)$/.exec(first)
  const lastMatch = /^([A-Z1-6]{3}) (\d+):(\d+)$/.exec(last)
  if (firstMatch !== null && lastMatch !== null && firstMatch[1] === lastMatch[1] && firstMatch[2] === lastMatch[2]) {
    return `${first}-${lastMatch[3]}`
  }
  return `${first}–${last}`
}

export class MockApiClient implements ApiClient {
  private readonly latencyMs: number
  private translations = structuredClone(mockTranslations)
  private versifications = structuredClone(mockVersifications)
  private associations = structuredClone(mockAssociations)
  private spansByTranslation = structuredClone(mockSpansByTranslation)

  constructor(options: MockApiClientOptions = {}) {
    this.latencyMs = Math.max(0, options.latencyMs ?? 120)
  }

  private async respond<T>(operation: () => T): Promise<T> {
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, this.latencyMs))
    return structuredClone(operation())
  }

  private requireTranslation(id: UUID): Translation {
    const translation = this.translations.find((item) => item.id === id)
    if (translation === undefined) {
      throw error(404, { detail: `Translation ${id} was not found.`, code: 'not_found' })
    }
    return translation
  }

  private requireVersification(id: UUID): VersificationDetail {
    const scheme = this.versifications.find((item) => item.id === id)
    if (scheme === undefined) {
      throw error(404, { detail: `Versification ${id} was not found.`, code: 'not_found' })
    }
    return scheme
  }

  private requireActiveScheme(translationId: UUID): UUID {
    const association = this.associations.find(
      (item) => item.translation_id === translationId && item.active,
    )
    if (association === undefined) {
      throw error(409, { detail: 'The translation has no active versification.', code: 'conflict' })
    }
    return association.scheme_id
  }

  private directionalFixtures(fromScheme: UUID, toScheme: UUID): ViewerFixture[] {
    if (
      fromScheme === MOCK_VERSIFICATION_IDS.source &&
      toScheme === MOCK_VERSIFICATION_IDS.target
    ) {
      return viewerFixtures
    }
    if (
      fromScheme === MOCK_VERSIFICATION_IDS.target &&
      toScheme === MOCK_VERSIFICATION_IDS.source
    ) {
      return [
        ...viewerFixtures.filter((fixture) => fixture.target_spans.length > 0).map(reverseFixture),
        ...reverseOnlyViewerFixtures,
      ]
    }
    return []
  }

  listTranslations(query?: PaginationQuery): Promise<Paginated<Translation>> {
    return this.respond(() => page(this.translations, query))
  }

  createTranslation(input: TranslationCreate): Promise<Translation> {
    return this.respond(() => {
      const duplicate = this.translations.some(
        (item) => item.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
      )
      if (duplicate) {
        throw error(409, { detail: `Translation name "${input.name}" is already in use.`, code: 'conflict' })
      }
      const now = new Date().toISOString()
      const translation: Translation = {
        id: crypto.randomUUID(),
        ...input,
        created_at: now,
        updated_at: now,
      }
      this.translations.push(translation)
      this.spansByTranslation[translation.id] = []
      return translation
    })
  }

  getTranslation(id: UUID): Promise<Translation> {
    return this.respond(() => this.requireTranslation(id))
  }

  updateTranslation(id: UUID, input: TranslationUpdate): Promise<Translation> {
    return this.respond(() => {
      const translation = this.requireTranslation(id)
      if (
        input.name !== undefined &&
        this.translations.some(
          (item) => item.id !== id && item.name.toLocaleLowerCase() === input.name?.toLocaleLowerCase(),
        )
      ) {
        throw error(409, { detail: `Translation name "${input.name}" is already in use.`, code: 'conflict' })
      }
      if (input.name !== undefined) translation.name = input.name
      if (input.language !== undefined) translation.language = input.language
      translation.updated_at = new Date().toISOString()
      return translation
    })
  }

  deleteTranslation(id: UUID): Promise<void> {
    return this.respond(() => {
      this.requireTranslation(id)
      this.translations = this.translations.filter((item) => item.id !== id)
      this.associations = this.associations.filter((item) => item.translation_id !== id)
      delete this.spansByTranslation[id]
    })
  }

  listSpans(query: SpansQuery): Promise<Paginated<VerseSpan>> {
    return this.respond(() => {
      this.requireTranslation(query.translationId)
      const spans = (this.spansByTranslation[query.translationId] ?? [])
        .filter(
          (span) =>
            span.book === query.book && (query.chapter === undefined || span.chapter === query.chapter),
        )
        .sort((left, right) => left.seq - right.seq)
      return page(spans, query)
    })
  }

  listVersifications(query?: VersificationsQuery): Promise<Paginated<Versification>> {
    return this.respond(() => {
      const schemes = this.versifications
        .filter((item) => query?.canonical === undefined || item.canonical === query.canonical)
        .map(versificationSummary)
      return page(schemes, query)
    })
  }

  getVersification(id: UUID): Promise<VersificationDetail> {
    return this.respond(() => this.requireVersification(id))
  }

  updateVersification(id: UUID, input: VersificationUpdate): Promise<Versification> {
    return this.respond(() => {
      const scheme = this.requireVersification(id)
      if (input.name !== undefined) scheme.name = input.name
      scheme.updated_at = new Date().toISOString()
      return versificationSummary(scheme)
    })
  }

  deleteVersification(id: UUID): Promise<void> {
    return this.respond(() => {
      this.requireVersification(id)
      if (this.associations.some((item) => item.scheme_id === id)) {
        throw error(409, { detail: 'The versification is still associated with a translation.', code: 'conflict' })
      }
      this.versifications = this.versifications.filter((item) => item.id !== id)
    })
  }

  uploadVersification(input: VersificationUploadInput): Promise<Versification> {
    return this.respond(() => {
      if (input.file.size > MAX_UPLOAD_BYTES) {
        throw error(413, { detail: 'The upload exceeds the 50 MB limit.', code: 'payload_too_large' })
      }
      if (!/\.(json|vrs)$/i.test(input.filename)) {
        throw error(422, {
          detail: 'Expected a .vrs or Copenhagen/Burrito .json file.',
          code: 'validation_failed',
          errors: [{ field: 'file', message: 'Unsupported versification file type.' }],
        })
      }
      const now = new Date().toISOString()
      const scheme: VersificationDetail = {
        id: crypto.randomUUID(),
        name: input.name ?? input.filename.replace(/\.(json|vrs)$/i, ''),
        based_on: 'org',
        canonical: false,
        ingredient: { basedOn: 'org', maxVerses: {} },
        created_at: now,
        updated_at: now,
      }
      this.versifications.push(scheme)
      return versificationSummary(scheme)
    })
  }

  listAssociations(translationId: UUID): Promise<Association[]> {
    return this.respond(() => {
      this.requireTranslation(translationId)
      return this.associations.filter((item) => item.translation_id === translationId)
    })
  }

  createAssociation(translationId: UUID, input: AssociationCreate): Promise<Association> {
    return this.respond(() => {
      this.requireTranslation(translationId)
      this.requireVersification(input.scheme_id)
      if (
        this.associations.some(
          (item) => item.translation_id === translationId && item.scheme_id === input.scheme_id,
        )
      ) {
        throw error(409, { detail: 'The versification is already associated.', code: 'conflict' })
      }
      const association: Association = {
        id: crypto.randomUUID(),
        translation_id: translationId,
        scheme_id: input.scheme_id,
        active: false,
      }
      this.associations.push(association)
      return association
    })
  }

  activateAssociation(translationId: UUID, schemeId: UUID): Promise<Association> {
    return this.respond(() => {
      this.requireTranslation(translationId)
      const association = this.associations.find(
        (item) => item.translation_id === translationId && item.scheme_id === schemeId,
      )
      if (association === undefined) {
        throw error(409, { detail: 'The versification is not associated with this translation.', code: 'conflict' })
      }
      for (const item of this.associations) {
        if (item.translation_id === translationId) item.active = item.id === association.id
      }
      return association
    })
  }

  deleteAssociation(translationId: UUID, schemeId: UUID): Promise<void> {
    return this.respond(() => {
      this.requireTranslation(translationId)
      const exists = this.associations.some(
        (item) => item.translation_id === translationId && item.scheme_id === schemeId,
      )
      if (!exists) {
        throw error(404, { detail: 'The versification association was not found.', code: 'not_found' })
      }
      this.associations = this.associations.filter(
        (item) => item.translation_id !== translationId || item.scheme_id !== schemeId,
      )
    })
  }

  ingestProject(input: ProjectIngestInput): Promise<ProjectIngestResult> {
    return this.respond(() => {
      if (input.file.size > MAX_UPLOAD_BYTES) {
        throw error(413, { detail: 'The upload exceeds the 50 MB limit.', code: 'payload_too_large' })
      }
      if (input.filename !== undefined && !/\.zip$/i.test(input.filename)) {
        throw error(400, { detail: 'Expected a zipped project file.', code: 'bad_request' })
      }
      const translation = this.createTranslationRecord({
        name: input.name,
        language: input.language,
        source_format: 'usx',
      })
      this.spansByTranslation[translation.id] = (mockSpansByTranslation[MOCK_TRANSLATION_IDS.source] ?? []).map(
        (span) => ({ ...span, id: crypto.randomUUID() }),
      )
      const now = new Date().toISOString()
      const detail: VersificationDetail = {
        id: crypto.randomUUID(),
        name: `${input.name} custom`,
        based_on: 'org',
        canonical: false,
        ingredient: { basedOn: 'org', maxVerses: {} },
        created_at: now,
        updated_at: now,
      }
      this.versifications.push(detail)
      this.associations.push({
        id: crypto.randomUUID(),
        translation_id: translation.id,
        scheme_id: detail.id,
        active: true,
      })
      return { translation, versification: versificationSummary(detail) }
    })
  }

  private createTranslationRecord(input: TranslationCreate): Translation {
    const duplicate = this.translations.some(
      (item) => item.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
    )
    if (duplicate) {
      throw error(409, { detail: `Translation name "${input.name}" is already in use.`, code: 'conflict' })
    }
    const now = new Date().toISOString()
    const translation: Translation = {
      id: crypto.randomUUID(),
      ...input,
      created_at: now,
      updated_at: now,
    }
    this.translations.push(translation)
    this.spansByTranslation[translation.id] = []
    return translation
  }

  resolve(query: ResolveQuery): Promise<ResolveResult> {
    return this.respond(() => {
      this.requireTranslation(query.fromTranslation)
      this.requireTranslation(query.toTranslation)
      if (!/^[A-Z1-6]{3} \d+:\d+(?:[a-z]|-)?$/.test(query.ref)) {
        throw error(400, { detail: `Invalid single-verse reference: ${query.ref}`, code: 'bad_request' })
      }

      const fromScheme = this.requireActiveScheme(query.fromTranslation)
      const toScheme = this.requireActiveScheme(query.toTranslation)
      if (query.fromTranslation === query.toTranslation) {
        const source = this.findResolvedSpan(query.fromTranslation, query.ref)
        return { source_spans: [source], target_spans: [source], relation: 'one_to_one' }
      }

      const fixture = this.directionalFixtures(fromScheme, toScheme).find((item) =>
        item.source_spans.some((span) => span.ref === query.ref),
      )
      if (fixture !== undefined) {
        return {
          source_spans: fixture.source_spans,
          target_spans: fixture.target_spans,
          relation: fixture.relation,
        }
      }

      const source = this.findResolvedSpan(query.fromTranslation, query.ref)
      const target = this.findResolvedSpan(query.toTranslation, query.ref)
      return { source_spans: [source], target_spans: [target], relation: 'one_to_one' }
    })
  }

  private findResolvedSpan(translationId: UUID, ref: string): ResolvedSpan {
    const span = (this.spansByTranslation[translationId] ?? []).find((item) => spanRef(item) === ref)
    const partMatch = /(?:\d)([a-z]|-)$/.exec(ref)
    return { ref, seq: span?.seq ?? null, part: span?.part ?? partMatch?.[1] ?? null }
  }

  getNavigation(translationId: UUID): Promise<NavBook[]> {
    return this.respond(() => {
      this.requireTranslation(translationId)
      const scheme = this.requireVersification(this.requireActiveScheme(translationId))
      const chaptersByBook = new Map<string, Set<number>>()
      const maxVerses = scheme.ingredient.maxVerses
      if (typeof maxVerses === 'object' && maxVerses !== null && !Array.isArray(maxVerses)) {
        for (const [book, counts] of Object.entries(maxVerses)) {
          if (!Array.isArray(counts)) continue
          const chapters = new Set<number>()
          counts.forEach((count, index) => {
            if (Number(count) > 0) chapters.add(index + 1)
          })
          if (chapters.size > 0) chaptersByBook.set(book, chapters)
        }
      }
      for (const span of this.spansByTranslation[translationId] ?? []) {
        const chapters = chaptersByBook.get(span.book) ?? new Set<number>()
        chapters.add(span.chapter)
        chaptersByBook.set(span.book, chapters)
      }
      return [...chaptersByBook.entries()].map(([book, chapters]) => ({
        book,
        chapters: [...chapters].sort((left, right) => left - right),
      }))
    })
  }

  listDeltas(query: DeltasQuery): Promise<Paginated<DeltaEntry>> {
    return this.respond(() => {
      this.requireTranslation(query.fromTranslation)
      this.requireTranslation(query.toTranslation)
      const entries = this.directionalFixtures(
        this.requireActiveScheme(query.fromTranslation),
        this.requireActiveScheme(query.toTranslation),
      )
        .filter((fixture) => fixture.relation !== 'one_to_one')
        .map((fixture) => ({
          source_ref: spansAsRange(fixture.source_spans) ?? '',
          base_ref: spansAsRange(fixture.target_spans),
          relation: fixture.relation,
        }))
        .filter((entry) => query.book === undefined || entry.source_ref.startsWith(`${query.book} `))
      return page(entries, query)
    })
  }

  listMisalignments(query: MisalignmentsQuery): Promise<Paginated<MisalignmentEntry>> {
    return this.respond(() => {
      this.requireTranslation(query.fromTranslation)
      this.requireTranslation(query.toTranslation)
      const entries = this.directionalFixtures(
        this.requireActiveScheme(query.fromTranslation),
        this.requireActiveScheme(query.toTranslation),
      )
        .filter((fixture) => fixture.relation !== 'one_to_one')
        .filter((fixture) => query.category === undefined || fixture.category === query.category)
        .map((fixture) => ({
          category: fixture.category,
          source_ref: spansAsRange(fixture.source_spans) ?? '',
          relation: fixture.relation,
        }))
      return page(entries, query)
    })
  }

  getHealth(): Promise<HealthResult> {
    return this.respond(() => ({ status: 'ok' }))
  }
}

export const createMockApiClient = (options?: MockApiClientOptions): ApiClient =>
  new MockApiClient(options)
