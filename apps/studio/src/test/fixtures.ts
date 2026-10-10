import type { Card, Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryDeck } from "@solid-memo/domain/library";
import type { LibraryUpgradePlan } from "@solid-memo/domain/libraryUpgrade";
import type { Session } from "@solid-memo/domain/session";
import type { ValidationReport } from "@solid-memo/domain/validation";
import { applyDraftChanges, blankDraft, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { SM } from "@solid-memo/vocab/vocab.generated";

/** What the Studio's tests share: a user, two instances, and decks and cards in the first. */
export const session: Session = { webId: "https://alice.example/profile/card#me" };

export const instanceA: Instance = { url: "https://pod.example/solid-memo/a/", name: "Deck set A" };
export const instanceB: Instance = { url: "https://pod.example/solid-memo/b/", name: "Deck set B" };

export function makeDeck(id: string, title: Deck["title"]): Deck {
  return {
    id,
    url: `${instanceA.url}catalog.ttl#${id}`,
    title,
    cardsDocumentUrl: `${instanceA.url}decks/${id}.ttl`,
    reviewsDocumentUrl: `${instanceA.url}reviews/${id}.ttl`,
    direction: "front-to-back",
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 3,
    authors: [],
  };
}

export function makeCard(deck: Deck, id: string, retired = false): Card {
  return {
    id,
    url: `${deck.cardsDocumentUrl}#${id}`,
    front: { en: id },
    back: { en: id },
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 3,
    ...(retired ? { retired: true as const } : {}),
  };
}

/** A library deck at release 2, and a copy of a release of it. */
export const capitals: LibraryDeck = {
  url: "https://solid-memo.com/decks/capitals/v2.ttl",
  seriesUrl: "https://solid-memo.com/decks/index.ttl#capitals",
  version: "2",
  releases: [
    { url: "https://solid-memo.com/decks/capitals/v1.ttl", version: "1" },
    { url: "https://solid-memo.com/decks/capitals/v2.ttl", version: "2", notes: "Norway added." },
  ],
  themes: [],
  keywords: {},
  title: { en: "Capitals" },
  cardCount: 3,
  authors: [],
  direction: "front-to-back",
  sources: [],
};

export function makeCopy(id: string, title: Deck["title"], version: "1" | "2"): Deck {
  return { ...makeDeck(id, title), sourceUrl: `https://solid-memo.com/decks/capitals/v${version}.ttl` };
}

/** What upgrading a copy of release 1 to release 2 does: a card added, one changed, one removed. */
export function makePlan(deck: Deck): LibraryUpgradePlan {
  return {
    fromVersion: "1",
    toVersion: "2",
    releaseUrl: capitals.url,
    notes: [{ version: "2", notes: "Norway added." }],
    add: [{ id: "norway", front: { en: "Norway" }, back: { en: "Oslo" }, formatVersion: 3 }],
    change: [{ id: "sweden", front: { en: "Sweden" }, back: { en: "Stockholm" }, formatVersion: 3 }],
    retire: [],
    restore: [],
    remove: [makeCard(deck, "latvia")],
    kept: [],
    applied: [],
    gone: [],
    appliedAbout: [],
  };
}

/**
 * The check of instance A, finding a violation in each of these decks'
 * cards documents, and in the catalogue when asked: under "set invalid
 * data aside", those decks are set aside, and the arrangement with the
 * catalogue.
 */
export function invalidReport(decks: readonly Deck[], { catalogue = false } = {}): ValidationReport {
  const violation = { message: { en: "Less than 1 values" }, severity: "violation" as const, constraint: "MinCount" };
  return {
    instanceUrl: instanceA.url,
    violationCount: decks.length + (catalogue ? 1 : 0),
    conforms: false,
    documents: [
      ...decks.map((deck) => ({
        url: deck.cardsDocumentUrl,
        status: "checked" as const,
        subjects: [{ url: `${deck.cardsDocumentUrl}#c1`, status: "checked" as const, shape: "card" as const, version: 5, violations: [violation] }],
      })),
      ...(catalogue
        ? [
            {
              url: `${instanceA.url}catalog.ttl`,
              status: "checked" as const,
              subjects: [{ url: `${instanceA.url}catalog.ttl#catalog`, status: "checked" as const, shape: "catalog" as const, version: 1, violations: [violation] }],
            },
          ]
        : []),
    ],
  };
}

/** A draft of a course in instance A. */
export const DRAFT_URL = `${instanceA.url}drafts/solid/v1/release.ttl`;

/**
 * A course draft: chapter `ch-pods` (step `ch-pods-1`, its theory plain
 * and asking `q-pods-1a`, which has one wrong option; step `ch-pods-2`,
 * its theory in Markdown, asking none; review question `q-pods-r01`) and
 * chapter `ch-apps`, with no steps.
 */
export function courseDraft(): ReleaseDraft {
  const blank = blankDraft({ url: DRAFT_URL, course: true, title: { en: "Solid" }, now: "2026-10-10T10:00:00.000Z" });
  return applyDraftChanges(blank, [
    { kind: "addChapter", id: "ch-pods", text: { title: { en: "Pods" } } },
    { kind: "addChapter", id: "ch-apps", text: { title: { en: "Apps" } } },
    { kind: "addStep", id: "ch-pods-1", chapter: "ch-pods", text: { theory: { en: "A pod holds data." } } },
    { kind: "addStep", id: "ch-pods-2", chapter: "ch-pods", text: { theory: { en: "## Two\n\nMore." }, textFormat: SM.markdown } },
    { kind: "addCard", id: "q-pods-1a", card: { front: { en: "What holds data?" }, back: { en: "A pod" }, created: "2026-10-10T10:00:00.000Z" } },
    { kind: "addQuestion", card: "q-pods-1a", place: { kind: "step", step: "ch-pods-1" } },
    { kind: "addDistractor", card: "q-pods-1a", id: "q-pods-1a-d1", distractor: { text: { en: "An app" }, note: { en: "Apps use data." } } },
    { kind: "addCard", id: "q-pods-r01", card: { front: { en: "Who owns a pod?" }, back: { en: "Its user" } } },
    { kind: "addQuestion", card: "q-pods-r01", place: { kind: "review", chapter: "ch-pods" } },
  ]) as ReleaseDraft;
}

/** What a draft's screens link to, in their tests. */
export const draftLinks = {
  draftsHref: "#/drafts",
  healthHref: "#/health",
  overviewHref: "#/draft",
  cardsHref: "#/draft-cards",
  chapterHref: (chapter: string) => `#/chapter/${chapter}`,
  stepHref: (step: string) => `#/step/${step}`,
  questionHref: (card: string) => `#/question/${card}`,
  checkHref: "#/check",
  previewHref: "#/preview",
  trialHref: "#/trial",
  diffHref: "#/diff",
};
