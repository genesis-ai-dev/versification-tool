import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import { createMockApiClient } from './api/mockClient'
import {
  MOCK_TRANSLATION_IDS,
  viewerFixtures,
  type ViewerFixture,
} from './api/mockData'
import type {
  NavBook,
  ResolveResult,
  ResolvedSpan,
  Translation,
  VerseSpan,
  Versification,
} from './api/contracts'
import { MappingOverlay } from './components/MappingOverlay'
import { MappingSummary } from './components/MappingSummary'
import { TranslationPane, type ExclusionGap } from './components/TranslationPane'
import {
  type MappingExampleOption,
  type OverlayMode,
  ViewerToolbar,
} from './components/ViewerToolbar'
import { spanElementKey, verseRef } from './components/verseUtils'
import {
  type MappingConnection,
  useMappingGeometry,
} from './hooks/useMappingGeometry'

const api = createMockApiClient({ latencyMs: 90 })

type ViewerSide = 'left' | 'right'

interface PaneState {
  translationId: string
  schemeId: string
  schemes: Versification[]
  navigation: NavBook[]
  book: string
  chapter: number
  verse: number
  spans: VerseSpan[]
}

interface ReferenceLocation {
  book: string
  chapter: number
  verse: number
}

const exampleDescriptions: Record<string, string> = {
  'one-to-one': 'A direct span-to-span correspondence.',
  shift: 'A Psalm title is counted under a different verse number.',
  renumber: 'The same text crosses a chapter boundary.',
  split: 'One source verse corresponds to two target verses.',
  merge: 'Two source verses correspond to one target verse.',
  'exclude-source': 'A verse is present on the left and absent on the right.',
  partial: 'Only labeled parts of the two verses correspond.',
}

const exampleOptions: MappingExampleOption[] = viewerFixtures.map((fixture) => ({
  id: fixture.id,
  label: fixture.label,
  description: exampleDescriptions[fixture.id] ?? 'Mapped verse relationship.',
  relation: fixture.relation,
}))

function parseReference(ref: string): ReferenceLocation {
  const match = /^([A-Z1-6]{3}) (\d+):(\d+)/.exec(ref)
  if (!match) {
    throw new Error(`Unsupported mock reference: ${ref}`)
  }

  return {
    book: match[1],
    chapter: Number(match[2]),
    verse: Number(match[3]),
  }
}

function keyForResolvedSpan(side: ViewerSide, span: ResolvedSpan) {
  return spanElementKey(side, span.ref, span.part)
}

function firstVerse(spans: VerseSpan[], fallback = 1) {
  return spans[0]?.verse ?? fallback
}

function fixtureForId(id: string) {
  return viewerFixtures.find((fixture) => fixture.id === id) ?? viewerFixtures[0]
}

function initialExampleId() {
  const requested = new URLSearchParams(window.location.search).get('example')
  return viewerFixtures.some((fixture) => fixture.id === requested)
    ? requested!
    : (viewerFixtures[0]?.id ?? '')
}

function reverseFixture(fixture: ViewerFixture): ViewerFixture {
  return {
    ...fixture,
    id: `${fixture.id}-reverse`,
    relation:
      fixture.relation === 'split'
        ? 'merge'
        : fixture.relation === 'merge'
          ? 'split'
          : fixture.relation,
    source_spans: fixture.target_spans,
    target_spans: fixture.source_spans,
  }
}

function App() {
  const [translations, setTranslations] = useState<Translation[]>([])
  const [leftPane, setLeftPane] = useState<PaneState | null>(null)
  const [rightPane, setRightPane] = useState<PaneState | null>(null)
  const [activeSide, setActiveSide] = useState<ViewerSide>('left')
  const [resolution, setResolution] = useState<ResolveResult | null>(null)
  const [selectedExampleId, setSelectedExampleId] = useState(initialExampleId)
  const initialExampleRef = useRef(selectedExampleId)
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('focused')
  const [isBooting, setIsBooting] = useState(true)
  const [isResolving, setIsResolving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const leftScrollRef = useRef<HTMLDivElement | null>(null)
  const rightScrollRef = useRef<HTMLDivElement | null>(null)
  const {
    containerRef: mappingContainerRef,
    registerElement: registerMappingElement,
    getRegisteredElement,
    geometry: mappingGeometry,
    refresh: refreshMapping,
  } = useMappingGeometry()

  const registerElement = useCallback(
    (key: string, element: HTMLElement | null) => {
      registerMappingElement(key)(element)
    },
    [registerMappingElement],
  )

  const loadPane = useCallback(
    async (
      translationId: string,
      preferred: ReferenceLocation,
    ): Promise<PaneState> => {
      const [associationList, versificationList, navigation] = await Promise.all([
        api.listAssociations(translationId),
        api.listVersifications({ limit: 100 }),
        api.getNavigation(translationId),
      ])
      const associationIds = new Set(
        associationList.map((association) => association.scheme_id),
      )
      const schemes = versificationList.items.filter((scheme) =>
        associationIds.has(scheme.id),
      )
      const activeAssociation = associationList.find(
        (association) => association.active,
      )
      const selectedBook = navigation.some(
        (entry) => entry.book === preferred.book,
      )
        ? preferred.book
        : (navigation[0]?.book ?? preferred.book)
      const chapters =
        navigation.find((entry) => entry.book === selectedBook)?.chapters ?? []
      const selectedChapter = chapters.includes(preferred.chapter)
        ? preferred.chapter
        : (chapters[0] ?? preferred.chapter)
      const spansResult = await api.listSpans({
        translationId,
        book: selectedBook,
        chapter: selectedChapter,
        limit: 500,
      })
      const selectedVerse = spansResult.items.some(
        (span) => span.verse === preferred.verse,
      )
        ? preferred.verse
        : firstVerse(spansResult.items, preferred.verse)

      return {
        translationId,
        schemeId: activeAssociation?.scheme_id ?? schemes[0]?.id ?? '',
        schemes,
        navigation,
        book: selectedBook,
        chapter: selectedChapter,
        verse: selectedVerse,
        spans: spansResult.items,
      }
    },
    [],
  )

  const loadChapter = useCallback(
    async (
      pane: PaneState,
      book: string,
      chapter: number,
      preferredVerse?: number,
    ): Promise<PaneState> => {
      const spansResult = await api.listSpans({
        translationId: pane.translationId,
        book,
        chapter,
        limit: 500,
      })

      return {
        ...pane,
        book,
        chapter,
        verse:
          preferredVerse !== undefined &&
          spansResult.items.some((span) => span.verse === preferredVerse)
            ? preferredVerse
            : firstVerse(spansResult.items, preferredVerse),
        spans: spansResult.items,
      }
    },
    [],
  )

  const scrollResolutionIntoView = useCallback(
    (nextResolution: ResolveResult, sourceSide: ViewerSide) => {
      const targetSide: ViewerSide = sourceSide === 'left' ? 'right' : 'left'
      const sourceKey = nextResolution.source_spans[0]
        ? keyForResolvedSpan(sourceSide, nextResolution.source_spans[0])
        : null
      const targetKey = nextResolution.target_spans[0]
        ? keyForResolvedSpan(targetSide, nextResolution.target_spans[0])
        : null

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const usesSideBySideLayout = window.innerWidth > 780
          if (usesSideBySideLayout && sourceKey) {
            getRegisteredElement(sourceKey)?.scrollIntoView({
              block: 'center',
              behavior: 'auto',
            })
          }
          if (usesSideBySideLayout && targetKey) {
            getRegisteredElement(targetKey)?.scrollIntoView({
              block: 'center',
              behavior: 'auto',
            })
          }
          refreshMapping()
        })
      })
    },
    [getRegisteredElement, refreshMapping],
  )

  const openExample = useCallback(
    async (exampleId: string) => {
      const fixture = fixtureForId(exampleId)
      if (!fixture) {
        return
      }

      setSelectedExampleId(fixture.id)
      const url = new URL(window.location.href)
      url.searchParams.set('example', fixture.id)
      window.history.replaceState(null, '', url)
      setIsResolving(true)
      setErrorMessage(null)

      try {
        const sourceLocation = parseReference(fixture.source_spans[0].ref)
        const targetLocation = fixture.target_spans[0]
          ? parseReference(fixture.target_spans[0].ref)
          : sourceLocation
        const [nextLeftPane, nextRightPane, nextResolution] = await Promise.all([
          loadPane(MOCK_TRANSLATION_IDS.source, sourceLocation),
          loadPane(MOCK_TRANSLATION_IDS.target, targetLocation),
          api.resolve({
            fromTranslation: MOCK_TRANSLATION_IDS.source,
            toTranslation: MOCK_TRANSLATION_IDS.target,
            ref: fixture.source_spans[0].ref,
          }),
        ])

        setLeftPane(nextLeftPane)
        setRightPane(nextRightPane)
        setActiveSide('left')
        setResolution(nextResolution)
        scrollResolutionIntoView(nextResolution, 'left')
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to open this example.',
        )
      } finally {
        setIsResolving(false)
      }
    },
    [loadPane, scrollResolutionIntoView],
  )

  useEffect(() => {
    let cancelled = false

    async function initialize() {
      setIsBooting(true)
      try {
        const translationResult = await api.listTranslations({ limit: 100 })
        if (cancelled) {
          return
        }
        setTranslations(translationResult.items)
        await openExample(initialExampleRef.current)
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Unable to prepare the viewer.',
          )
        }
      } finally {
        if (!cancelled) {
          setIsBooting(false)
        }
      }
    }

    void initialize()
    return () => {
      cancelled = true
    }
  }, [openExample])

  const resolveFromSpan = useCallback(
    async (side: ViewerSide, span: VerseSpan) => {
      if (!leftPane || !rightPane) {
        return
      }

      const sourcePane = side === 'left' ? leftPane : rightPane
      const targetPane = side === 'left' ? rightPane : leftPane
      const setSourcePane = side === 'left' ? setLeftPane : setRightPane
      const setTargetPane = side === 'left' ? setRightPane : setLeftPane
      const sourceReference = verseRef(span)

      setActiveSide(side)
      setIsResolving(true)
      setErrorMessage(null)
      setSourcePane({ ...sourcePane, verse: span.verse })

      try {
        const nextResolution = await api.resolve({
          fromTranslation: sourcePane.translationId,
          toTranslation: targetPane.translationId,
          ref: sourceReference,
        })
        let nextTargetPane = targetPane
        const targetReference = nextResolution.target_spans[0]
        if (targetReference) {
          const location = parseReference(targetReference.ref)
          if (
            location.book !== targetPane.book ||
            location.chapter !== targetPane.chapter
          ) {
            nextTargetPane = await loadChapter(
              targetPane,
              location.book,
              location.chapter,
              location.verse,
            )
          } else {
            nextTargetPane = { ...targetPane, verse: location.verse }
          }
        }

        setTargetPane(nextTargetPane)
        setResolution(nextResolution)
        scrollResolutionIntoView(nextResolution, side)
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to resolve this span.',
        )
      } finally {
        setIsResolving(false)
      }
    },
    [leftPane, loadChapter, rightPane, scrollResolutionIntoView],
  )

  const changeTranslation = useCallback(
    async (side: ViewerSide, translationId: string) => {
      const currentPane = side === 'left' ? leftPane : rightPane
      if (!currentPane) {
        return
      }

      setIsResolving(true)
      setErrorMessage(null)
      try {
        const nextPane = await loadPane(translationId, {
          book: currentPane.book,
          chapter: currentPane.chapter,
          verse: currentPane.verse,
        })
        if (side === 'left') {
          setLeftPane(nextPane)
        } else {
          setRightPane(nextPane)
        }
        setResolution(null)
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to change the translation.',
        )
      } finally {
        setIsResolving(false)
      }
    },
    [leftPane, loadPane, rightPane],
  )

  const changeScheme = useCallback(
    async (side: ViewerSide, schemeId: string) => {
      const pane = side === 'left' ? leftPane : rightPane
      if (!pane) {
        return
      }

      setIsResolving(true)
      try {
        await api.activateAssociation(pane.translationId, schemeId)
        const nextPane = { ...pane, schemeId }
        if (side === 'left') {
          setLeftPane(nextPane)
        } else {
          setRightPane(nextPane)
        }
        setResolution(null)
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to change the scheme.',
        )
      } finally {
        setIsResolving(false)
      }
    },
    [leftPane, rightPane],
  )

  const changeBook = useCallback(
    async (side: ViewerSide, book: string) => {
      const pane = side === 'left' ? leftPane : rightPane
      if (!pane) {
        return
      }
      const chapter =
        pane.navigation.find((entry) => entry.book === book)?.chapters[0] ?? 1
      const nextPane = await loadChapter(pane, book, chapter)
      if (side === 'left') setLeftPane(nextPane)
      else setRightPane(nextPane)
      setResolution(null)
    },
    [leftPane, loadChapter, rightPane],
  )

  const changeChapter = useCallback(
    async (side: ViewerSide, chapter: number) => {
      const pane = side === 'left' ? leftPane : rightPane
      if (!pane) {
        return
      }
      const nextPane = await loadChapter(pane, pane.book, chapter)
      if (side === 'left') setLeftPane(nextPane)
      else setRightPane(nextPane)
      setResolution(null)
    },
    [leftPane, loadChapter, rightPane],
  )

  const changeVerse = useCallback(
    (side: ViewerSide, verse: number) => {
      const pane = side === 'left' ? leftPane : rightPane
      const span = pane?.spans.find((candidate) => candidate.verse === verse)
      if (span) {
        void resolveFromSpan(side, span)
      }
    },
    [leftPane, resolveFromSpan, rightPane],
  )

  const exclusionGap = useMemo<{
    side: ViewerSide
    value: ExclusionGap
  } | null>(() => {
    if (!resolution || resolution.relation !== 'exclude') {
      return null
    }

    const targetSide: ViewerSide = activeSide === 'left' ? 'right' : 'left'
    const targetPane = targetSide === 'left' ? leftPane : rightPane
    const source = resolution.source_spans[0]
    if (!targetPane || !source) {
      return null
    }

    const sourceLocation = parseReference(source.ref)
    const before = [...targetPane.spans]
      .filter((span) => span.verse < sourceLocation.verse)
      .sort((left, right) => right.seq - left.seq)[0]
    const afterSeq = before?.seq ?? targetPane.spans[0]?.seq ?? 0

    return {
      side: targetSide,
      value: {
        key: `${targetSide}:gap:${source.ref}`,
        afterSeq,
        label: `${source.ref} is absent in this scheme`,
      },
    }
  }, [activeSide, leftPane, resolution, rightPane])

  const selectedAndMappedKeys = useMemo(() => {
    const leftSelected = new Set<string>()
    const rightSelected = new Set<string>()
    const leftMapped = new Set<string>()
    const rightMapped = new Set<string>()

    if (!resolution) {
      return { leftSelected, rightSelected, leftMapped, rightMapped }
    }

    const sourceSide = activeSide
    const targetSide: ViewerSide = sourceSide === 'left' ? 'right' : 'left'
    for (const span of resolution.source_spans) {
      const key = keyForResolvedSpan(sourceSide, span)
      ;(sourceSide === 'left' ? leftSelected : rightSelected).add(key)
      ;(sourceSide === 'left' ? leftMapped : rightMapped).add(key)
    }
    for (const span of resolution.target_spans) {
      const key = keyForResolvedSpan(targetSide, span)
      ;(targetSide === 'left' ? leftMapped : rightMapped).add(key)
    }

    return { leftSelected, rightSelected, leftMapped, rightMapped }
  }, [activeSide, resolution])

  const connections = useMemo<MappingConnection[]>(() => {
    if (overlayMode === 'off' || !resolution) {
      return []
    }

    const targetSide: ViewerSide = activeSide === 'left' ? 'right' : 'left'
    const focused: MappingConnection = {
      id: 'focused-mapping',
      relation: resolution.relation,
      sourceKeys: resolution.source_spans.map((span) =>
        keyForResolvedSpan(activeSide, span),
      ),
      targetKeys:
        resolution.relation === 'exclude' && exclusionGap
          ? [exclusionGap.value.key]
          : resolution.target_spans.map((span) =>
              keyForResolvedSpan(targetSide, span),
            ),
      active: true,
      ariaLabel: `${resolution.relation} mapping`,
    }

    if (overlayMode !== 'all' || !leftPane || !rightPane) {
      return [focused]
    }

    let fixtures: ViewerFixture[] = []
    if (
      leftPane.translationId === MOCK_TRANSLATION_IDS.source &&
      rightPane.translationId === MOCK_TRANSLATION_IDS.target
    ) {
      fixtures = viewerFixtures
    } else if (
      leftPane.translationId === MOCK_TRANSLATION_IDS.target &&
      rightPane.translationId === MOCK_TRANSLATION_IDS.source
    ) {
      fixtures = viewerFixtures
        .filter((fixture) => fixture.target_spans.length > 0)
        .map(reverseFixture)
    }

    const visibleLeftKeys = new Set(
      leftPane.spans.map((span) =>
        spanElementKey('left', verseRef(span), span.part),
      ),
    )
    const visibleRightKeys = new Set(
      rightPane.spans.map((span) =>
        spanElementKey('right', verseRef(span), span.part),
      ),
    )
    const contextual = fixtures
      .map<MappingConnection>((fixture) => ({
        id: fixture.id,
        relation: fixture.relation,
        sourceKeys: fixture.source_spans.map((span) =>
          keyForResolvedSpan('left', span),
        ),
        targetKeys: fixture.target_spans.map((span) =>
          keyForResolvedSpan('right', span),
        ),
        dimmed: fixture.id !== selectedExampleId,
      }))
      .filter(
        (connection) =>
          connection.sourceKeys.some((key) => visibleLeftKeys.has(key)) &&
          connection.targetKeys?.some((key) => visibleRightKeys.has(key)),
      )
      .filter((connection) => connection.id !== selectedExampleId)

    return [...contextual, focused]
  }, [
    activeSide,
    exclusionGap,
    leftPane,
    overlayMode,
    resolution,
    rightPane,
    selectedExampleId,
  ])

  return (
    <main className="app-shell">
      <ViewerToolbar
        examples={exampleOptions}
        selectedExampleId={selectedExampleId}
        overlayMode={overlayMode}
        isLoading={isBooting || isResolving}
        onExampleChange={(exampleId) => void openExample(exampleId)}
        onOverlayModeChange={setOverlayMode}
      />

      <section ref={mappingContainerRef} className="viewer-workspace">
        {errorMessage ? (
          <div className="error-banner" role="alert">
            {errorMessage}
          </div>
        ) : null}

        {leftPane && rightPane ? (
          <div className="pane-grid">
            <TranslationPane
              side="left"
              translations={translations}
              selectedTranslationId={leftPane.translationId}
              schemes={leftPane.schemes}
              selectedSchemeId={leftPane.schemeId}
              navigation={leftPane.navigation}
              selectedBook={leftPane.book}
              selectedChapter={leftPane.chapter}
              selectedVerse={leftPane.verse}
              spans={leftPane.spans}
              selectedKeys={selectedAndMappedKeys.leftSelected}
              mappedKeys={selectedAndMappedKeys.leftMapped}
              relation={resolution?.relation}
              activeSource={activeSide === 'left'}
              isLoading={isBooting}
              scrollRef={leftScrollRef}
              exclusionGap={exclusionGap?.side === 'left' ? exclusionGap.value : null}
              registerElement={registerElement}
              onScroll={refreshMapping}
              onTranslationChange={(translationId) =>
                void changeTranslation('left', translationId)
              }
              onSchemeChange={(schemeId) => void changeScheme('left', schemeId)}
              onBookChange={(book) => void changeBook('left', book)}
              onChapterChange={(chapter) => void changeChapter('left', chapter)}
              onVerseChange={(verse) => changeVerse('left', verse)}
              onSpanSelect={(span) => void resolveFromSpan('left', span)}
            />

            <TranslationPane
              side="right"
              translations={translations}
              selectedTranslationId={rightPane.translationId}
              schemes={rightPane.schemes}
              selectedSchemeId={rightPane.schemeId}
              navigation={rightPane.navigation}
              selectedBook={rightPane.book}
              selectedChapter={rightPane.chapter}
              selectedVerse={rightPane.verse}
              spans={rightPane.spans}
              selectedKeys={selectedAndMappedKeys.rightSelected}
              mappedKeys={selectedAndMappedKeys.rightMapped}
              relation={resolution?.relation}
              activeSource={activeSide === 'right'}
              isLoading={isBooting}
              scrollRef={rightScrollRef}
              exclusionGap={exclusionGap?.side === 'right' ? exclusionGap.value : null}
              registerElement={registerElement}
              onScroll={refreshMapping}
              onTranslationChange={(translationId) =>
                void changeTranslation('right', translationId)
              }
              onSchemeChange={(schemeId) => void changeScheme('right', schemeId)}
              onBookChange={(book) => void changeBook('right', book)}
              onChapterChange={(chapter) => void changeChapter('right', chapter)}
              onVerseChange={(verse) => changeVerse('right', verse)}
              onSpanSelect={(span) => void resolveFromSpan('right', span)}
            />
          </div>
        ) : (
          <div className="workspace-loading">
            <span className="summary-spinner" aria-hidden="true" />
            Preparing the comparison workspace…
          </div>
        )}

        <MappingOverlay
          geometry={mappingGeometry}
          connections={connections}
          ariaLabel="Visible versification mapping connections"
        />
      </section>

      <MappingSummary
        resolution={resolution}
        activeSide={activeSide}
        isLoading={isResolving}
      />
    </main>
  )
}

export default App
