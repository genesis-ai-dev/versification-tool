import { useMemo } from "react";
import { formatVerseLabel } from "../lib/formatRef";
import { formatVersificationOptionLabel } from "../lib/formatVersificationOption";
import type { DriveSide } from "./overlay/drawPlan";
import { JumpMenu } from "./JumpMenu";
import { TypeaheadSelect } from "./TypeaheadSelect";
import { useViewerSession } from "./ViewerSession";

/** Props for per-column translation / BCV / scheme chrome. */
export interface ColumnChromeProps {
  /** Physical column this chrome controls. */
  side: DriveSide;
  /** Disable jump/resolve-dependent controls when counterpart missing. */
  resolveDisabled: boolean;
}

/**
 * Translation selector, BCV typeaheads, scheme select, and jump menu.
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

  const bookOptions = useMemo(
    () => [
      { value: "", label: "—" },
      ...navigation.map((book) => ({
        value: book.book,
        label: jumpBooks.has(book.book) ? `${book.book} ●` : book.book,
      })),
    ],
    [navigation, jumpBooks],
  );

  const chapterOptions = useMemo(
    () =>
      chapters.map((chapter) => ({
        value: String(chapter),
        label: String(chapter),
      })),
    [chapters],
  );

  const verseOptions = useMemo(
    () =>
      verses.map((v) => ({
        value: `${v.verse}|${v.part ?? ""}`,
        label: `${formatVerseLabel(v.verse)}${v.part ? v.part : ""}`,
      })),
    [verses],
  );

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
        <TypeaheadSelect
          value={bcv?.book ?? ""}
          options={bookOptions}
          aria-label={`${side} book`}
          aria-describedby={translationId ? bookLegendId : undefined}
          disabled={!translationId}
          placeholder="—"
          onChange={(book) => {
            if (!bcv && !book) {
              return;
            }
            const bookNav = navigation.find((b) => b.book === book);
            const chapter = bookNav?.chapters[0] ?? 1;
            session.setColumnBcv(side, {
              book,
              chapter,
              verse: 1,
              part: null,
            });
          }}
        />
      </label>

      <label>
        Chapter
        <TypeaheadSelect
          value={bcv ? String(bcv.chapter) : ""}
          options={chapterOptions}
          aria-label={`${side} chapter`}
          disabled={!bcv}
          onChange={(chapterRaw) => {
            if (!bcv) {
              return;
            }
            session.setColumnBcv(side, {
              ...bcv,
              chapter: Number(chapterRaw),
              verse: 1,
              part: null,
            });
          }}
        />
      </label>

      <label>
        Verse
        <TypeaheadSelect
          value={bcv ? `${bcv.verse}|${bcv.part ?? ""}` : ""}
          options={verseOptions}
          aria-label={`${side} verse`}
          disabled={!bcv}
          onChange={(verseKey) => {
            if (!bcv) {
              return;
            }
            const [verseRaw, partRaw = ""] = verseKey.split("|");
            session.setColumnBcv(side, {
              ...bcv,
              verse: Number(verseRaw),
              part: partRaw || null,
            });
          }}
        />
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
