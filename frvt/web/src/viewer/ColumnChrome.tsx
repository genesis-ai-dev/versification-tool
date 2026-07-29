import { formatVerseLabel } from "../lib/formatRef";
import { formatVersificationOptionLabel } from "../lib/formatVersificationOption";
import type { DriveSide } from "./overlay/drawPlan";
import { JumpMenu } from "./JumpMenu";
import { useViewerSession } from "./ViewerSession";

/** Props for per-column translation / BCV / scheme chrome. */
export interface ColumnChromeProps {
  /** Physical column this chrome controls. */
  side: DriveSide;
  /** Disable jump/resolve-dependent controls when counterpart missing. */
  resolveDisabled: boolean;
}

/**
 * Translation selector, BCV selectors, scheme select, and jump menu.
 * Scheme selection writes ``lvers``/``rvers`` only — never preferred PUT.
 */
export function ColumnChrome({ side, resolveDisabled }: ColumnChromeProps) {
  const session = useViewerSession();
  const translationId = side === "left" ? session.url.left : session.url.right;
  const bcv = side === "left" ? session.url.leftBcv : session.url.rightBcv;
  const selectedVers = side === "left" ? session.url.leftVers : session.url.rightVers;
  const navigation = session.navigationFor(side);
  const associations = session.associationsFor(side);
  const spans = session.spansFor(side);
  const jumpBooks = session.jumpBooksFor(side);
  const bookLegendId = `${side}-book-jump-legend`;

  const chapters = navigation.find((book) => book.book === bcv?.book)?.chapters ?? [];
  const verses = uniqueVerses(spans);

  return (
    <div className="column-chrome">
      <label>
        Translation
        <select
          value={translationId ?? ""}
          aria-label={`${side} translation`}
          onChange={(event) =>
            session.setColumnTranslation(side, event.target.value || null)
          }
        >
          <option value="">Select…</option>
          {session.translations.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <label className="book-chrome-field">
        <span className="book-chrome-label-row">
          Book
          {translationId ? (
            <span className="book-jump-legend" id={bookLegendId}>
              ● Book has mapping differences
            </span>
          ) : null}
        </span>
        <select
          value={bcv?.book ?? ""}
          aria-label={`${side} book`}
          aria-describedby={translationId ? bookLegendId : undefined}
          disabled={!translationId}
          onChange={(event) => {
            if (!bcv && !event.target.value) {
              return;
            }
            const book = event.target.value;
            const bookNav = navigation.find((b) => b.book === book);
            const chapter = bookNav?.chapters[0] ?? 1;
            session.setColumnBcv(side, {
              book,
              chapter,
              verse: 1,
              part: null,
            });
          }}
        >
          <option value="">—</option>
          {navigation.map((book) => (
            <option key={book.book} value={book.book}>
              {jumpBooks.has(book.book) ? `${book.book} ●` : book.book}
            </option>
          ))}
        </select>
      </label>

      <label>
        Chapter
        <select
          value={bcv?.chapter ?? ""}
          aria-label={`${side} chapter`}
          disabled={!bcv}
          onChange={(event) => {
            if (!bcv) {
              return;
            }
            session.setColumnBcv(side, {
              ...bcv,
              chapter: Number(event.target.value),
              verse: 1,
              part: null,
            });
          }}
        >
          {chapters.map((chapter) => (
            <option key={chapter} value={chapter}>
              {chapter}
            </option>
          ))}
        </select>
      </label>

      <label>
        Verse
        <select
          value={bcv ? `${bcv.verse}|${bcv.part ?? ""}` : ""}
          aria-label={`${side} verse`}
          disabled={!bcv}
          onChange={(event) => {
            if (!bcv) {
              return;
            }
            const [verseRaw, partRaw = ""] = event.target.value.split("|");
            session.setColumnBcv(side, {
              ...bcv,
              verse: Number(verseRaw),
              part: partRaw || null,
            });
          }}
        >
          {verses.map((v) => (
            <option
              key={`${v.verse}|${v.part ?? ""}`}
              value={`${v.verse}|${v.part ?? ""}`}
            >
              {formatVerseLabel(v.verse)}
              {v.part ? v.part : ""}
            </option>
          ))}
        </select>
      </label>

      <label>
        Versification
        <select
          value={selectedVers ?? ""}
          aria-label={`${side} versification`}
          disabled={!translationId || associations.length === 0}
          onChange={(event) =>
            session.setColumnVersification(side, event.target.value || null)
          }
        >
          <option value="">Preferred (default)</option>
          {associations.map((assoc) => {
            const scheme = session.versifications.find((v) => v.id === assoc.scheme_id);
            const name = scheme?.name ?? assoc.scheme_id.slice(0, 8);
            return (
              <option key={assoc.scheme_id} value={assoc.scheme_id}>
                {formatVersificationOptionLabel({
                  name,
                  basedOnName: scheme?.based_on_name ?? null,
                  preferred: assoc.preferred,
                })}
              </option>
            );
          })}
        </select>
      </label>

      <JumpMenu side={side} disabled={resolveDisabled} />
    </div>
  );
}

/** Unique verse/part options from loaded chapter spans. */
function uniqueVerses(
  spans: { verse: number; part: string | null }[],
): { verse: number; part: string | null }[] {
  const seen = new Set<string>();
  const out: { verse: number; part: string | null }[] = [];
  for (const span of spans) {
    const key = `${span.verse}|${span.part ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({ verse: span.verse, part: span.part });
  }
  return out;
}
