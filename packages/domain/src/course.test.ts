import { describe, expect, it } from "vitest";
import type { ChapterV1, StepV1 } from "@solid-memo/vocab/types.generated";
import {
  choicesOf,
  courseAnswerEffect,
  courseOutlineFromRecords,
  courseProgress,
  finalReviewQueue,
  gradeOfChoice,
  type CourseOutline,
} from "./course";
import type { CardContent } from "./deck";
import type { ReviewState } from "./review";

const RELEASE = "https://solid-memo.com/decks/solid-fundamentals/v1.ttl";
const at = (id: string) => `${RELEASE}#${id}`;

const chapter = (position: number, extra: Partial<ChapterV1> = {}): ChapterV1 => ({
  title: { en: `Chapter ${position}` },
  course: RELEASE,
  position,
  reviewQuestion: [],
  ...extra,
});
const step = (chapterId: string, position: number, questions: string[], extra: Partial<StepV1> = {}): StepV1 => ({
  theory: { en: `Theory ${chapterId} ${position}` },
  checkedBy: questions.map(at),
  chapter: at(chapterId),
  position,
  ...extra,
});

/** Two chapters of two steps, and the review question of the first. */
const outline: CourseOutline = courseOutlineFromRecords(
  RELEASE,
  [
    { url: at("ch-b"), data: chapter(1) },
    { url: at("ch-a"), data: chapter(0, { description: { en: "First." }, reviewQuestion: [at("q-review")] }) },
  ],
  [
    { url: at("a-2"), data: step("ch-a", 1, ["q3"]) },
    { url: at("a-1"), data: step("ch-a", 0, ["q1", "q2"]) },
    { url: at("b-1"), data: step("ch-b", 0, ["q4"]) },
  ],
);

describe("a course's outline", () => {
  it("orders chapters and their steps by position, each step under its chapter, cards named by their ids", () => {
    expect(outline).toEqual({
      releaseUrl: RELEASE,
      chapters: [
        {
          id: "ch-a",
          url: at("ch-a"),
          position: 0,
          title: { en: "Chapter 0" },
          description: { en: "First." },
          steps: [
            { id: "a-1", url: at("a-1"), position: 0, theory: { en: "Theory ch-a 0" }, questionIds: ["q1", "q2"] },
            { id: "a-2", url: at("a-2"), position: 1, theory: { en: "Theory ch-a 1" }, questionIds: ["q3"] },
          ],
          reviewQuestionIds: ["q-review"],
        },
        {
          id: "ch-b",
          url: at("ch-b"),
          position: 1,
          title: { en: "Chapter 1" },
          steps: [{ id: "b-1", url: at("b-1"), position: 0, theory: { en: "Theory ch-b 0" }, questionIds: ["q4"] }],
          reviewQuestionIds: [],
        },
      ],
    });
  });

  it("leaves out retired chapters and steps, and the steps of a retired chapter; ties go by id", () => {
    const retired = courseOutlineFromRecords(
      RELEASE,
      [
        { url: at("ch-z"), data: chapter(0) },
        { url: at("ch-y"), data: chapter(0) },
        { url: at("ch-old"), data: chapter(1, { deprecated: true }) },
      ],
      [
        { url: at("z-1"), data: step("ch-z", 0, ["q1"], { deprecated: true }) },
        { url: at("z-2"), data: step("ch-z", 1, ["q2"]) },
        { url: at("old-1"), data: step("ch-old", 0, ["q3"]) },
      ],
    );
    expect(retired.chapters.map((c) => [c.id, c.steps.map((s) => s.id)])).toEqual([
      ["ch-y", []],
      ["ch-z", ["z-2"]],
    ]);
  });
});

describe("a learner's progress", () => {
  it("opens only the first chapter of a course not begun, to resume at its first step", () => {
    expect(courseProgress(outline, [], [])).toEqual({
      chapters: [
        { url: at("ch-a"), state: "open", doneStepIds: [], resumeStepId: "a-1" },
        { url: at("ch-b"), state: "locked", doneStepIds: [], resumeStepId: "b-1" },
      ],
      currentChapterUrl: at("ch-a"),
      done: false,
    });
  });

  it("counts a step done once each of its questions is answered, and resumes at the first not done", () => {
    const progress = courseProgress(outline, new Set(["q1", "q3"]), []);
    expect(progress.chapters[0]).toEqual({ url: at("ch-a"), state: "open", doneStepIds: ["a-2"], resumeStepId: "a-1" });
    const allSteps = courseProgress(outline, ["q1", "q2", "q3"], []);
    // Every step done: the final review is next.
    expect(allSteps.chapters[0]).toEqual({ url: at("ch-a"), state: "open", doneStepIds: ["a-1", "a-2"] });
  });

  it("unlocks a chapter once those before it are completed, and is done when every chapter is", () => {
    const first = courseProgress(outline, ["q1", "q2", "q3"], [at("ch-a")]);
    expect(first.chapters.map((c) => c.state)).toEqual(["done", "open"]);
    expect(first.currentChapterUrl).toBe(at("ch-b"));
    const all = courseProgress(outline, ["q1", "q2", "q3", "q4"], [at("ch-b"), at("ch-a"), at("ch-retired")]);
    expect(all).toMatchObject({ done: true });
    expect(all.currentChapterUrl).toBeUndefined();
    // A completed chapter stays done, even after one that is not.
    expect(courseProgress(outline, [], [at("ch-b")]).chapters.map((c) => c.state)).toEqual(["open", "done"]);
  });

  it("keeps a chapter completed in an earlier release completed in the release the deck now follows", () => {
    const v1 = "https://solid-memo.com/decks/solid-fundamentals/v1.ttl#ch-a";
    const v2 = courseOutlineFromRecords(
      "https://solid-memo.com/decks/solid-fundamentals/v2.ttl",
      [{ url: "https://solid-memo.com/decks/solid-fundamentals/v2.ttl#ch-a", data: chapter(0) }],
      [],
    );
    expect(courseProgress(v2, [], [v1])).toMatchObject({ chapters: [{ state: "done" }], done: true });
  });
});

/** Random sources for Fisher–Yates: `last` swaps nothing (the order stays), `first` always swaps with the first item. */
const first = () => 0;
const last = () => 0.999;

describe("multiple-choice questions", () => {
  const card: CardContent = {
    front: { en: "What can an IRI name?" },
    back: { en: "Any thing at all" },
    distractors: [
      { id: "q1-d1", text: { en: "Only web pages" }, note: { en: "A web page is one kind of thing." } },
      { id: "q1-d2", text: { en: "Only people" } },
    ],
  };

  it("offer the back and every distractor, shuffled by the random source", () => {
    const right = { key: "back", text: { en: "Any thing at all" }, correct: true };
    const d1 = { key: "distractor:q1-d1", text: { en: "Only web pages" }, correct: false, distractorId: "q1-d1", note: { en: "A web page is one kind of thing." } };
    const d2 = { key: "distractor:q1-d2", text: { en: "Only people" }, correct: false, distractorId: "q1-d2" };
    expect(choicesOf(card, last)).toEqual([right, d1, d2]);
    expect(choicesOf(card, first)).toEqual([d1, d2, right]);
  });

  it("offer only the back of a card without distractors", () => {
    expect(choicesOf({ front: { en: "Q" }, back: { en: "A" } }, first)).toEqual([{ key: "back", text: { en: "A" }, correct: true }]);
  });

  it("grade a right choice 3 and a wrong one 1", () => {
    expect(gradeOfChoice(true)).toBe(3);
    expect(gradeOfChoice(false)).toBe(1);
  });
});

describe("a chapter's final review", () => {
  it("asks every step's questions and the chapter's review questions, each once, shuffled", () => {
    const chapter = { ...outline.chapters[0]!, reviewQuestionIds: ["q-review", "q1"] };
    expect(finalReviewQueue(chapter, last)).toEqual(["q1", "q2", "q3", "q-review"]);
    expect(finalReviewQueue(chapter, first).sort()).toEqual(["q-review", "q1", "q2", "q3"]);
  });
});

describe("a course answer's effect on the schedule", () => {
  const now = new Date(2026, 9, 7, 12, 0);
  const state = (lastReviewedAt: Date, due: string): ReviewState => ({
    cardId: "q1",
    direction: "front-to-back",
    easeFactor: 2.36,
    intervalDays: 1,
    repetitions: 1,
    due,
    firstReviewedAt: lastReviewedAt.toISOString(),
    lastReviewedAt: lastReviewedAt.toISOString(),
    formatVersion: 2,
  });

  it("introduces a card without state, graded by the choice", () => {
    expect(courseAnswerEffect(undefined, true, now, 4)).toEqual({ kind: "introduce", grade: 3 });
    expect(courseAnswerEffect(null, false, now, 4)).toEqual({ kind: "introduce", grade: 1 });
  });

  it("leaves a card graded today as it is when answered right, and lapses it when answered wrong", () => {
    const morning = state(new Date(2026, 9, 7, 9, 0), "2026-10-08");
    expect(courseAnswerEffect(morning, true, now, 4)).toEqual({ kind: "none" });
    expect(courseAnswerEffect(morning, false, now, 4)).toEqual({ kind: "review", grade: 1 });
  });

  it("reviews a card due today or earlier, and leaves one not yet due as practice", () => {
    const yesterday = new Date(2026, 9, 6, 12, 0);
    expect(courseAnswerEffect(state(yesterday, "2026-10-07"), true, now, 4)).toEqual({ kind: "review", grade: 3 });
    expect(courseAnswerEffect(state(yesterday, "2026-10-05"), false, now, 4)).toEqual({ kind: "review", grade: 1 });
    expect(courseAnswerEffect(state(yesterday, "2026-10-12"), false, now, 4)).toEqual({ kind: "none" });
  });

  it("counts a review before the day boundary as the day before", () => {
    // 03:00 with a boundary of 4 is still 6 October.
    const early = state(new Date(2026, 9, 7, 3, 0), "2026-10-07");
    expect(courseAnswerEffect(early, true, now, 4)).toEqual({ kind: "review", grade: 3 });
  });
});
