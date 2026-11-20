// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Many course decks that name one release share its outline, as the
 * library keeps it, frozen (libraryMapper.ts toCourseOutline). What is
 * worked out of the outline alone, the questions it asks, where its
 * chapters are and which steps of a chapter ask each card, is then
 * worked out once for all of them, not once per deck: the deck list's
 * course summaries (getCourseSummary) and the strip's standing of each
 * course (courseStandingOf), and the course table of the statistics
 * (getCourseStatistics). The reads of the outline's steps and chapters
 * are counted, not timed (testing.md), of an outline of many short
 * chapters, of one of a single long chapter, and of one whose long
 * chapter asks one card the decks have answered in most of its steps:
 * each deck adds a few, not one per chapter or per step. The course
 * decks that share one reviews document too, of many cards answered,
 * look those cards up once in all, not once per deck: the lookups are
 * counted. And decks that share that list but each have a chapter of
 * their own open read the list once in all, and each looks up a card or
 * so, however long the list: its reads and the lookups are counted.
 */
import { describe, expect, it, vi } from "vitest";
import type { Answer } from "@solid-memo/domain/answer";
import { courseStandingOf, type CourseOutline, type CourseStep } from "@solid-memo/domain/course";
import type { Deck } from "@solid-memo/domain/deck";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { ReviewStates } from "@solid-memo/domain/review";
import { emptyDigest } from "@solid-memo/domain/studyDigest";
import { createCourseUseCases } from "./courses";
import { createStatisticsUseCases } from "./statistics";
import { deck, instance, makeDeps } from "./testing/fakePorts";

const RELEASE = "https://library.example/course/v1.ttl";
const SIZE = 2000;
const AT = new Date(2026, 10, 20, 12, 0);

/** What is read of an outline: its chapters' subjects and titles, its steps' questions, and its steps' ids. */
interface Reads {
  chapters: number;
  steps: number;
  ids: number;
}

/**
 * How the outline is laid out: SIZE chapters of one step each
 * ("chapters"); or two chapters, the first of one step and the second
 * of SIZE ("steps"); each step asking a card of its own. Or ("shared")
 * the second chapter's SIZE steps all ask card q-1 but the last, which
 * asks q-2. Card q-0 is the first chapter's.
 */
type Shape = "chapters" | "steps" | "shared";

/** An outline of `shape`, frozen through, that counts what is read of it (Reads). */
function countedOutline(shape: Shape) {
  const reads: Reads = { chapters: 0, steps: 0, ids: 0 };
  const stepOf = (chapter: number, at: number, card: number): CourseStep => {
    const questionIds = Object.freeze([`q-${card}`]) as unknown as string[];
    return Object.freeze({
      get id() {
        reads.ids += 1;
        return `s-${chapter}-${at}`;
      },
      url: `${RELEASE}#s-${chapter}-${at}`,
      position: at,
      theory: { en: `Step ${at}` },
      get questionIds() {
        reads.steps += 1;
        return questionIds;
      },
    });
  };
  const sizes = shape === "chapters" ? Array.from({ length: SIZE }, () => 1) : [1, SIZE];
  let card = 0;
  const cardOf = (at: number, n: number) =>
    shape !== "shared" || at === 0 ? card++ : n < SIZE - 1 ? 1 : 2;
  const chapters = sizes.map((size, at) => {
    const steps = Object.freeze(
      Array.from({ length: size }, (_, n) => stepOf(at, n, cardOf(at, n))),
    ) as unknown as CourseStep[];
    return Object.freeze({
      id: `ch-${at}`,
      get url() {
        reads.chapters += 1;
        return `${RELEASE}#ch-${at}`;
      },
      position: at,
      get title() {
        reads.chapters += 1;
        return { en: `Chapter ${at}` };
      },
      reviewQuestionIds: Object.freeze([]) as unknown as string[],
      steps,
    });
  });
  const outline: CourseOutline = Object.freeze({
    releaseUrl: RELEASE,
    chapters: Object.freeze(chapters) as unknown as CourseOutline["chapters"],
  });
  return { outline, reads };
}

/**
 * What is read of the outline for `count` course decks naming its
 * release: the deck list's and the statistics'. Each deck has answered
 * q-0, and q-1 too of a "shared" outline.
 */
async function readsFor(shape: Shape, count: number) {
  const { outline, reads } = countedOutline(shape);
  const decks = Array.from(
    { length: count },
    (_, n): Deck => ({
      ...deck,
      url: `${instance.url}catalog.ttl#course-${n}`,
      reviewsDocumentUrl: `${instance.url}reviews/course-${n}.ttl`,
      sourceUrl: RELEASE,
      completedChapters: [`${RELEASE}#ch-0`],
    }),
  );
  // Each deck its own states, read once: the first question answered, of a "shared" outline the second too.
  const answeredIds = shape === "shared" ? ["q-0", "q-1"] : ["q-0"];
  const states = new Map(
    decks.map((one): [string, ReviewStates] => {
      const sm2 = Object.freeze(
        answeredIds.map((cardId) => ({
          cardId,
          direction: "front-to-back" as const,
          easeFactor: 2.5,
          intervalDays: 1,
          repetitions: 1,
          due: "2026-11-21",
          firstReviewedAt: "2026-11-19T10:00:00.000Z",
          lastReviewedAt: "2026-11-19T10:00:00.000Z",
          formatVersion: 2,
        })),
      );
      return [one.url, Object.freeze({ sm2, fsrs: Object.freeze([]) }) as unknown as ReviewStates];
    }),
  );
  const deps = makeDeps();
  vi.mocked(deps.deckLibrary.fetchCourseOutline).mockResolvedValue(outline);
  vi.mocked(deps.reviewStateRepository.listReviewStates).mockImplementation(
    async (one: Deck) => states.get(one.url)!,
  );
  const courses = createCourseUseCases({
    ...deps,
    preferenceStore: { get: async () => DEFAULT_PREFERENCES },
    answerStore: { grade: async () => undefined as never },
  });
  const answer: Answer = {
    id: "a-1",
    deckUrl: decks[0]!.url,
    cardUrl: `${deck.cardsDocumentUrl}#q-1`,
    direction: "front-to-back",
    grade: 3,
    answeredAt: "2026-11-19T10:00:00.000Z",
    studyDay: "2026-11-19",
    nextIntervalDays: 1,
    mode: "multiple-choice",
  };
  const statistics = createStatisticsUseCases({
    ...deps,
    preferenceStore: { get: async () => DEFAULT_PREFERENCES },
    answerStore: {
      flush: async () => undefined,
      readMonths: async () => [answer],
      logMonths: async () => ["2026-11"],
      loadAll: async () => [],
      knownAnswers: () => null,
    },
    digestStore: {
      of: async () => emptyDigest(),
      recordSchedule: () => undefined,
      remember: () => undefined,
    },
  });

  const summaries = await Promise.all(decks.map((one) => courses.getCourseSummary(one)));
  const standings = summaries.map((summary, n) =>
    courseStandingOf(summary.outline, summary.answeredCardIds, decks[n]!.completedChapters!),
  );
  const home = { ...reads };
  reads.chapters = 0;
  reads.steps = 0;
  reads.ids = 0;
  const results = await statistics.getCourseStatistics(instance.url, AT, decks);

  expect(summaries[count - 1]!.answeredCardIds).toEqual(answeredIds);
  expect(standings[count - 1]).toEqual({
    current: outline.chapters[1],
    progress: {
      url: `${RELEASE}#ch-1`,
      state: "open",
      resumeStepId: shape === "shared" ? `s-1-${SIZE - 1}` : "s-1-0",
    },
    done: 1,
  });
  expect(results).toHaveLength(count);
  expect(results[0]!.done).toBe(1);
  expect(results[0]!.chapters[1]).toMatchObject({ state: "open", quiz: { answers: 1, right: 1 } });
  // The answer is the first deck's alone.
  for (const other of results.slice(1))
    expect(other.chapters[1]!.quiz).toEqual({ answers: 0, right: 0 });
  // The statistics read no step.
  expect(reads.steps).toBe(0);
  expect(reads.ids).toBe(0);
  return { home, statistics: { ...reads } };
}

describe("course decks that name one release", () => {
  it("of many chapters, have its steps read once in all, and add a few chapters' reads each", async () => {
    const one = await readsFor("chapters", 1);
    const many = await readsFor("chapters", 200);
    // Each step's questions once, for the outline's index, then the open chapter's.
    expect(one.home.steps).toBe(SIZE + 1);
    expect(many.home.steps).toBe(SIZE + 1);
    // The step to resume at, a deck.
    expect(many.home.ids).toBe(200 * one.home.ids);
    expect(one.home.ids).toBe(1);
    // The statistics give each deck a window of the chapters (a subject
    // and a title each), not a row of every chapter.
    expect(one.statistics.chapters).toBeLessThanOrEqual(2 * 50);
    expect(many.statistics.chapters).toBe(200 * one.statistics.chapters);
  });

  it("of one long chapter, have its steps read once in all, not once a deck", async () => {
    const one = await readsFor("steps", 1);
    const many = await readsFor("steps", 200);
    // The outline's index, then the long chapter's, each once.
    expect(one.home.steps).toBe(1 + 2 * SIZE);
    expect(many.home.steps).toBe(1 + 2 * SIZE);
    expect(many.home.ids).toBe(200 * one.home.ids);
    expect(one.home.ids).toBe(1);
    expect(one.statistics.chapters).toBeLessThanOrEqual(2 * 2);
    expect(many.statistics.chapters).toBe(200 * one.statistics.chapters);
  });

  it("of one long chapter asking one answered card in most steps, look at a step or two a deck, not at the steps done", async () => {
    const one = await readsFor("shared", 1);
    const many = await readsFor("shared", 200);
    expect(one.home.steps).toBe(1 + 2 * SIZE);
    expect(many.home.steps).toBe(1 + 2 * SIZE);
    // The step to resume at alone, not an id of each step done.
    expect(one.home.ids).toBe(1);
    expect(many.home.ids).toBe(200 * one.home.ids);
    expect(many.statistics.chapters).toBe(200 * one.statistics.chapters);
  });
});

/**
 * The lookups of cards answered (Set.prototype.has) and the reads of the
 * review states' cards, for the deck list of `count` course decks that
 * name one release, of a "steps" outline, and one reviews document: its
 * states, read once, answer q-0 and every card of the long chapter but
 * its last.
 */
async function lookupsFor(count: number) {
  const { outline } = countedOutline("steps");
  const decks = Array.from(
    { length: count },
    (_, n): Deck => ({
      ...deck,
      url: `${instance.url}catalog.ttl#course-${n}`,
      reviewsDocumentUrl: `${instance.url}reviews/course.ttl`,
      sourceUrl: RELEASE,
      completedChapters: [`${RELEASE}#ch-0`],
    }),
  );
  let cardReads = 0;
  const answeredIds = Array.from({ length: SIZE }, (_, n) => `q-${n}`);
  const sm2 = Object.freeze(
    answeredIds.map((cardId) =>
      Object.freeze({
        get cardId() {
          cardReads += 1;
          return cardId;
        },
        direction: "front-to-back" as const,
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        due: "2026-11-21",
        firstReviewedAt: "2026-11-19T10:00:00.000Z",
        lastReviewedAt: "2026-11-19T10:00:00.000Z",
        formatVersion: 2,
      }),
    ),
  );
  const states = Object.freeze({ sm2, fsrs: Object.freeze([]) }) as unknown as ReviewStates;
  const deps = makeDeps();
  vi.mocked(deps.deckLibrary.fetchCourseOutline).mockResolvedValue(outline);
  vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue(states);
  const courses = createCourseUseCases({
    ...deps,
    preferenceStore: { get: async () => DEFAULT_PREFERENCES },
    answerStore: { grade: async () => undefined as never },
  });
  const has = vi.spyOn(Set.prototype, "has");
  try {
    const summaries = await Promise.all(decks.map((one) => courses.getCourseSummary(one)));
    const standings = summaries.map((summary, n) =>
      courseStandingOf(summary.outline, summary.answeredCardIds, decks[n]!.completedChapters!),
    );
    const lookups = has.mock.calls.length;
    expect(summaries[count - 1]!.answeredCardIds).toEqual(answeredIds);
    expect(Object.isFrozen(summaries[count - 1]!.answeredCardIds)).toBe(true);
    expect(standings[count - 1]!.progress).toEqual({
      url: `${RELEASE}#ch-1`,
      state: "open",
      resumeStepId: `s-1-${SIZE - 1}`,
    });
    return { lookups, cardReads };
  } finally {
    has.mockRestore();
  }
}

describe("course decks that name one release and one reviews document", () => {
  it("of many cards answered, look them up once in all, and add a few lookups each", async () => {
    const one = await lookupsFor(1);
    const many = await lookupsFor(200);
    // The answered cards, the outline's and the open chapter's, each looked up once.
    expect(one.lookups).toBeGreaterThanOrEqual(SIZE);
    expect(many.cardReads).toBe(one.cardReads);
    // Each deck more adds lookups of its completed chapters alone, not of its cards answered.
    expect((many.lookups - one.lookups) / 199).toBeLessThan(10);
  });
});

/**
 * What the strip's standings read of one frozen list of `answered` cards
 * answered (q-0 on), which `count` course decks of a "chapters" outline
 * share, each with a chapter of its own open: deck n has completed the
 * n chapters before its own. The list's items read (by index or by its
 * iterator, as making a set of it reads them) are counted, and the
 * lookups of cards answered (Set.prototype.has).
 */
function sharedListReadsFor(answered: number, count: number) {
  const { outline } = countedOutline("chapters");
  let items = 0;
  const ids = Object.freeze(Array.from({ length: answered }, (_, n) => `q-${n}`));
  const list = new Proxy(ids, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) items += 1;
      return Reflect.get(target, key, receiver);
    },
  }) as readonly string[];
  const has = vi.spyOn(Set.prototype, "has");
  try {
    const standings = Array.from({ length: count }, (_, n) =>
      courseStandingOf(
        outline,
        list,
        Array.from({ length: n }, (_, at) => `${RELEASE}#ch-${at}`),
      ),
    );
    const lookups = has.mock.calls.length;
    standings.forEach((standing, n) => {
      expect(standing!.current).toBe(outline.chapters[n]);
      // Each deck's open chapter asks a card answered: the final review is next.
      expect(standing!.progress).toEqual({ url: `${RELEASE}#ch-${n}`, state: "open" });
    });
    return { items, lookups };
  } finally {
    has.mockRestore();
  }
}

describe("course decks that share one list of cards answered, each of its own chapter open", () => {
  it("read the list once in all, and look up a card or so each, however long the list", async () => {
    const count = 100;
    const few = sharedListReadsFor(count, count);
    const many = sharedListReadsFor(SIZE, count);
    // The list is read once in all, to make the set of it, not once a deck.
    expect(few.items).toBe(count);
    expect(many.items).toBe(SIZE);
    // Each deck's lookups go by its completed chapters and its chapter open, not by the list.
    expect(many.lookups).toBe(few.lookups);
  });
});
