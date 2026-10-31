// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useId, useRef, useState } from "preact/hooks";
import { keywordsIn } from "@solid-memo/domain/keywords";
import { topicLabels, type LibraryDeck, type LibrarySource } from "@solid-memo/domain/library";
import type { ReportPlace } from "@solid-memo/domain/mistakeReport";
import { AuthorNames } from "./AuthorName";
import { cardLanguageNames } from "./cardLanguageNames";
import { ErrorMessage } from "./ErrorMessage";
import { DataLink, LicenseLink } from "./DataLink";
import { useI18n, type ErrorText } from "./i18n";
import { LibraryIcon } from "./icons";
import { linkify } from "./linkify";
import { ReaderText, ReaderTexts } from "./ReaderText";
import { ReportMistake } from "./ReportMistake";

/**
 * One library deck in full — its blurb, the languages its cards are in,
 * what it is about (its keywords only those in the reader's language), who made it
 * and under what terms, when it was made and last changed, which
 * release it is and what changed in it, and what it was compiled from —
 * with a look at its cards and an import button for this deck alone.
 * A course (docs/courses.md) is started instead of imported: its cards
 * join the learner's deck as its questions are answered. Everything
 * shown comes from the library index, or from a release added from a
 * link (`host`, where it is published, then said, with what it is), so
 * any link in it shows where it leads (DataLink). A release from a link has no
 * card list or preview to link to, nor a link to the deck to copy. A
 * mistake in the release is reported where `reportPlace` says
 * (ReportMistake): to the library for one the library's index lists,
 * however it was reached, else to the contact the release names, if any.
 */
export function LibraryDeckScreen({
  deck,
  host,
  browseHref,
  previewHref,
  shareUrl,
  imported,
  busy,
  error,
  onImport,
  onStartCourse,
  reportPlace,
}: {
  deck: LibraryDeck;
  /** The host a release added from a link is published on; none for the library's. */
  host?: string;
  /** URL of the deck's card list; none for a release from a link. */
  browseHref?: string;
  /** URL of the deck's preview, which tries its cards before import; none for a release from a link. */
  previewHref?: string;
  /** The address anyone can open the deck at (`#/try`), to copy; none for a release from a link. */
  shareUrl?: string;
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
  /** Where a mistake in the release is reported (UseCases.reportPlace); none while it is read. */
  reportPlace?: ReportPlace;
}) {
  const { t, locale, readerText, readerLang, formatDate, directionLabel, languageParts } =
    useI18n();
  const topics = topicLabels(deck.themes);
  const languages = cardLanguageNames(deck, languageParts);
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
            <dd>
              {deck.isCourse === true ? t("libraryDeck.kindCourse") : t("libraryDeck.kindDeck")}
            </dd>
          </>
        )}
        <dt>{t("libraryDeck.size")}</dt>
        <dd>{t("common.cardCount", { count: deck.cardCount })}</dd>
        {languages.length > 0 && (
          <>
            <dt>{t("libraryDeck.cardLanguages", { count: languages.length })}</dt>
            <dd>{languages.join(", ")}</dd>
          </>
        )}
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
              <LicenseLink url={deck.license} />
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
              <SourceList sources={deck.sources} />
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
        {shareUrl !== undefined && <ShareLink url={shareUrl} />}
        {imported && deck.isCourse !== true && (
          <span class="hint library-imported">{t("libraryDeck.alreadyImported")}</span>
        )}
      </div>
      <ErrorMessage error={error} />
      {reportPlace !== undefined && <ReportMistake place={reportPlace} releaseUrl={deck.url} />}
    </section>
  );
}

/**
 * "Copy link": the deck's address for anyone, copied to the clipboard,
 * and a status line that says so. A browser that will not copy it (no
 * clipboard, or permission refused) shows the address instead, in a
 * field that takes the focus with it selected, to copy by hand.
 */
function ShareLink({ url }: { url: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<boolean | null>(null);
  const fieldId = useId();
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (copied !== false) return;
    field.current!.focus();
    field.current!.select();
  }, [copied]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      <button type="button" onClick={() => void copy()}>
        {t("libraryDeck.copyLink")}
      </button>
      <span role="status" class="hint">
        {copied === true && t("libraryDeck.linkCopied")}
      </span>
      {copied === false && (
        <span class="share-link">
          <label for={fieldId}>{t("libraryDeck.copyFailed")}</label>
          <input id={fieldId} ref={field} type="url" readOnly value={url} />
        </span>
      )}
    </>
  );
}

/** More sources than this are folded away, so they don't push the buttons below them far down. */
const SOURCES_SHOWN = 5;

/** A release's sources, each on its own line; a long list behind a disclosure, closed. */
function SourceList({ sources }: { sources: LibrarySource[] }) {
  const { t } = useI18n();
  const list = (
    <ul class="sources">
      {sources.map((source) => (
        <li key={source.url}>
          <SourceLine source={source} />
        </li>
      ))}
    </ul>
  );
  if (sources.length <= SOURCES_SHOWN) return list;
  return (
    <details>
      <summary>{t("libraryDeck.sourceCount", { count: sources.length })}</summary>
      {list}
    </details>
  );
}

/**
 * "List of national capitals — Wikipedia contributors · CC BY-SA 4.0":
 * the source, linked, and its own authors and license when the deck
 * states them.
 */
function SourceLine({ source }: { source: LibrarySource }) {
  const hasAuthors = source.authors.length > 0;
  const hasLicense = source.license !== undefined;
  return (
    <>
      <DataLink url={source.url} label={source.title} />
      {(hasAuthors || hasLicense) && (
        <span class="hint">
          {" — "}
          {hasAuthors && <AuthorNames authors={source.authors} />}
          {hasAuthors && hasLicense && " · "}
          {hasLicense && <LicenseLink url={source.license!} />}
        </span>
      )}
    </>
  );
}
