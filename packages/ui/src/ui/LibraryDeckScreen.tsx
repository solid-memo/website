import { licenseLabel } from "@solid-memo/domain/license";
import { keywordsIn } from "@solid-memo/domain/keywords";
import { topicLabels, type LibraryDeck, type LibrarySource } from "@solid-memo/domain/library";
import { AuthorNames } from "./AuthorName";
import { ErrorMessage } from "./ErrorMessage";
import { ExternalLink } from "./ExternalLink";
import { useI18n, type ErrorText } from "./i18n";
import { LibraryIcon } from "./icons";
import { linkify } from "./linkify";
import { ReaderText, ReaderTexts } from "./ReaderText";

/**
 * One library deck in full — its blurb, what it is about (its keywords
 * only those in the reader's language), who made it
 * and under what terms, when it was made and last changed, which
 * release it is and what changed in it, and what it was compiled from —
 * with a look at its cards and an import button for this deck alone.
 * A course (docs/courses.md) is started instead of imported: its cards
 * join the learner's deck as its questions are answered. Everything
 * shown comes from the library index, or from a release added from a
 * link (`host`, where it is published, then said, with what it is), so
 * any link in it goes through ExternalLink. A release from a link has no
 * card list or preview to link to.
 */
export function LibraryDeckScreen({
  deck,
  host,
  browseHref,
  previewHref,
  imported,
  busy,
  error,
  onImport,
  onStartCourse,
}: {
  deck: LibraryDeck;
  /** The host a release added from a link is published on; none for the library's. */
  host?: string;
  /** URL of the deck's card list; none for a release from a link. */
  browseHref?: string;
  /** URL of the deck's preview, which tries its cards before import; none for a release from a link. */
  previewHref?: string;
  /**
   * The instance already holds a copy; a second one is still allowed,
   * but a course is started once: it is continued.
   */
  imported: boolean;
  /** The import, or the start of a course, is in progress. */
  busy: boolean;
  error: ErrorText | null;
  onImport: () => void;
  /** Starts the course, or goes on with it (a course only). */
  onStartCourse: () => void;
}) {
  const { t, locale, readerText, readerLang, formatDate, directionLabel } = useI18n();
  const topics = topicLabels(deck.themes);
  /** Only those in the reader's language: none in it, no keywords shown. */
  const keywords = keywordsIn(deck.keywords, locale);
  const current = deck.releases.find((release) => release.url === deck.url);
  return (
    <section>
      <header>
        <h2>
          <LibraryIcon />
          <ReaderText text={deck.title} />
        </h2>
        {browseHref !== undefined && (
          <a class="button" href={browseHref}>
            {t("libraryDeck.browseCards")}
          </a>
        )}
      </header>
      {deck.description !== undefined && (
        <p class="deck-description" lang={readerLang(deck.description)}>
          {linkify(readerText(deck.description))}
        </p>
      )}
      {deck.isCourse === true && <p class="hint">{t("libraryDeck.courseChapters")}</p>}
      <dl class="facts">
        {host !== undefined && (
          <>
            <dt>{t("libraryDeck.host")}</dt>
            <dd>{host}</dd>
            <dt>{t("libraryDeck.kind")}</dt>
            <dd>{deck.isCourse === true ? t("libraryDeck.kindCourse") : t("libraryDeck.kindDeck")}</dd>
          </>
        )}
        <dt>{t("libraryDeck.size")}</dt>
        <dd>{t("common.cardCount", { count: deck.cardCount })}</dd>
        <dt>{t("libraryDeck.studied")}</dt>
        <dd>
          {deck.direction === "bidirectional"
            ? t("libraryDeck.bothWays", { direction: directionLabel(deck.direction) })
            : directionLabel(deck.direction)}
        </dd>
        {topics.length > 0 && (
          <>
            <dt>{t("libraryDeck.topics", { count: topics.length })}</dt>
            <dd>
              <ReaderTexts texts={topics} />
            </dd>
          </>
        )}
        {keywords.length > 0 && (
          <>
            <dt>{t("libraryDeck.keywords")}</dt>
            <dd>{keywords.join(", ")}</dd>
          </>
        )}
        <dt>{t("libraryDeck.release")}</dt>
        <dd>
          {current?.issued === undefined
            ? t("libraryDeck.version", { version: deck.version })
            : t("libraryDeck.versionReleased", {
                version: deck.version,
                date: formatDate(current.issued),
              })}
        </dd>
        {deck.versionNotes !== undefined && (
          <>
            <dt>{t("libraryDeck.releaseNotes")}</dt>
            <dd>{deck.versionNotes}</dd>
          </>
        )}
        {deck.authors.length > 0 && (
          <>
            <dt>{t("libraryDeck.authors", { count: deck.authors.length })}</dt>
            <dd>
              <AuthorNames authors={deck.authors} />
            </dd>
          </>
        )}
        {deck.license !== undefined && (
          <>
            <dt>{t("libraryDeck.licence")}</dt>
            <dd>
              <ExternalLink url={deck.license}>
                {licenseLabel(deck.license)}
              </ExternalLink>
            </dd>
          </>
        )}
        {deck.createdAt !== undefined && (
          <>
            <dt>{t("libraryDeck.created")}</dt>
            <dd>{formatDate(deck.createdAt)}</dd>
          </>
        )}
        {deck.modifiedAt !== undefined && (
          <>
            <dt>{t("libraryDeck.updated")}</dt>
            <dd>{formatDate(deck.modifiedAt)}</dd>
          </>
        )}
        {deck.sources.length > 0 && (
          <>
            <dt>{t("libraryDeck.sources", { count: deck.sources.length })}</dt>
            <dd>
              <ul class="sources">
                {deck.sources.map((source) => (
                  <li key={source.url}>
                    <SourceLine source={source} />
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>
      <div class="actions">
        {deck.isCourse === true ? (
          <button class="primary" onClick={onStartCourse} disabled={busy}>
            {busy
              ? t("libraryDeck.starting")
              : imported
                ? t("libraryDeck.continueCourse")
                : t("libraryDeck.startCourse")}
          </button>
        ) : (
          <button class="primary" onClick={onImport} disabled={busy}>
            {busy ? t("libraryDeck.importing") : t("libraryDeck.import")}
          </button>
        )}
        {previewHref !== undefined && (
          <a class="button" href={previewHref}>
            {t("libraryDeck.preview")}
          </a>
        )}
        {imported && deck.isCourse !== true && (
          <span class="hint library-imported">{t("libraryDeck.alreadyImported")}</span>
        )}
      </div>
      <ErrorMessage error={error} />
    </section>
  );
}

/**
 * "List of national capitals — Wikipedia contributors · CC BY-SA 4.0":
 * the source, linked, and its own authors and licence when the deck
 * states them.
 */
function SourceLine({ source }: { source: LibrarySource }) {
  const hasAuthors = source.authors.length > 0;
  const hasLicense = source.license !== undefined;
  return (
    <>
      <ExternalLink url={source.url}>{source.title ?? source.url}</ExternalLink>
      {(hasAuthors || hasLicense) && (
        <span class="hint">
          {" — "}
          {hasAuthors && <AuthorNames authors={source.authors} />}
          {hasAuthors && hasLicense && " · "}
          {hasLicense && (
            <ExternalLink url={source.license!}>
              {licenseLabel(source.license!)}
            </ExternalLink>
          )}
        </span>
      )}
    </>
  );
}
