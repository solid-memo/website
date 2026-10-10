import { useEffect, useRef, useState } from "preact/hooks";
import { filterLibraryDecks, topicsOf, type LibraryDeck } from "@solid-memo/domain/library";
import { ErrorMessage } from "./ErrorMessage";
import { LibraryIcon } from "./icons";
import { useI18n, type I18n, type ErrorText } from "./i18n";
import { ReaderText } from "./ReaderText";
import { forget, useRemembered } from "./remembered";

/** "Import selected" until something is ticked, then the count. */
function importLabel(t: I18n["t"], count: number): string {
  if (count === 0) return t("library.importSelected");
  return t("library.importDecks", { count });
}

/** How long the result count waits for the typing to settle before it is said. */
const ANNOUNCE_DELAY_MS = 500;

/**
 * Forgets the decks ticked on the library under `memoryKey`, once they
 * are imported; its filters are kept.
 */
export function forgetLibrarySelection(memoryKey: string): void {
  forget(`${memoryKey}:selected`);
}

/**
 * The deck library: ready-made decks to copy into the current instance.
 * Any number can be ticked and imported in one go. The list can be
 * narrowed to topics (checkboxes, from Solid Memo's topics scheme) and
 * by a search of names, descriptions and keywords, in every language
 * (filterLibraryDecks). A row says only the
 * deck's name and size; clicking it (anywhere but the checkbox and the
 * Preview button) opens the deck's own page, where it is described in
 * full and can be imported on its own. Preview tries its cards first.
 *
 * The filters sit outside the import form, so Enter in the search field
 * never imports, and only the ticked decks still shown are imported. A
 * hidden status line says the result count once the filters settle.
 *
 * The ticks and filters are remembered under `memoryKey`, so a look at a
 * deck's page or preview and back finds the list as it was left.
 */
export function LibraryScreen({
  decks,
  memoryKey,
  deckHref,
  previewHref,
  isImported,
  busy,
  error,
  onImport,
}: {
  decks: LibraryDeck[];
  /** Where the ticks and filters are kept between visits. */
  memoryKey: string;
  /** URL of a library deck's page; its name links there. */
  deckHref: (deck: LibraryDeck) => string;
  /** URL of a library deck's preview; its Preview button links there. */
  previewHref: (deck: LibraryDeck) => string;
  /** Whether the instance already holds a copy of the deck. */
  isImported: (deck: LibraryDeck) => boolean;
  /** An import is in progress. */
  busy: boolean;
  error: ErrorText | null;
  onImport: (decks: LibraryDeck[]) => void;
}) {
  const { t } = useI18n();
  const [selectedUrls, setSelectedUrls] = useRemembered<string[]>(`${memoryKey}:selected`, []);
  const [topics, setTopics] = useRemembered<string[]>(`${memoryKey}:topics`, []);
  const [query, setQuery] = useRemembered(`${memoryKey}:query`, "");
  const shown = filterLibraryDecks(decks, { topics, query });
  // A deck the filters hide stays ticked for when it shows again, but is
  // not imported: the import never includes what the user cannot see. A
  // course is never imported: it is started from its page, and its cards
  // join the deck as the learner answers them (docs/courses.md).
  const selected = shown.filter((deck) => deck.isCourse !== true && selectedUrls.includes(deck.url));
  const available = topicsOf(decks);
  const count =
    shown.length === decks.length
      ? t("library.deckCount", { count: decks.length })
      : t("library.shownCount", { shown: shown.length, count: decks.length });
  const result = shown.length === 0 ? t("library.noMatch") : count;
  // Silent until the user filters, so opening the screen says nothing.
  const filtered = useRef(false);
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    if (!filtered.current) return;
    const timer = setTimeout(() => setAnnounced(result), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [result, topics, query]);

  function toggleTopic(topic: string, checked: boolean) {
    filtered.current = true;
    setTopics((current) =>
      checked ? [...current, topic] : current.filter((t) => t !== topic),
    );
  }

  function toggle(deck: LibraryDeck, checked: boolean) {
    setSelectedUrls((urls) =>
      checked
        ? [...urls, deck.url]
        : urls.filter((url) => url !== deck.url),
    );
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (busy) return;
    onImport(selected);
  }

  return (
    <section>
      <header>
        <h2>
          <LibraryIcon />
          {t("library.heading")}
        </h2>
        <span class="hint">{count}</span>
      </header>
      <p>{t("library.intro")}</p>
      {decks.length === 0 ? (
        <p>{t("library.empty")}</p>
      ) : (
        <>
          <div class="library-filters" role="search">
            {available.length > 0 && (
              <fieldset class="library-topics">
                <legend>{t("library.topics")}</legend>
                {available.map((topic) => (
                  <label key={topic.iri} class="checkbox-option">
                    <input
                      type="checkbox"
                      checked={topics.includes(topic.iri)}
                      onChange={(e) => toggleTopic(topic.iri, e.currentTarget.checked)}
                    />
                    <ReaderText text={topic.label} />
                  </label>
                ))}
              </fieldset>
            )}
            <label for="library-search">{t("library.search")}</label>
            <input
              id="library-search"
              type="search"
              value={query}
              placeholder={t("library.searchPlaceholder")}
              onInput={(e) => {
                filtered.current = true;
                const value = e.currentTarget.value;
                setQuery(() => value);
              }}
            />
            <div class="visually-hidden" role="status">
              {announced}
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            {shown.length === 0 && <p>{t("library.noMatch")}</p>}
            <ul class="library-list">
              {shown.map((deck) => (
                <li key={deck.url}>
                  <LibraryDeckRow
                    deck={deck}
                    selected={selectedUrls.includes(deck.url)}
                    imported={isImported(deck)}
                    busy={busy}
                    deckHref={deckHref(deck)}
                    previewHref={previewHref(deck)}
                    onToggle={(checked) => toggle(deck, checked)}
                  />
                </li>
              ))}
            </ul>
            {/* Only aria-disabled while it imports, so it keeps the focus. */}
            <button type="submit" disabled={!busy && selected.length === 0} aria-disabled={busy}>
              {busy ? t("library.importing") : importLabel(t, selected.length)}
            </button>
            <p class="visually-hidden" role="status">
              {busy ? t("library.importing") : ""}
            </p>
          </form>
        </>
      )}
      <ErrorMessage error={error} />
    </section>
  );
}

/**
 * One deck of the library's list (LibraryScreen): a box to tick it (a
 * course has none, being started from its page), its name, linking to
 * its page, its size, that it is a course or already imported, and its
 * Preview button. The Studio shows a draft's row as learners will see
 * it (docs/studio.md, The listing preview).
 */
export function LibraryDeckRow({
  deck,
  selected,
  imported,
  busy,
  deckHref,
  previewHref,
  onToggle,
}: {
  deck: LibraryDeck;
  selected: boolean;
  imported: boolean;
  busy: boolean;
  deckHref: string;
  previewHref: string;
  onToggle: (checked: boolean) => void;
}) {
  const { t, readerText } = useI18n();
  return (
    <>
      {/* A 44px target above the row's link, so a near miss
          ticks the deck instead of leaving the screen. A course
          has none, only its place: it is started from its page. */}
      {deck.isCourse === true ? (
        <span class="library-pick" aria-hidden="true" />
      ) : (
        <label class="library-pick">
          <input
            type="checkbox"
            aria-label={readerText(deck.title)}
            checked={selected}
            disabled={busy}
            onChange={(e) => onToggle(e.currentTarget.checked)}
          />
        </label>
      )}
      <a class="library-deck-name" href={deckHref}>
        <ReaderText text={deck.title} />
      </a>
      <span class="library-deck-meta">
        <span class="hint">{t("common.cardCount", { count: deck.cardCount })}</span>
        {deck.isCourse === true && <span class="hint library-course">{t("library.course")}</span>}
        {imported && (
          <span class="hint library-imported">{t("library.alreadyImported")}</span>
        )}
      </span>
      <a
        class="button library-preview"
        href={previewHref}
        aria-label={t("library.previewDeck", { deck: readerText(deck.title) })}
      >
        {t("library.preview")}
      </a>
    </>
  );
}
