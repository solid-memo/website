// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { test } from "../fixtures.ts";
import type { Answers } from "../pages/CourseQuestion.ts";
import { BRIGHTEST_STARS } from "../pages/Library.ts";

/**
 * The theme tour of the library (harness/screens.ts): the deck library,
 * a deck's page and a link to a deck it does not have, Add from a link
 * with a release shown, and the course for newcomers from its page to a
 * chapter's question, its final review and the statistics of its
 * answers, each screen checked in every palette and theme but Standard
 * light, which the feature journeys check them in
 * (docs/accessibility.md). A guest's, as every one of these screens is
 * a guest's too, so no login is waited for. The tour picks Parchment in
 * the light theme first, as a user would; its checks put that back on
 * each screen after the others.
 */
test("the library screens in every palette and theme @tour-library", async ({ app }) => {
  const known: Answers = new Map();
  const stars = BRIGHTEST_STARS.en;
  // A library release by its address, which the site serves (docs/deck-library.md).
  const release = "https://solid-memo.com/decks/brightest-stars/v1.ttl";
  let chapter = "";

  await app.tour("library", async () => {
    await app.step(
      "01 · Try Solid Memo as a guest, in Parchment and the light theme",
      async () => {
        await app.onboarding.visit();
        await app.onboarding.tryAsGuest();
        await app.preferences.open();
        await app.preferences.setTheme("light");
        await app.preferences.setPalette("parchment");
        await app.preferences.save();
      },
      { screen: "decks.guest" },
    );

    await app.step("02 · Open the deck library", () => app.library.open(), { screen: "library" });

    await app.step("03 · Open a library deck's page", () => app.library.openDeck(stars), {
      screen: "library-deck",
    });

    await app.step(
      "04 · Follow a link to a deck the library does not have",
      async () => {
        const url = new URL(app.page.url());
        url.hash = `#/try?deck=${encodeURIComponent(new URL("decks/index.ttl#no-such-deck", url).href)}`;
        await app.page.goto(url.href);
        await app.library.expectFromUnknownLink();
      },
      { screen: "library.not-found" },
    );

    await app.step(
      "05 · Paste a library release's link in Add from a link",
      async () => {
        await app.chrome.breadcrumb("breadcrumbs.decks");
        await app.importUrl.openFromDeckList();
        await app.importUrl.showDeck(release, stars, { version: 1, notes: "First release." });
      },
      { screen: "import-url" },
    );

    await app.step(
      "06 · Start the course for newcomers",
      async () => {
        await app.chrome.breadcrumb("breadcrumbs.decks");
        await app.decks.startNewcomerCourse(await app.decks.newcomerCourseTitle());
      },
      { screen: "course" },
    );

    await app.step(
      "07 · Start the course: its first chapter at its first step's theory",
      async () => {
        await app.course.start();
        chapter = await app.chapter.expectOpen();
      },
      { screen: "chapter" },
    );

    await app.step(
      "08 · Read the theory and answer its first question",
      async () => {
        await app.chapter.readTheory();
        await app.question.answer(known);
      },
      { screen: "chapter.question" },
    );

    await app.step(
      "09 · Work through the chapter to the word before its final review",
      async () => {
        await app.chapter.workThrough(known);
        await app.chapterReview.expectWord(chapter);
      },
      { screen: "chapter-review" },
    );

    await app.step(
      "10 · The final review, back to the course cheering the chapter",
      async () => {
        await app.chapterReview.start();
        await app.chapterReview.answerAll(known);
      },
      { screen: "course.completed" },
    );

    await app.step(
      "11 · Open the statistics of the course's answers",
      () => app.statistics.open(),
      {
        screen: "statistics.courses",
      },
    );
  });
});
