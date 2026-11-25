// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Card } from "@solid-memo/domain/deck";
import type { LibraryCard, LibraryDeck } from "@solid-memo/domain/library";
import type { LibraryUpgradePlan } from "@solid-memo/domain/libraryUpgrade";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";
import type { UnclaimedDeck, ValidationReport } from "@solid-memo/domain/validation";
import { storyDeck, storyInstance } from "../storyData";
import { pictureUrl } from "./cards";

/**
 * Data the stories of the deck library share (src/ui/Library*.stories.tsx,
 * the screen that adds a release from a link, and the data check's):
 * library decks in several card languages, topics and kinds, their cards,
 * an update's plan, and reports of a check of the instance. Nothing here
 * is read from or written to a pod or the library.
 */

/** Where the EU's table names a language. */
const LANGUAGE = "http://publications.europa.eu/resource/authority/language/";

/** Where Solid Memo's topics scheme names a topic. */
const TOPIC = "https://solid-memo.com/ns/vocab/topics.ttl#";

/** A library deck published only as release 1, at an address that is only linked to. */
export function libraryDeck(
  slug: string,
  title: LibraryDeck["title"],
  more: Partial<LibraryDeck> = {},
): LibraryDeck {
  const url = `https://solid-memo.com/decks/${slug}/v1.ttl`;
  return {
    url,
    ...firstRelease(url),
    title,
    cardCount: 40,
    languages: [],
    authors: [],
    direction: "front-to-back",
    sources: [],
    ...more,
  };
}

/** Capitals: in English and Swedish, about geography, described in full. */
export const capitalsLibraryDeck: LibraryDeck = libraryDeck(
  "capitals",
  { en: "Capitals of the world", sv: "Världens huvudstäder" },
  {
    cardCount: 243,
    languages: [`${LANGUAGE}ENG`, `${LANGUAGE}SWE`],
    themes: [`${TOPIC}geography`],
    keywords: { en: ["capitals", "countries"], sv: ["huvudstäder", "länder"] },
    authors: ["Anton Wiklund"],
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    description: {
      en: "Every country and its capital, from https://en.wikipedia.org/wiki/List_of_national_capitals.",
      sv: "Varje land och dess huvudstad.",
    },
    createdAt: "2026-03-01T10:00:00.000Z",
    modifiedAt: "2026-09-12T10:00:00.000Z",
    sources: [
      {
        url: "https://en.wikipedia.org/wiki/List_of_national_capitals",
        title: "List of national capitals",
        authors: ["Wikipedia contributors"],
        license: "https://creativecommons.org/licenses/by-sa/4.0/",
      },
    ],
  },
);

/** Korean words: Korean and English cards, studied both ways. */
export const koreanLibraryDeck: LibraryDeck = libraryDeck(
  "korean-words",
  { en: "Korean everyday words", ko: "한국어 생활 단어" },
  {
    cardCount: 150,
    languages: [`${LANGUAGE}KOR`, `${LANGUAGE}ENG`],
    themes: [`${TOPIC}korean`],
    direction: "bidirectional",
  },
);

/** Arabic greetings: Arabic and English cards, its name right to left. */
export const arabicLibraryDeck: LibraryDeck = libraryDeck(
  "arabic-greetings",
  { en: "Arabic greetings", ar: "تحيات عربية" },
  { cardCount: 30, languages: [`${LANGUAGE}ARA`, `${LANGUAGE}ENG`], themes: [`${TOPIC}arabic`] },
);

/** Kanji: Japanese and English cards. */
export const kanjiLibraryDeck: LibraryDeck = libraryDeck(
  "kanji-n5",
  { en: "Kanji N5" },
  { cardCount: 80, languages: [`${LANGUAGE}JPN`, `${LANGUAGE}ENG`], themes: [`${TOPIC}japanese`] },
);

/** A deck whose name is long enough to wrap, about chemistry, in Swedish. */
export const longTitleLibraryDeck: LibraryDeck = libraryDeck(
  "elements",
  {
    en: "Every element of the periodic table with its symbol, atomic number, group and the year it was discovered",
  },
  { cardCount: 118, languages: [`${LANGUAGE}SWE`], themes: [`${TOPIC}chemistry`] },
);

/** The library decks a usual listing shows. */
export const libraryDecks: LibraryDeck[] = [
  capitalsLibraryDeck,
  koreanLibraryDeck,
  arabicLibraryDeck,
  kanjiLibraryDeck,
  longTitleLibraryDeck,
];

/** Topics a long listing's decks are about, in turn. */
const MANY_TOPICS = ["history", "music", "art", "astronomy", "biology", "film"];

/** A long listing: sixty decks besides the usual ones. */
export const manyLibraryDecks: LibraryDeck[] = [
  ...libraryDecks,
  ...Array.from({ length: 60 }, (_, index) =>
    libraryDeck(
      `deck-${index + 1}`,
      { en: `Practice deck ${index + 1}` },
      {
        cardCount: 10 + index,
        languages: [`${LANGUAGE}ENG`],
        themes: [`${TOPIC}${MANY_TOPICS[index % MANY_TOPICS.length]}`],
      },
    ),
  ),
];

/** The instance's copy of the capitals deck: the library shows it as imported. */
export const importedCapitals = storyDeck(
  "capitals",
  { en: "Capitals of the world" },
  { sourceUrl: capitalsLibraryDeck.url },
);

/** A card of the library, its id and sides as given. */
export function libraryCard(
  id: string,
  front: LibraryCard["front"],
  back: LibraryCard["back"],
  more: Partial<LibraryCard> = {},
): LibraryCard {
  return { id, formatVersion: 7, front, back, ...more };
}

/** A capital, with a note under its answer. */
export const stockholmCard: LibraryCard = libraryCard(
  "sweden",
  { en: "Sweden" },
  { en: "Stockholm" },
  { backNote: { en: "The capital since the 13th century." } },
);

/** An Arabic card: its front runs right to left. */
export const arabicLibraryCard: LibraryCard = libraryCard(
  "hello",
  { ar: "مرحبا" },
  { en: "Hello" },
);

/** A card with a picture on its front. */
export const pictureLibraryCard: LibraryCard = libraryCard(
  "picture",
  { en: "What does the picture show?" },
  { en: "Flashcards" },
  {
    frontImageUrl: pictureUrl,
    frontImageDescription: { en: "Solid Memo's illustration of cards" },
  },
);

/** A card the release retires. */
export const retiredLibraryCard: LibraryCard = libraryCard(
  "yugoslavia",
  { en: "Yugoslavia" },
  { en: "Belgrade" },
  { retired: true },
);

/** A card whose sides are long enough to wrap. */
export const longLibraryCard: LibraryCard = libraryCard(
  "long",
  {
    en: "Which city has been the capital of the country since the unification, and also hosts its parliament, its supreme court and most of its ministries?",
  },
  { en: "A city whose name is long enough that it wraps on a phone, as some answers do" },
);

/** Library cards of every kind above. */
export const libraryCards: LibraryCard[] = [
  stockholmCard,
  arabicLibraryCard,
  pictureLibraryCard,
  longLibraryCard,
  retiredLibraryCard,
];

/** More cards than a page holds. */
export const manyLibraryCards: LibraryCard[] = Array.from({ length: 25 }, (_, index) =>
  libraryCard(
    `country-${index + 1}`,
    { en: `Country ${index + 1}` },
    { en: `Capital ${index + 1}` },
  ),
);

/** A card of the instance's copy, as an update's plan names it. */
function copyCard(id: string, front: string): Card {
  return {
    id,
    url: `${importedCapitals.cardsDocumentUrl}#${id}`,
    front: { en: front },
    back: { en: `The capital of ${front}` },
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 7,
  };
}

/** An update of the capitals deck from release 1 to 3: cards added, changed, removed and kept. */
export const upgradePlan: LibraryUpgradePlan = {
  fromVersion: "1",
  toVersion: "3",
  releaseUrl: "https://solid-memo.com/decks/capitals/v3.ttl",
  notes: [
    { version: "2", notes: "Added Norway." },
    { version: "3", notes: "Fixed the capital of Sweden." },
  ],
  add: [libraryCard("norway", { en: "Norway" }, { en: "Oslo" })],
  change: [stockholmCard],
  retire: [],
  restore: [],
  remove: [copyCard("iceland", "Iceland")],
  about: [],
  kept: [copyCard("finland", "Finland")],
  applied: [],
  gone: [],
  appliedAbout: [],
};

/** An update that retires many cards and changes how the deck is studied and named. */
export const bigUpgradePlan: LibraryUpgradePlan = {
  ...upgradePlan,
  toVersion: "12",
  notes: Array.from({ length: 11 }, (_, index) => ({
    version: `${index + 2}`,
    notes: `Release ${index + 2}: corrected capitals.`,
  })),
  remove: [],
  kept: [],
  retire: Array.from({ length: 14 }, (_, index) =>
    copyCard(`old-${index + 1}`, `Former country ${index + 1}`),
  ),
  direction: "bidirectional",
  title: { en: "Capitals of the world", sv: "Världens huvudstäder" },
};

/** The instance's documents, where its folder keeps them. */
const catalogUrl = `${storyInstance.url}catalog.ttl`;
const capitalsCards = `${storyInstance.url}decks/capitals.ttl`;
const capitalsReviews = `${storyInstance.url}reviews/capitals.ttl`;

/** A check of the instance that found nothing wrong. */
export const conformingReport: ValidationReport = {
  instanceUrl: storyInstance.url,
  documents: [
    {
      url: catalogUrl,
      status: "checked",
      subjects: [
        {
          url: `${catalogUrl}#this`,
          status: "checked",
          shape: "catalog",
          version: 3,
          violations: [],
        },
        {
          url: `${catalogUrl}#capitals`,
          status: "checked",
          shape: "deck",
          version: 6,
          violations: [],
        },
      ],
    },
    { url: capitalsCards, status: "checked", subjects: [] },
    { url: capitalsReviews, status: "missing", subjects: [] },
  ],
  violationCount: 0,
  conforms: true,
};

/** A check of the instance that found violations, warnings, a stray, a newer format and an unreadable document. */
export const failingReport: ValidationReport = {
  instanceUrl: storyInstance.url,
  documents: [
    {
      url: catalogUrl,
      status: "checked",
      subjects: [
        {
          url: `${catalogUrl}#capitals`,
          status: "checked",
          shape: "deck",
          version: 6,
          violations: [
            {
              path: "http://purl.org/dc/terms/title",
              message: { en: "A deck has a title.", sv: "En kortlek har en titel." },
              severity: "violation",
              constraint: "MinCount",
            },
            {
              path: "http://purl.org/dc/terms/created",
              message: { en: "Value is not a date." },
              builtIn: true,
              value: "yesterday",
              severity: "violation",
              constraint: "Datatype",
            },
          ],
        },
        {
          url: `${catalogUrl}#license`,
          status: "profiled",
          violations: [
            {
              message: { en: "A license has a type." },
              severity: "warning",
              constraint: "MinCount",
              profile: "dcat-ap",
            },
          ],
        },
        { url: `${catalogUrl}#stray`, status: "untyped" },
        { url: `${catalogUrl}#future`, status: "newer", shape: "deck", version: 9, latest: 6 },
      ],
    },
    {
      url: capitalsCards,
      status: "unreadable",
      subjects: [],
      reason: "Unexpected token on line 3",
    },
  ],
  violationCount: 3,
  conforms: false,
};

/** A check whose documents are more than a page shows. */
export const longReport: ValidationReport = {
  instanceUrl: storyInstance.url,
  documents: Array.from({ length: 60 }, (_, index) => ({
    url: `${storyInstance.url}decks/deck-${index + 1}.ttl`,
    status: "checked" as const,
    subjects: [
      {
        url: `${storyInstance.url}decks/deck-${index + 1}.ttl#card`,
        status: "checked" as const,
        shape: "card" as const,
        version: 7,
        violations: [
          {
            path: "https://solid-memo.com/ns/vocab#front",
            message: { en: "A card has a front." },
            severity: "violation" as const,
            constraint: "MinCount",
          },
        ],
      },
    ],
  })),
  violationCount: 60,
  conforms: false,
};

/** A deck whose documents, in the pod, don't say they are its own. */
export const unclaimedDeck: UnclaimedDeck = {
  deckUrl: `${catalogUrl}#capitals`,
  title: { en: "Capitals of the world" },
  documents: [
    "https://pod.example/elsewhere/capitals.ttl",
    "https://pod.example/elsewhere/reviews.ttl",
  ],
  outsidePod: [],
};

/** A deck with a document on another server: it may not be claimed. */
export const outsideDeck: UnclaimedDeck = {
  deckUrl: `${catalogUrl}#korean`,
  title: { en: "Korean everyday words", ko: "한국어 생활 단어" },
  documents: ["https://other.example/korean.ttl"],
  outsidePod: ["https://other.example/korean.ttl"],
};

/** More unclaimed decks than the notice lists. */
export const manyUnclaimedDecks: UnclaimedDeck[] = Array.from({ length: 55 }, (_, index) => ({
  deckUrl: `${catalogUrl}#deck-${index + 1}`,
  title: { en: `Practice deck ${index + 1}` },
  documents: [`https://pod.example/elsewhere/deck-${index + 1}.ttl`],
  outsidePod: [],
}));

/** Where a release is published outside the library: a pod, reached only by its link. */
export const linkedReleaseUrl = "https://pod.example/public/decks/birds/v1.ttl";

/** A deck published in someone's pod, read from its link. */
export const linkedRelease: LibraryDeck = {
  ...libraryDeck(
    "birds",
    { en: "Birds of Scandinavia", sv: "Skandinaviens fåglar" },
    {
      cardCount: 64,
      languages: [`${LANGUAGE}SWE`, `${LANGUAGE}ENG`],
      authors: ["A bird watcher"],
      description: { en: "Common birds, by their Swedish and English names." },
    },
  ),
  url: linkedReleaseUrl,
  ...firstRelease(linkedReleaseUrl),
};

/** A course published in someone's pod, read from its link. */
export const linkedCourse: LibraryDeck = { ...linkedRelease, isCourse: true };
