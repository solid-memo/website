import { expect } from "@playwright/test";
import { test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";

/**
 * A newcomer's first course: a new instance has no decks, so its deck
 * list offers the course the library's index names for newcomers; one
 * click starts it and opens it, and back at Decks the course is a deck
 * and the offer is gone (docs/courses.md#the-course-for-newcomers). The
 * journey reads the course's title from the offer, so it names none.
 */
test("start the course for newcomers from an empty deck list @course", async ({ app, account, runId }) => {
  let title = "";

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in with a WebID", () => logInAndCreateInstance(app, account, `Newcomer ${runId}`));

  await app.step("03 · The deck list offers the course for newcomers", async () => {
    await expect(app.decks.newcomerCourse).toBeVisible();
    title = await app.decks.newcomerCourseTitle();
    expect(title).not.toBe("");
  });

  await app.step("04 · Start the course: it opens", () => app.decks.startNewcomerCourse(title));

  await app.step("05 · Back at Decks: the course is a deck, and no longer offered", async () => {
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.expectDeck(title);
    await expect(app.decks.newcomerCourse).toBeHidden();
  });
});
