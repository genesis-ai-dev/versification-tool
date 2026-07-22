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
  ResolveQuery,
  ResolveResult,
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

export interface HttpApiClientOptions {
  baseUrl?: string
  username?: string
  password?: string
  fetch?: typeof globalThis.fetch
}

export class ApiError extends Error {
  readonly status: number
  readonly body: ApiErrorBody

  constructor(status: number, body: ApiErrorBody) {
    super(body.detail)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

const addPagination = (params: URLSearchParams, query?: PaginationQuery): void => {
  if (query?.limit !== undefined) params.set('limit', String(query.limit))
  if (query?.offset !== undefined) params.set('offset', String(query.offset))
}

const withQuery = (path: string, params: URLSearchParams): string => {
  const query = params.toString()
  return query.length > 0 ? `${path}?${query}` : path
}

export class HttpApiClient implements ApiClient {
  private readonly baseUrl: string
  private readonly authorization: string | undefined
  private readonly fetcher: typeof globalThis.fetch

  constructor(options: HttpApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/$/, '')
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.authorization =
      options.username !== undefined && options.password !== undefined
        ? `Basic ${btoa(`${options.username}:${options.password}`)}`
        : undefined
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    if (this.authorization !== undefined) headers.set('Authorization', this.authorization)
    if (init.body !== undefined && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers })
    if (!response.ok) {
      let body: ApiErrorBody
      try {
        body = (await response.json()) as ApiErrorBody
      } catch {
        body = { detail: response.statusText || 'Request failed.', code: 'internal_error' }
      }
      throw new ApiError(response.status, body)
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  listTranslations(query?: PaginationQuery): Promise<Paginated<Translation>> {
    const params = new URLSearchParams()
    addPagination(params, query)
    return this.request(withQuery('/api/translations', params))
  }

  createTranslation(input: TranslationCreate): Promise<Translation> {
    return this.request('/api/translations', { method: 'POST', body: JSON.stringify(input) })
  }

  getTranslation(id: UUID): Promise<Translation> {
    return this.request(`/api/translations/${encodeURIComponent(id)}`)
  }

  updateTranslation(id: UUID, input: TranslationUpdate): Promise<Translation> {
    return this.request(`/api/translations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  deleteTranslation(id: UUID): Promise<void> {
    return this.request(`/api/translations/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  listSpans(query: SpansQuery): Promise<Paginated<VerseSpan>> {
    const params = new URLSearchParams({ book: query.book })
    if (query.chapter !== undefined) params.set('chapter', String(query.chapter))
    addPagination(params, query)
    return this.request(
      withQuery(`/api/translations/${encodeURIComponent(query.translationId)}/spans`, params),
    )
  }

  listVersifications(query?: VersificationsQuery): Promise<Paginated<Versification>> {
    const params = new URLSearchParams()
    if (query?.canonical !== undefined) params.set('canonical', String(query.canonical))
    addPagination(params, query)
    return this.request(withQuery('/api/versifications', params))
  }

  getVersification(id: UUID): Promise<VersificationDetail> {
    return this.request(`/api/versifications/${encodeURIComponent(id)}`)
  }

  updateVersification(id: UUID, input: VersificationUpdate): Promise<Versification> {
    return this.request(`/api/versifications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  deleteVersification(id: UUID): Promise<void> {
    return this.request(`/api/versifications/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  uploadVersification(input: VersificationUploadInput): Promise<Versification> {
    const form = new FormData()
    form.append('file', input.file, input.filename)
    if (input.name !== undefined) form.append('name', input.name)
    return this.request('/api/versifications/upload', { method: 'POST', body: form })
  }

  listAssociations(translationId: UUID): Promise<Association[]> {
    return this.request(`/api/translations/${encodeURIComponent(translationId)}/versifications`)
  }

  createAssociation(translationId: UUID, input: AssociationCreate): Promise<Association> {
    return this.request(`/api/translations/${encodeURIComponent(translationId)}/versifications`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  activateAssociation(translationId: UUID, schemeId: UUID): Promise<Association> {
    return this.request(
      `/api/translations/${encodeURIComponent(translationId)}/versifications/${encodeURIComponent(schemeId)}/active`,
      { method: 'PUT' },
    )
  }

  deleteAssociation(translationId: UUID, schemeId: UUID): Promise<void> {
    return this.request(
      `/api/translations/${encodeURIComponent(translationId)}/versifications/${encodeURIComponent(schemeId)}`,
      { method: 'DELETE' },
    )
  }

  ingestProject(input: ProjectIngestInput): Promise<ProjectIngestResult> {
    const form = new FormData()
    form.append('file', input.file, input.filename ?? 'project.zip')
    form.append('name', input.name)
    form.append('language', input.language)
    return this.request('/api/ingest/project', { method: 'POST', body: form })
  }

  resolve(query: ResolveQuery): Promise<ResolveResult> {
    const params = new URLSearchParams({
      from_translation: query.fromTranslation,
      to_translation: query.toTranslation,
      ref: query.ref,
    })
    return this.request(withQuery('/api/resolve', params))
  }

  getNavigation(translationId: UUID): Promise<NavBook[]> {
    return this.request(`/api/translations/${encodeURIComponent(translationId)}/navigation`)
  }

  listDeltas(query: DeltasQuery): Promise<Paginated<DeltaEntry>> {
    const params = new URLSearchParams({
      from_translation: query.fromTranslation,
      to_translation: query.toTranslation,
    })
    if (query.book !== undefined) params.set('book', query.book)
    addPagination(params, query)
    return this.request(withQuery('/api/resolve/deltas', params))
  }

  listMisalignments(query: MisalignmentsQuery): Promise<Paginated<MisalignmentEntry>> {
    const params = new URLSearchParams({
      from_translation: query.fromTranslation,
      to_translation: query.toTranslation,
    })
    if (query.category !== undefined) params.set('category', query.category)
    addPagination(params, query)
    return this.request(withQuery('/api/resolve/misalignments', params))
  }

  getHealth(): Promise<HealthResult> {
    return this.request('/api/health')
  }
}

export const createHttpApiClient = (options?: HttpApiClientOptions): ApiClient =>
  new HttpApiClient(options)
