// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect } from "@playwright/test";
import { test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";
import type { Answers } from "../pages/CourseQuestion.ts";

/**
 * A learner previews the course from the deck library first: a chapter
 * opened from its list, its first step's theory, then a question,
 * nothing recorded. Then the learner reads the course in a language of its own (docs/i18n.md,
 * "Which language"), chosen on its preferences: its title, chapters and
 * theory in Swedish, the app's own words in English; then, back in the
 * app's language, works through its first chapter (docs/courses.md, "The
 * learner's flow"): each step's theory a chunk at a time, then its
 * questions without it, each answer adding its card to the deck; the
 * word before the final review; the review, where a question answered
 * wrongly comes back until it is answered right; and back on the
 * course's page, the chapter cheered, done, and the next one open, the
 * deck library after the way on; the
 * statistics, which count its answers apart from recall and show the
 * chapter done with its graded answers; and the
 * course's deck, which names the wrong options chosen. It is
 * the course the library offers newcomers, whichever that is: the
 * journey learns each right answer as the app shows it.
 */
test("work through a course's first chapter and its final review @course", async ({
  app,
  account,
  runId,
}) => {
  const known: Answers = new Map();
  let course = "";
  let chapter = "";

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in with a WebID", () =>
    logInAndCreateInstance(app, account, `Learner ${runId}`),
  );

  let previewed = "";
  await app.step(
    "02b · Preview the course for newcomers: its first chapter's first step, theory then a question",
    async () => {
      course = await app.decks.newcomerCourseTitle();
      await app.library.open();
      await app.library.openDeck(course);
      await app.libraryDeck.openPreview(course);
      previewed = await app.libraryPreview.openChapter(1);
      await app.chapter.readTheory();
      await app.question.answer(new Map(), { recorded: false });
      await app.libraryPreview.allChapters();
      await app.libraryPreview.backToLibrary();
      await app.chrome.breadcrumb("breadcrumbs.decks");
    },
  );

  await app.step("03 · Start the course for newcomers", async () => {
    course = await app.decks.newcomerCourseTitle();
    await app.decks.startNewcomerCourse(course);
  });

  await app.step(
    "03b · Choose Swedish as the course's language: its title and chapters in it, the app's words in English",
    async () => {
      await app.course.openPreferences();
      await app.deckPreferences.chooseCourseLanguage("sv");
      await app.deckPreferences.backToCourse();
      await app.course.expectCourseLanguage("sv");
    },
  );

  await app.step("03c · A chapter's title and theory in Swedish too", async () => {
    await app.course.start();
    await app.chapter.expectCourseLanguage("sv");
    await app.chrome.breadcrumb("breadcrumbs.course");
  });

  await app.step("03d · Back to the app's language for the course", async () => {
    await app.course.openPreferences();
    await app.deckPreferences.chooseCourseLanguage(null);
    await app.deckPreferences.backToCourse();
    await app.course.expectCourseLanguage(null);
    await app.course.expectShown(course);
  });

  await app.step(
    "04 · Start the course: the first chapter opens at its first step's theory",
    async () => {
      await app.course.start();
      chapter = await app.chapter.expectOpen();
      // The preview recorded nothing: the course opens at the chapter previewed.
      expect(chapter).toBe(previewed);
    },
  );

  await app.step(
    "05 · Each step: its theory a chunk at a time, then its questions without it",
    async () => {
      const steps = await app.chapter.workThrough(known);
      expect(steps.map(({ step }) => step)).toEqual(steps.map((_, index) => index + 1));
      // The library's course for newcomers reads its theory in chunks (docs/courses.md, "Which course").
      expect(steps.some(({ chunks }) => chunks > 1)).toBe(true);
    },
  );

  await app.step("06 · A word before the final review", () =>
    app.chapterReview.expectWord(chapter),
  );

  await app.step("07 · The final review: a wrong answer comes back until it is right", async () => {
    await app.chapterReview.start();
    const { asked, questions, wrong } = await app.chapterReview.answerAll(known);
    // One answered wrongly on purpose, and perhaps one the journey did not know yet.
    expect(wrong).toBeGreaterThan(0);
    // Each question once, and each answered wrongly once more, then right: the journey knows its answer by then.
    expect(asked).toBe(questions + wrong);
  });

  await app.step(
    "08 · Back at the course: the chapter is cheered and done, the next one open, the library after it",
    async () => {
      await app.course.expectShown(course);
      await app.course.expectCheered(chapter);
    },
  );

  await app.step(
    "09 · The statistics count the course's answers as graded course answers, not as recall, and its chapter done",
    async () => {
      await app.statistics.open();
      await app.statistics.expectCourseAnswersOnly();
      await app.statistics.expectCourseChapter(course, chapter);
    },
  );

  await app.step("10 · The course's deck names the wrong options chosen most", async () => {
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.openDeck(course);
    await app.deckDetail.expectConfusedOptions();
  });
});
