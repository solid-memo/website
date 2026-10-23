// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect } from "@playwright/test";
import { test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";
import { BRIGHTEST_STARS } from "../pages/Library.ts";

/**
 * A newcomer's first course: a new instance has no decks, so its deck
 * list offers the course the library's index names for newcomers; one
 * click starts it and opens it, the deck library a button after its way
 * on. Back at Decks the course is a deck and the offer is gone; with
 * only a course on the list, the strip of courses points to the deck
 * library, until a deck imported from it is not a course
 * (docs/courses.md#the-course-for-newcomers). The journey reads the
 * course's title from the offer, so it names none.
 */
test("start the course for newcomers from an empty deck list @course", async ({
  app,
  account,
  runId,
}) => {
  let title = "";

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in with a WebID", () =>
    logInAndCreateInstance(app, account, `Newcomer ${runId}`),
  );

  await app.step("03 · The deck list offers the course for newcomers", async () => {
    await expect(app.decks.newcomerCourse).toBeVisible();
    title = await app.decks.newcomerCourseTitle();
    expect(title).not.toBe("");
  });

  await app.step("04 · Start the course: it opens, the deck library after its way on", async () => {
    await app.decks.startNewcomerCourse(title);
    await app.course.expectLibraryAfter("course.start");
  });

  await app.step("05 · Back at Decks: the course is a deck, and no longer offered", async () => {
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.expectDeck(title);
    await expect(app.decks.newcomerCourse).toBeHidden();
  });

  await app.step(
    "06 · Only a course on the list: the strip points to the deck library, and opens it",
    async () => {
      await app.decks.expectStripLibrary(true);
      await app.decks.openLibraryFromStrip();
    },
  );

  await app.step(
    "07 · A deck imported beside the course: the strip no longer points there",
    async () => {
      await app.library.select(BRIGHTEST_STARS.en);
      await app.library.importSelected([BRIGHTEST_STARS.en]);
      await app.decks.expectStripLibrary(false);
    },
  );
});
