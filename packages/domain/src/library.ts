import { TOPICS } from "@solid-memo/vocab/concepts.generated";
import type { CardContent, Deck, DeckDirection } from "./deck";
import { allKeywords, type LangTexts } from "./keywords";
import type { LangText } from "./langText";
import { librarySeriesUrlOf } from "./libraryLayout";
import { matchesQuery } from "./search";

/**
 * A ready-made deck the app offers for import, as the deck library's
 * index lists it: a series of releases, described by its current one.
 * The library is read-only; importing copies the current release into
 * the user's own instance, where it becomes an ordinary Deck.
 */
export interface LibraryDeck {
  /** URL of the current release's document: what an import copies. */
  url: string;
  /** The deck across its releases: its series in the index. Its identity in the library. */
  seriesUrl: string;
  /** The current release's version: "1", "2", … */
  version: string;
  /** What changed in the current release, when it says. */
  versionNotes?: string;
  /** Every release, oldest first, the current one last. */
  releases: LibraryRelease[];
  /** dcat:theme concepts: the EU education theme and Solid Memo's topics. */
  themes: string[];
  /** The current release's keywords, per language (see keywords.ts). */
  keywords: LangTexts;
  /** The deck's title, in every language it states it in (one of them English). */
  title: LangText;
  cardCount: number;
  authors: string[];
  license?: string;
  /** A sentence or two about the deck, in every language it states it in. */
  description?: LangText;
  /** How the deck is meant to be studied; adjustable after import. */
  direction: DeckDirection;
  /** When the deck was made (ISO 8601), when it says. */
  createdAt?: string;
  /** When the deck was last changed (ISO 8601), when it says. */
  modifiedAt?: string;
  /** Where its content came from, as the deck states. */
  sources: LibrarySource[];
  /**
   * Set when the current release is a course (also typed schema:Course,
   * see docs/courses.md): chapters of steps whose questions are its
   * cards, studied through the course before they join the learner's deck.
   */
  isCourse?: true;
  /** Set on the course the library's index offers to newcomers (solid-memo:newcomerCourse on its catalogue): at most one deck, always a course. */
  forNewcomers?: true;
}

/** One release of a library deck, as the index describes it. */
export interface LibraryRelease {
  url: string;
  version: string;
  /** When it was released (ISO 8601), when the index says. */
  issued?: string;
  /** What changed in it, when it says. */
  notes?: string;
}

/**
 * A resource a library deck was compiled from, with what the deck says
 * about it. The authors and licence are the source's own, not the
 * deck's: a CC0 deck may well be compiled from a CC BY-SA page.
 */
export interface LibrarySource {
  url: string;
  title?: string;
  authors: string[];
  license?: string;
}

/** A library deck's full content: one release, fetched when it is imported. */
export interface LibraryDeckContent {
  /** URL of the release document: the release's identity. */
  url: string;
  /** The deck's title, in every language it states it in (one of them English). */
  title: LangText;
  formatVersion: number;
  authors: string[];
  license?: string;
  /** A sentence or two about the deck, in every language it states it in. */
  description?: LangText;
  direction: DeckDirection;
  /** The release's version within its deck: "1", "2", … */
  version: string;
  /** The deck across its releases: its series in the library index. */
  seriesUrl: string;
  /** What changed in this release, when it says. */
  versionNotes?: string;
  /** When the release's content was last changed (ISO 8601), when it says. */
  modifiedAt?: string;
  /** dcat:theme concepts: the EU education theme and Solid Memo's topics. */
  themes: string[];
  /**
   * The release's keywords, per language; an older release's untagged
   * ones under "" (see keywords.ts).
   */
  keywords: LangTexts;
  cards: LibraryCard[];
  /** Set when the release is a course (see LibraryDeck.isCourse); its outline is read with DeckLibrary.fetchCourseOutline. */
  isCourse?: true;
}

export interface LibraryCard extends CardContent {
  /** Fragment id in the library document; kept as the card's id on import. */
  id: string;
  formatVersion: number;
  /**
   * Set when the release retires the card: the deck no longer uses it,
   * but keeps it so copies keep it and its review state. An import
   * copies it retired.
   */
  retired?: true;
}

/** Whether a deck in the pod is a copy of a library deck, of any of its releases. */
export function isCopyOf(deck: Deck, libraryDeck: LibraryDeck): boolean {
  return deck.sourceUrl !== undefined && librarySeriesUrlOf(deck.sourceUrl) === libraryDeck.seriesUrl;
}

/** A topic of Solid Memo's topics scheme, as the library lists them: its label in English and Swedish. */
export interface Topic {
  iri: string;
  label: LangText;
}

/**
 * The topics the decks are classified with, in the scheme's order: each
 * topic a deck names, and the broader topic above it, so "Languages"
 * finds the Swedish decks.
 */
export function topicsOf(decks: readonly LibraryDeck[]): Topic[] {
  const named = new Set(decks.flatMap((deck) => deck.themes));
  const broader: string[] = TOPICS.concepts
    .filter((concept) => named.has(concept.iri))
    .flatMap((concept) => ("broader" in concept ? [concept.broader] : []));
  return TOPICS.concepts
    .filter((concept) => named.has(concept.iri) || broader.includes(concept.iri))
    .map((concept) => ({ iri: concept.iri, label: concept.label }));
}

/** The labels (in English and Swedish) of the Solid Memo topics among a deck's themes, in the scheme's order. */
export function topicLabels(themes: readonly string[]): LangText[] {
  return TOPICS.concepts.filter((concept) => themes.includes(concept.iri)).map((concept) => concept.label);
}

/** Whether a deck is about a topic: it names the topic, or a narrower one. */
function isAbout(deck: LibraryDeck, topic: string): boolean {
  return deck.themes.some(
    (theme) =>
      theme === topic ||
      TOPICS.concepts.some((c) => c.iri === theme && "broader" in c && c.broader === topic),
  );
}

/**
 * The decks about every chosen topic whose title, description or
 * keywords, in any language, contain the query (case-insensitively,
 * whatever its Unicode form: see search.ts); all of them when nothing is
 * chosen or typed.
 */
export function filterLibraryDecks(
  decks: readonly LibraryDeck[],
  { topics, query }: { topics: readonly string[]; query: string },
): LibraryDeck[] {
  return decks.filter(
    (deck) =>
      topics.every((topic) => isAbout(deck, topic)) &&
      matchesQuery([...Object.values(deck.title), ...Object.values(deck.description ?? {}), ...allKeywords(deck.keywords)], query),
  );
}

/**
 * Whether the library has a release of the copy's deck newer than the
 * one the copy came from, as its index tells without reading a release
 * or the copy's cards: not when the copy is of the current release, or
 * of one the index lists as no older. A release the index does not list
 * may be older: planLibraryUpgrade reads both to tell.
 */
export function offersNewerRelease(deck: Deck, series: LibraryDeck): boolean {
  if (series.url === deck.sourceUrl) return false;
  const copied = series.releases.find((release) => release.url === deck.sourceUrl);
  return copied === undefined || Number(series.version) > Number(copied.version);
}

/** A deck in the pod copied from a library release (it has prov:wasDerivedFrom), as the library's index sees it. */
export interface LibraryCopy {
  deck: Deck;
  /** The library deck it is a copy of; null when the index no longer lists its series. */
  series: LibraryDeck | null;
  /** The version of the release it was copied from; null when the index does not list that release. */
  version: string | null;
  /** Whether the library has a newer release to offer (offersNewerRelease); planLibraryUpgrade says what it would change. */
  newer: boolean;
}

/**
 * The decks copied from a library release, in their order, each with its
 * deck in the library: the index is looked up once a series, however
 * many copies of it there are. Home-made decks are left out.
 */
export function libraryCopiesOf(decks: readonly Deck[], library: readonly LibraryDeck[]): LibraryCopy[] {
  const bySeries = new Map(library.map((libraryDeck) => [libraryDeck.seriesUrl, libraryDeck]));
  return decks.flatMap((deck): LibraryCopy[] => {
    if (deck.sourceUrl === undefined) return [];
    const series = bySeries.get(librarySeriesUrlOf(deck.sourceUrl)) ?? null;
    if (series === null) return [{ deck, series, version: null, newer: false }];
    const version =
      series.url === deck.sourceUrl
        ? series.version
        : (series.releases.find((release) => release.url === deck.sourceUrl)?.version ?? null);
    return [{ deck, series, version, newer: offersNewerRelease(deck, series) }];
  });
}
