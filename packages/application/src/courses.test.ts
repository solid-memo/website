// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type { AnswerLog } from "./ports";
import { createUseCases } from "./useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { fsrsReview } from "@solid-memo/domain/fsrs";
import type { FsrsState, ReviewState } from "@solid-memo/domain/review";
import type { Answer } from "@solid-memo/domain/answer";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";
import type { LibraryCard } from "@solid-memo/domain/library";
import type { CourseChapter, CourseOutline } from "@solid-memo/domain/course";
import {
  sm2s,
  promptOf,
  instance,
  deck,
  libraryDeck,
  libraryContent,
  makeDeps,
} from "./testing/fakePorts";

describe("courses", () => {
  const RELEASE = "https://solid-memo.com/decks/solid/v1.ttl";
  const at = (id: string) => `${RELEASE}#${id}`;
  const course: LibraryDeck = {
    ...libraryDeck,
    url: RELEASE,
    ...firstRelease(RELEASE),
    title: { en: "Solid fundamentals" },
    isCourse: true,
  };
  const question: LibraryCard = {
    id: "q-iri",
    front: { en: "What can an IRI name?" },
    back: { en: "Any thing at all" },
    formatVersion: 5,
    distractors: [{ id: "q-iri-d1", text: { en: "Only web pages" } }],
  };
  const release: LibraryDeckContent = {
    ...libraryContent,
    url: RELEASE,
    title: course.title,
    seriesUrl: course.seriesUrl,
    isCourse: true,
    cards: [
      question,
      { id: "q-rdf", front: { en: "RDF?" }, back: { en: "Triples" }, formatVersion: 5 },
    ],
  };
  const outline: CourseOutline = {
    releaseUrl: RELEASE,
    chapters: [
      {
        id: "ch-1",
        url: at("ch-1"),
        position: 0,
        title: { en: "Linked data" },
        steps: [
          {
            id: "s-1",
            url: at("s-1"),
            position: 0,
            theory: { en: "IRIs name things." },
            questionIds: ["q-iri"],
          },
        ],
        reviewQuestionIds: [],
      },
      {
        id: "ch-2",
        url: at("ch-2"),
        position: 1,
        title: { en: "RDF" },
        steps: [
          {
            id: "s-2",
            url: at("s-2"),
            position: 0,
            theory: { en: "Triples." },
            questionIds: ["q-rdf"],
          },
        ],
        reviewQuestionIds: [],
      },
    ],
  };
  const courseDeck: Deck = { ...deck, title: course.title, sourceUrl: RELEASE };
  const noon = new Date(2026, 9, 7, 12, 0);
  const stateOf = (lastReviewedAt: Date, due: string): ReviewState => ({
    cardId: question.id,
    direction: "front-to-back",
    easeFactor: 2.36,
    intervalDays: 1,
    repetitions: 1,
    due,
    firstReviewedAt: lastReviewedAt.toISOString(),
    lastReviewedAt: lastReviewedAt.toISOString(),
    formatVersion: 2,
  });

  function setup() {
    const deps = makeDeps();
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockResolvedValue(release);
    vi.mocked(deps.deckLibrary.fetchCourseOutline).mockResolvedValue(outline);
    vi.mocked(deps.deckRepository.readDeck).mockResolvedValue(courseDeck);
    const appended: Answer[] = [];
    const answerLog: AnswerLog = {
      append: vi.fn(async (_instanceUrl, answer) => {
        appended.push(answer);
      }),
      appendAll: vi.fn(async () => undefined),
      months: vi.fn(async () => []),
      readMonth: vi.fn(async () => []),
      readMonthSince: vi.fn(),
      removeDay: vi.fn(async () => undefined),
      removeAnswer: vi.fn(async () => undefined),
    };
    let id = 0;
    const useCases = createUseCases({ ...deps, answerLog, newId: () => `id${++id}-0000-0000` });
    return { deps, useCases, appended, answerLog };
  }

  it("getCourseStatistics counts each course's chapters completed and its graded answers chapter by chapter, from the last twelve study months", async () => {
    const { deps, useCases, answerLog } = setup();
    const answer = (
      id: string,
      cardId: string,
      grade: Answer["grade"],
      deckUrl = deck.url,
    ): Answer => ({
      id,
      deckUrl,
      cardUrl: `${deck.cardsDocumentUrl}#${cardId}`,
      direction: "front-to-back",
      grade,
      answeredAt: "2026-10-06T10:00:00.000Z",
      studyDay: "2026-10-06",
      nextIntervalDays: 1,
      mode: "multiple-choice",
    });
    vi.mocked(answerLog.months).mockResolvedValue(["2025-10", "2026-10"]);
    vi.mocked(answerLog.readMonthSince).mockResolvedValue({
      unchanged: false,
      value: [
        answer("a1", "q-iri", 3),
        answer("a2", "q-rdf", 1),
        answer("a3", "q-rdf", 3, `${instance.url}catalog.ttl#deck-2`),
      ],
      version: "v1",
    });
    const completed: Deck = { ...courseDeck, completedChapters: [at("ch-1")] };
    const unreadable: Deck = {
      ...courseDeck,
      url: `${instance.url}catalog.ttl#deck-3`,
      sourceUrl: "https://solid-memo.com/decks/gone/v1.ttl",
    };
    vi.mocked(deps.deckLibrary.fetchCourseOutline).mockImplementation(async (url) => {
      if (url === RELEASE) return outline;
      throw new Error("offline");
    });
    await expect(
      useCases.getCourseStatistics(instance.url, noon, [completed, unreadable]),
    ).resolves.toEqual([
      {
        deck: completed,
        done: 1,
        chapters: [
          {
            url: at("ch-1"),
            title: { en: "Linked data" },
            state: "done",
            quiz: { answers: 1, right: 1 },
          },
          { url: at("ch-2"), title: { en: "RDF" }, state: "open", quiz: { answers: 1, right: 0 } },
        ],
      },
    ]);
    // Twelve study months up to October 2026 begin with November 2025.
    expect(answerLog.readMonthSince).toHaveBeenCalledOnce();
    expect(answerLog.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-10", undefined);
  });

  it("getCourseStatistics reads nothing for no course, counts no chapter done of a course begun, and refuses a deck that is no library copy", async () => {
    const { useCases, answerLog } = setup();
    await expect(useCases.getCourseStatistics(instance.url, noon, [])).resolves.toEqual([]);
    expect(answerLog.months).not.toHaveBeenCalled();
    const [begun] = await useCases.getCourseStatistics(instance.url, noon, [courseDeck]);
    expect(begun!.done).toBe(0);
    expect(begun!.chapters.map((chapter) => chapter.state)).toEqual(["open", "locked"]);
    await expect(useCases.getCourseStatistics(instance.url, noon, [deck])).rejects.toThrow(
      "names the release",
    );
  });

  it("startCourse copies the release without its cards, saying it is a course, or returns the copy the instance has", async () => {
    const { deps, useCases } = setup();
    vi.mocked(deps.deckRepository.listDecks).mockResolvedValueOnce([deck]);
    await useCases.startCourse(instance.url, course);
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(RELEASE);
    expect(deps.deckRepository.importDeck).toHaveBeenCalledWith(instance.url, {
      ...release,
      isCourse: true,
      cards: [],
    });
    vi.mocked(deps.deckRepository.listDecks).mockResolvedValueOnce([deck, courseDeck]);
    await expect(useCases.startCourse(instance.url, course)).resolves.toBe(courseDeck);
    expect(deps.deckRepository.importDeck).toHaveBeenCalledOnce();
  });

  it("getCourse reads the deck as it is now, the release's outline and cards, and the progress its review states and completed chapters make", async () => {
    const { deps, useCases } = setup();
    const completed: Deck = { ...courseDeck, completedChapters: [at("ch-1")] };
    vi.mocked(deps.deckRepository.readDeck).mockResolvedValueOnce(completed);
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValueOnce(
      sm2s([
        stateOf(noon, "2026-10-08"),
        { ...stateOf(noon, "2026-10-08"), cardId: "q-rdf", direction: "back-to-front" },
      ]),
    );
    const got = await useCases.getCourse(courseDeck);
    expect(deps.deckRepository.readDeck).toHaveBeenCalledWith(courseDeck.url);
    expect(deps.deckLibrary.fetchCourseOutline).toHaveBeenCalledWith(RELEASE);
    expect(got).toEqual({
      deck: completed,
      release,
      outline,
      cards: new Map([
        ["q-iri", question],
        ["q-rdf", release.cards[1]],
      ]),
      answeredCardIds: ["q-iri"],
      progress: {
        chapters: [
          { url: at("ch-1"), state: "done", doneStepIds: ["s-1"] },
          { url: at("ch-2"), state: "open", doneStepIds: [], resumeStepId: "s-2" },
        ],
        currentChapterUrl: at("ch-2"),
        done: false,
      },
    });
    // A deck with no chapter completed has the first open.
    expect((await useCases.getCourse(courseDeck)).progress.chapters[0]!.state).toBe("open");
  });

  it("getCourse asks only the release's cards, whatever ids the outline names", async () => {
    const { deps, useCases } = setup();
    const [first, second] = outline.chapters as [CourseChapter, CourseChapter];
    vi.mocked(deps.deckLibrary.fetchCourseOutline).mockResolvedValueOnce({
      ...outline,
      chapters: [
        {
          ...first,
          steps: [{ ...first.steps[0]!, questionIds: ["__proto__", "q-iri", "q-missing"] }],
          reviewQuestionIds: ["constructor", "q-rdf"],
        },
        {
          ...second,
          steps: [{ ...second.steps[0]!, questionIds: ["constructor"] }],
          reviewQuestionIds: ["q-rdf"],
        },
        {
          ...second,
          id: "ch-3",
          url: at("ch-3"),
          steps: [{ ...second.steps[0]!, questionIds: ["q-missing"] }],
          reviewQuestionIds: ["__proto__"],
        },
      ],
    });
    const got = await useCases.getCourse(courseDeck);
    expect(got.outline.chapters.map((chapter) => chapter.steps)).toEqual([
      [{ ...first.steps[0]!, questionIds: ["q-iri"] }],
      [],
    ]);
    expect(got.outline.chapters.map((chapter) => chapter.reviewQuestionIds)).toEqual([
      ["q-rdf"],
      ["q-rdf"],
    ]);
    expect(got.cards.get("constructor")).toBeUndefined();
    expect(got.progress.chapters[1]).toEqual({ url: at("ch-2"), state: "locked", doneStepIds: [] });
  });

  it("getCourse keeps a chapter completed in an older release completed in the one the deck now follows", async () => {
    const { deps, useCases } = setup();
    const older = at("ch-1").replace("/v1.ttl#", "/v0.ttl#");
    vi.mocked(deps.deckRepository.readDeck).mockResolvedValueOnce({
      ...courseDeck,
      completedChapters: [older],
    });
    expect(
      (await useCases.getCourse(courseDeck)).progress.chapters.map((chapter) => chapter.state),
    ).toEqual(["done", "open"]);
  });

  it("getCourse refuses a deck that is gone, and one that is no library copy", async () => {
    const { deps, useCases } = setup();
    vi.mocked(deps.deckRepository.readDeck).mockResolvedValueOnce(null);
    await expect(useCases.getCourse(courseDeck)).rejects.toMatchObject({ code: "deckGone" });
    vi.mocked(deps.deckRepository.readDeck).mockResolvedValueOnce(deck);
    await expect(useCases.getCourse(deck)).rejects.toThrow("names the release");
  });

  it("getCourseSummary reads the release's outline beside the deck's answers, and neither the deck again nor the release's cards", async () => {
    const { deps, useCases } = setup();
    let outlined: (outline: CourseOutline) => void = () => {};
    vi.mocked(deps.deckLibrary.fetchCourseOutline).mockReturnValueOnce(
      new Promise((resolve) => (outlined = resolve)),
    );
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValueOnce(
      sm2s([
        stateOf(noon, "2026-10-08"),
        { ...stateOf(noon, "2026-10-08"), cardId: "q-rdf", direction: "back-to-front" },
      ]),
    );
    const summary = useCases.getCourseSummary(courseDeck);
    expect(deps.deckLibrary.fetchCourseOutline).toHaveBeenCalledWith(RELEASE);
    expect(deps.reviewStateRepository.listReviewStates).toHaveBeenCalledWith(courseDeck);
    outlined(outline);
    await expect(summary).resolves.toEqual({ outline, answeredCardIds: ["q-iri"] });
    expect(deps.deckRepository.readDeck).not.toHaveBeenCalled();
    expect(deps.deckLibrary.fetchLibraryDeck).not.toHaveBeenCalled();
    await expect(useCases.getCourseSummary(deck)).rejects.toThrow("names the release");
  });

  it("answerCourseQuestion writes a card answered for the first time into the deck, then grades it, logging a multiple-choice answer", async () => {
    const { deps, useCases, appended } = setup();
    const answered = await useCases.answerCourseQuestion(
      instance.url,
      courseDeck,
      question,
      { correct: true },
      noon,
      { recallMillis: 3100 },
    );
    expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledWith(courseDeck, {
      save: [question],
      remove: [],
    });
    expect(
      vi.mocked(deps.deckRepository.applyCardChanges).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(deps.reviewStateRepository.gradeReviewState).mock.invocationCallOrder[0]!,
    );
    expect(answered).toEqual({
      effect: "introduce",
      state: {
        cardId: "q-iri",
        direction: "front-to-back",
        easeFactor: 2.36,
        intervalDays: 1,
        repetitions: 1,
        due: "2026-10-08",
        firstReviewedAt: noon.toISOString(),
        lastReviewedAt: noon.toISOString(),
        formatVersion: 2,
      },
    });
    await useCases.refreshStudyDigest(instance.url, courseDeck);
    expect(appended).toEqual([
      expect.objectContaining({
        cardUrl: `${courseDeck.cardsDocumentUrl}#q-iri`,
        direction: "front-to-back",
        grade: 3,
        mode: "multiple-choice",
        nextIntervalDays: 1,
        recallMillis: 3100,
        utcOffsetMinutes: 0 - noon.getTimezoneOffset(),
      }),
    ]);
    expect(appended[0]).not.toHaveProperty("chosenDistractor");
    // A first answer was due on no day, and a choice is not graded by the learner.
    expect(appended[0]).not.toHaveProperty("priorDue");
    expect(appended[0]).not.toHaveProperty("gradeMillis");
  });

  it("answerCourseQuestion grades a wrong first answer 1 and names the wrong option chosen, in the deck's copy", async () => {
    const { useCases, appended } = setup();
    const answered = await useCases.answerCourseQuestion(
      instance.url,
      courseDeck,
      question,
      { correct: false, distractorId: "q-iri-d1" },
      noon,
    );
    expect(answered).toMatchObject({
      effect: "introduce",
      state: { repetitions: 0, intervalDays: 1, due: "2026-10-08" },
    });
    await useCases.refreshStudyDigest(instance.url, courseDeck);
    expect(appended).toEqual([
      expect.objectContaining({
        grade: 1,
        mode: "multiple-choice",
        chosenDistractor: `${courseDeck.cardsDocumentUrl}#q-iri-d1`,
      }),
    ]);
  });

  it("answerCourseQuestion writes nothing for a right answer on a card graded today, and lapses it on a wrong one, without writing the card again", async () => {
    const { deps, useCases, appended } = setup();
    const morning = stateOf(new Date(2026, 9, 7, 9, 0), "2026-10-08");
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue(promptOf(morning));
    await expect(
      useCases.answerCourseQuestion(instance.url, courseDeck, question, { correct: true }, noon),
    ).resolves.toEqual({
      effect: "none",
      state: morning,
    });
    expect(deps.reviewStateRepository.gradeReviewState).not.toHaveBeenCalled();
    // A wrong answer naming no option names none.
    await expect(
      useCases.answerCourseQuestion(instance.url, courseDeck, question, { correct: false }, noon),
    ).resolves.toMatchObject({
      effect: "review",
      state: { repetitions: 0, firstReviewedAt: morning.firstReviewedAt },
    });
    expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
    await useCases.refreshStudyDigest(instance.url, courseDeck);
    expect(appended).toEqual([expect.objectContaining({ grade: 1, priorDue: "2026-10-08" })]);
  });

  it("answerCourseQuestion goes by FSRS-6's due day under FSRS-6, and grades a right answer Good", async () => {
    const { deps, useCases, appended } = setup();
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: { ...DEFAULT_PREFERENCES, scheduler: "fsrs6" },
      formatVersion: 5,
    });
    // SM-2 has it due on the 5th; FSRS-6, which sets the due days, on the 20th.
    const sm2 = { ...stateOf(new Date(2026, 9, 1, 9, 0), "2026-10-05"), intervalDays: 4 };
    const fsrs: FsrsState = {
      cardId: question.id,
      direction: "front-to-back",
      stability: 19,
      difficulty: 4,
      due: "2026-10-20",
      firstReviewedAt: sm2.firstReviewedAt,
      lastReviewedAt: sm2.lastReviewedAt,
      formatVersion: 1,
    };
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue({ sm2, fsrs });
    await expect(
      useCases.answerCourseQuestion(instance.url, courseDeck, question, { correct: true }, noon),
    ).resolves.toEqual({ effect: "none", state: sm2 });
    expect(deps.reviewStateRepository.gradeReviewState).not.toHaveBeenCalled();

    // Due by FSRS-6 too: a review, graded Good.
    const due = { ...fsrs, due: "2026-10-06" };
    vi.mocked(deps.reviewStateRepository.getReviewState).mockResolvedValue({ sm2, fsrs: due });
    await expect(
      useCases.answerCourseQuestion(instance.url, courseDeck, question, { correct: true }, noon),
    ).resolves.toMatchObject({ effect: "review" });
    const graded = await vi.mocked(deps.reviewStateRepository.gradeReviewState).mock.results[0]!
      .value;
    const key = { cardId: question.id, direction: "front-to-back" as const };
    expect(graded.state.fsrs).toEqual(
      fsrsReview(key, { sm2, fsrs: due }, 3, noon, 0.9, DEFAULT_PREFERENCES.dayBoundaryHour),
    );
    await useCases.refreshStudyDigest(instance.url, courseDeck);
    expect(appended).toEqual([expect.objectContaining({ grade: 3, priorDue: "2026-10-06" })]);
  });

  it("completeChapter notes the chapter completed on the deck", async () => {
    const { deps, useCases } = setup();
    await expect(useCases.completeChapter(courseDeck, at("ch-1"))).resolves.toMatchObject({
      completedChapters: [at("ch-1")],
    });
    expect(deps.deckRepository.completeChapter).toHaveBeenCalledWith(courseDeck, at("ch-1"));
  });

  it("setCompletedChapters changes the chapters completed on the deck", async () => {
    const { deps, useCases } = setup();
    await useCases.setCompletedChapters(courseDeck, { kind: "restart" });
    expect(deps.deckRepository.setCompletedChapters).toHaveBeenCalledWith(courseDeck, {
      kind: "restart",
    });
  });

  it("planLibraryUpgrade adds no card to a course's deck, whichever release says it is a course", async () => {
    const { deps, useCases } = setup();
    const v2 = "https://solid-memo.com/decks/solid/v2.ttl";
    const plain = { ...release, isCourse: undefined };
    const next = {
      ...plain,
      url: v2,
      version: "2",
      cards: [
        ...release.cards,
        { id: "q-new", front: { en: "New?" }, back: { en: "Yes" }, formatVersion: 5 },
      ],
    };
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) =>
      url === v2 ? next : plain,
    );
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue([]);
    const series = {
      ...course,
      url: v2,
      version: "2",
      releases: [...course.releases, { url: v2, version: "2" }],
    };
    vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([series]);
    await expect(useCases.planLibraryUpgrade(courseDeck)).resolves.toBeNull();
    // Only the release copied says it is a course.
    vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([
      { ...series, isCourse: undefined },
    ]);
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) =>
      url === v2 ? next : release,
    );
    await expect(useCases.planLibraryUpgrade(courseDeck)).resolves.toBeNull();
    // Neither: a plain deck's upgrade adds the card.
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) =>
      url === v2 ? next : plain,
    );
    await expect(useCases.planLibraryUpgrade(courseDeck)).resolves.toMatchObject({
      add: [{ id: "q-new" }],
    });
  });

  it("planLibraryUpgrade offers a course's deck a release that changes only the course's outline", async () => {
    const { deps, useCases } = setup();
    const v2 = "https://solid-memo.com/decks/solid/v2.ttl";
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockImplementation(async (url) => ({
      ...release,
      url,
      version: url === v2 ? "2" : "1",
    }));
    vi.mocked(deps.deckRepository.listCards).mockResolvedValue([]);
    vi.mocked(deps.deckLibrary.listLibraryDecks).mockResolvedValue([
      {
        ...course,
        url: v2,
        version: "2",
        releases: [...course.releases, { url: v2, version: "2" }],
      },
    ]);
    // The same outline in both: nothing to offer.
    await expect(useCases.planLibraryUpgrade(courseDeck)).resolves.toBeNull();
    expect(deps.deckLibrary.fetchCourseOutline).toHaveBeenCalledWith(RELEASE);
    expect(deps.deckLibrary.fetchCourseOutline).toHaveBeenCalledWith(v2);
    // A step's theory rewritten (in chunks, say): offered, though no card changes.
    const [first, ...rest] = outline.chapters;
    const [step, ...steps] = first!.steps;
    const rewritten: CourseOutline = {
      releaseUrl: v2,
      chapters: [
        {
          ...first!,
          steps: [{ ...step!, theory: { en: "IRIs\n\n---\n\nname things." } }, ...steps],
        },
        ...rest,
      ],
    };
    vi.mocked(deps.deckLibrary.fetchCourseOutline).mockImplementation(async (url) =>
      url === v2 ? rewritten : outline,
    );
    await expect(useCases.planLibraryUpgrade(courseDeck)).resolves.toMatchObject({
      toVersion: "2",
      change: [],
      outline: true,
    });
  });
});
