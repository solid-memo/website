import type { Course } from "@solid-memo/application/useCases";
import { courseProgress, type CourseOutline } from "@solid-memo/domain/course";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryCard, LibraryDeck } from "@solid-memo/domain/library";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";

/*
 * A small course for the course screens' tests: two chapters, the first
 * with two steps (the second asking two questions) and a review question
 * of its own, the second with one step.
 */

export const courseInstance: Instance = {
  url: "https://pod.example/solid-memo/a/",
  name: "Study",
};

export const RELEASE = "https://solid-memo.com/decks/solid/v1.ttl";

export const courseLibraryDeck: LibraryDeck = {
  url: RELEASE,
  ...firstRelease(RELEASE),
  title: { en: "Solid fundamentals", sv: "Solids grunder" },
  cardCount: 5,
  authors: [],
  direction: "front-to-back",
  sources: [],
  isCourse: true,
};

export const courseDeck: Deck = {
  id: "deck-1",
  url: `${courseInstance.url}catalog.ttl#deck-1`,
  title: { en: "Solid fundamentals" },
  cardsDocumentUrl: `${courseInstance.url}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${courseInstance.url}reviews/deck-1.ttl`,
  direction: "front-to-back",
  createdAt: "2026-10-07T10:00:00.000Z",
  formatVersion: 6,
  authors: [],
  sourceUrl: RELEASE,
};

/** A question with its right answer and two wrong ones, the first of them explained. */
function question(id: string, front: string, back: string, backNote?: string): LibraryCard {
  return {
    id,
    formatVersion: 5,
    front: { en: front },
    back: { en: back },
    ...(backNote === undefined ? {} : { backNote: { en: backNote } }),
    distractors: [
      { id: `${id}-d1`, text: { en: `Not ${back}` }, note: { en: `Why not ${back}` } },
      { id: `${id}-d2`, text: { en: `Hardly ${back}` } },
    ],
  };
}

export const courseCards: LibraryCard[] = [
  question("q-1", "What names a thing?", "An IRI", "IRIs name anything."),
  question("q-2", "What is a triple?", "Three terms"),
  question("q-3", "What is Turtle?", "A syntax"),
  question("r-1", "Which is linked data?", "Data with links"),
  question("q-4", "What is a pod?", "A store"),
];

export const CH1 = `${RELEASE}#ch-1`;
export const CH2 = `${RELEASE}#ch-2`;

export const courseOutline: CourseOutline = {
  releaseUrl: RELEASE,
  chapters: [
    {
      id: "ch-1",
      url: CH1,
      position: 0,
      title: { en: "Linked data", sv: "Länkade data" },
      description: { en: "Names and links." },
      steps: [
        { id: "s-1", url: `${RELEASE}#s-1`, position: 0, theory: { en: "Things are named by IRIs." }, questionIds: ["q-1"] },
        {
          id: "s-2",
          url: `${RELEASE}#s-2`,
          position: 1,
          theory: { en: "A triple has three terms.\n\nTurtle writes them down." },
          questionIds: ["q-2", "q-3"],
        },
      ],
      reviewQuestionIds: ["r-1"],
    },
    {
      id: "ch-2",
      url: CH2,
      position: 1,
      title: { en: "Pods" },
      steps: [{ id: "s-3", url: `${RELEASE}#s-3`, position: 0, theory: { en: "A pod stores data." }, questionIds: ["q-4"] }],
      reviewQuestionIds: [],
    },
  ],
};

/** The course with the cards answered and the chapters completed. */
export function makeCourse(answeredCardIds: string[] = [], completed: string[] = []): Course {
  return {
    deck: { ...courseDeck, completedChapters: completed },
    release: {
      url: RELEASE,
      title: courseLibraryDeck.title,
      description: { en: "A course on Solid." },
      formatVersion: 5,
      authors: [],
      direction: "front-to-back",
      version: "1",
      seriesUrl: courseLibraryDeck.seriesUrl,
      themes: [],
      keywords: {},
      cards: courseCards,
      isCourse: true,
    },
    outline: courseOutline,
    cards: Object.fromEntries(courseCards.map((card) => [card.id, card])),
    answeredCardIds,
    progress: courseProgress(courseOutline, answeredCardIds, completed),
  };
}

/** A random source that leaves a shuffle in order. */
export const noShuffle = () => 0.999999;
