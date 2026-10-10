import { expect } from "@playwright/test";
import { test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";
import type { Answers } from "../pages/CourseQuestion.ts";

/**
 * A learner works through a course's first chapter (docs/courses.md, "The
 * learner's flow"): each step's theory a chunk at a time, then its
 * questions without it, each answer adding its card to the deck; the
 * word before the final review; the review, where a question answered
 * wrongly comes back until it is answered right; and back on the
 * course's page, the chapter cheered, done, and the next one open. It is
 * the course the library offers newcomers, whichever that is: the
 * journey learns each right answer as the app shows it.
 */
test("work through a course's first chapter and its final review @course", async ({ app, account, runId }) => {
  const known: Answers = new Map();
  let course = "";
  let chapter = "";

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in with a WebID", () => logInAndCreateInstance(app, account, `Learner ${runId}`));

  await app.step("03 · Start the course for newcomers", async () => {
    course = await app.decks.newcomerCourseTitle();
    await app.decks.startNewcomerCourse(course);
  });

  await app.step("04 · Start the course: the first chapter opens at its first step's theory", async () => {
    await app.course.start();
    chapter = await app.chapter.expectOpen();
  });

  await app.step("05 · Each step: its theory a chunk at a time, then its questions without it", async () => {
    const steps = await app.chapter.workThrough(known);
    expect(steps.map(({ step }) => step)).toEqual(steps.map((_, index) => index + 1));
    // The library's course for newcomers reads its theory in chunks (docs/courses.md, "Which course").
    expect(steps.some(({ chunks }) => chunks > 1)).toBe(true);
  });

  await app.step("06 · A word before the final review", () => app.chapterReview.expectWord(chapter));

  await app.step("07 · The final review: a wrong answer comes back until it is right", async () => {
    await app.chapterReview.start();
    const { asked, questions, wrong } = await app.chapterReview.answerAll(known);
    // One answered wrongly on purpose, and perhaps one the journey did not know yet.
    expect(wrong).toBeGreaterThan(0);
    // Each question once, and each answered wrongly once more, then right: the journey knows its answer by then.
    expect(asked).toBe(questions + wrong);
  });

  await app.step("08 · Back at the course: the chapter is cheered and done, the next one open", async () => {
    await app.course.expectShown(course);
    await app.course.expectCheered(chapter);
  });
});
