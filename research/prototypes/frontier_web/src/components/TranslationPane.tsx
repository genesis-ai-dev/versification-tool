import type { RefObject } from 'react'
import type {
  NavBook,
  RelationType,
  TranslationOut,
  VerseSpanOut,
  VersificationOut,
} from '../api/contracts'
import { VerseRow } from './VerseRow'
import { spanElementKey, verseRef } from './verseUtils'

export interface ExclusionGap {
  key: string
  afterSeq: number
  label: string
}

interface TranslationPaneProps {
  side: 'left' | 'right'
  translations: TranslationOut[]
  selectedTranslationId: string
  schemes: VersificationOut[]
  selectedSchemeId: string
  navigation: NavBook[]
  selectedBook: string
  selectedChapter: number
  selectedVerse: number
  spans: VerseSpanOut[]
  selectedKeys: Set<string>
  mappedKeys: Set<string>
  relation?: RelationType
  activeSource: boolean
  isLoading: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  exclusionGap?: ExclusionGap | null
  registerElement: (key: string, element: HTMLElement | null) => void
  onScroll: () => void
  onTranslationChange: (translationId: string) => void
  onSchemeChange: (schemeId: string) => void
  onBookChange: (book: string) => void
  onChapterChange: (chapter: number) => void
  onVerseChange: (verse: number) => void
  onSpanSelect: (span: VerseSpanOut) => void
}

const bookNames: Record<string, string> = {
  GEN: 'Genesis',
  PSA: 'Psalms',
  REV: 'Revelation',
  ACT: 'Acts',
  MAL: 'Malachi',
  '1PE': '1 Peter',
  SIR: 'Sirach',
}

function sortedUniqueVerses(spans: VerseSpanOut[]) {
  return [...new Set(spans.map((span) => span.verse))].sort(
    (left, right) => left - right,
  )
}

export function TranslationPane({
  side,
  translations,
  selectedTranslationId,
  schemes,
  selectedSchemeId,
  navigation,
  selectedBook,
  selectedChapter,
  selectedVerse,
  spans,
  selectedKeys,
  mappedKeys,
  relation,
  activeSource,
  isLoading,
  scrollRef,
  exclusionGap,
  registerElement,
  onScroll,
  onTranslationChange,
  onSchemeChange,
  onBookChange,
  onChapterChange,
  onVerseChange,
  onSpanSelect,
}: TranslationPaneProps) {
  const selectedNavigation = navigation.find(
    (entry) => entry.book === selectedBook,
  )
  const verses = sortedUniqueVerses(spans)
  const selectedTranslation = translations.find(
    (translation) => translation.id === selectedTranslationId,
  )
  const selectedScheme = schemes.find(
    (scheme) => scheme.id === selectedSchemeId,
  )

  return (
    <section
      className={`translation-pane ${activeSource ? 'is-source' : ''}`}
      aria-label={`${side === 'left' ? 'Left' : 'Right'} translation column`}
    >
      <div className="pane-header">
        <div className="pane-title-row">
          <div>
            <span className="pane-eyebrow">
              {side === 'left' ? 'Left translation' : 'Right translation'}
            </span>
            <h2>{selectedTranslation?.name ?? 'Choose a translation'}</h2>
          </div>
          {activeSource ? <span className="source-indicator">Source</span> : null}
        </div>

        <div className="pane-selectors">
          <label>
            <span>Translation</span>
            <select
              value={selectedTranslationId}
              disabled={isLoading}
              onChange={(event) => onTranslationChange(event.target.value)}
            >
              {translations.map((translation) => (
                <option key={translation.id} value={translation.id}>
                  {translation.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Versification</span>
            <select
              value={selectedSchemeId}
              disabled={isLoading || schemes.length === 0}
              onChange={(event) => onSchemeChange(event.target.value)}
            >
              {schemes.map((scheme) => (
                <option key={scheme.id} value={scheme.id}>
                  {scheme.name}
                  {scheme.canonical ? ' · canonical' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="reference-controls">
          <label>
            <span>Book</span>
            <select
              value={selectedBook}
              disabled={isLoading}
              onChange={(event) => onBookChange(event.target.value)}
            >
              {navigation.map((entry) => (
                <option key={entry.book} value={entry.book}>
                  {bookNames[entry.book] ?? entry.book}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Chapter</span>
            <select
              value={selectedChapter}
              disabled={isLoading}
              onChange={(event) => onChapterChange(Number(event.target.value))}
            >
              {(selectedNavigation?.chapters ?? []).map((chapter) => (
                <option key={chapter} value={chapter}>
                  {chapter}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Verse</span>
            <select
              value={selectedVerse}
              disabled={isLoading || verses.length === 0}
              onChange={(event) => onVerseChange(Number(event.target.value))}
            >
              {verses.map((verse) => (
                <option key={verse} value={verse}>
                  {verse}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="pane-meta">
          <span>{selectedTranslation?.language ?? 'Unknown language'}</span>
          <span>{selectedScheme?.based_on ? `Based on ${selectedScheme.based_on}` : 'Root scheme'}</span>
          <span>{spans.length} spans</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="pane-scroll"
        aria-busy={isLoading}
        onScroll={onScroll}
      >
        {isLoading ? (
          <div className="pane-loading">
            <span className="summary-spinner" aria-hidden="true" />
            Loading chapter…
          </div>
        ) : (
          <div className="verse-list">
            <div className="chapter-heading" aria-hidden="true">
              <span>{bookNames[selectedBook] ?? selectedBook}</span>
              <strong>{selectedChapter}</strong>
            </div>

            {spans.map((span) => {
              const key = spanElementKey(side, verseRef(span), span.part)
              const gapFollows = exclusionGap?.afterSeq === span.seq

              return (
                <div key={`${span.id}-wrapper`}>
                  <VerseRow
                    side={side}
                    span={span}
                    isSelected={selectedKeys.has(key)}
                    isMapped={mappedKeys.has(key)}
                    relation={relation}
                    registerElement={registerElement}
                    onSelect={onSpanSelect}
                  />
                  {gapFollows && exclusionGap ? (
                    <div
                      ref={(element) =>
                        registerElement(exclusionGap.key, element)
                      }
                      className="exclusion-gap"
                      role="status"
                    >
                      <span className="gap-icon" aria-hidden="true">
                        ×
                      </span>
                      <span>
                        <strong>No corresponding span</strong>
                        <small>{exclusionGap.label}</small>
                      </span>
                    </div>
                  ) : null}
                </div>
              )
            })}

            {spans.length === 0 ? (
              <div className="empty-chapter">No spans are available here.</div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
