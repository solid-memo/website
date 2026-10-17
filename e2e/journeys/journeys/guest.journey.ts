// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, test } from "../fixtures.ts";
import type { Answers } from "../pages/CourseQuestion.ts";
import { BRIGHTEST_STARS } from "../pages/Library.ts";

/**
 * A guest moves into their pod (docs/guest-mode.md): try Solid Memo
 * without logging in, answer the first step of the course for newcomers,
 * add a library deck and study it; then log in with a WebID to keep it
 * all. The move into a new instance is cut off by a closed tab first,
 * and the partial copy it left removed; moved again, nothing studied is
 * lost, and after a reload the instance is still there, and the guest's
 * study gone from the browser.
 *
 * What it catches: the guest's pod, kept in IndexedDB, surviving the
 * login's full-page redirects to the identity provider and back; the
 * copy registered in the user's real type index, which is all a reload
 * finds instances by; and a cut-off move's copy found and removed, so
 * the same place is free to move into again.
 */
test("a guest moves their study into their pod @guest", async ({ app, account }) => {
  const known: Answers = new Map();
  const guestInstance = app.t("guest.instanceName");
  const stars = BRIGHTEST_STARS.en;
  // Where the form suggests a first instance goes.
  const location = `${account.pod}solid-memo/main/`;
  let course = "";
  let chapter = "";
  let questions = 0;
  let answers = "";

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());

  await app.step("02 · Try it as a guest: nothing studied yet", async () => {
    await app.onboarding.tryAsGuest();
    await app.statistics.open();
    await app.statistics.expectEmpty();
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("03 · Work through the first step of the course for newcomers", async () => {
    course = await app.decks.newcomerCourseTitle();
    await app.decks.startNewcomerCourse(course);
    await app.course.start();
    chapter = await app.chapter.expectOpen();
    questions = await app.chapter.workThroughStep(known);
    expect(questions).toBeGreaterThan(0);
    await app.chrome.breadcrumb("breadcrumbs.course");
    await app.course.expectStepsDone(chapter, 1);
  });

  await app.step("04 · Add a library deck", async () => {
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.library.open();
    await app.library.expectDeck(stars);
    await app.library.select(stars);
    await app.library.importSelected([stars]);
  });

  await app.step("05 · Study it", async () => {
    await app.decks.study(stars);
    await app.study.expectStudying(stars);
    const { studied } = await app.study.studyAll();
    expect(studied).toBeGreaterThan(0);
    await app.study.endSession();
    await app.decks.expectDoneForToday(stars);
    await app.statistics.open();
    answers = await app.statistics.value("answers");
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("06 · Log in with a WebID: the study is offered to keep", async () => {
    await app.chrome.keepStudy();
    await app.onboarding.submitWebId(account.webId);
    await app.cssLogin.logIn(account);
    await app.cssLogin.authorize(account.webId);
    await app.onboarding.continueConnected(account.pod);
    await app.chrome.expectLoggedInAs(account.webId);
    await app.guestOffer.expectOffered(guestInstance, 2);
  });

  await app.step("07 · Start moving it into the pod, and close the tab while it copies", () =>
    app.guestOffer.interruptMove(location, 3),
  );

  await app.step(
    "08 · Back in Solid Memo, still logged in: remove the partial copy the move left",
    async () => {
      await app.chrome.expectLoggedInAs(account.webId);
      await app.guestOffer.expectOffered(guestInstance, 2);
      await app.guestOffer.removeLeftover(guestInstance, location);
    },
  );

  await app.step("09 · Move it into a new instance in the pod, at the same place", () =>
    app.guestOffer.moveIntoPod(location),
  );

  await app.step("10 · Nothing studied was lost", async () => {
    await app.decks.expectDeck(course);
    await app.decks.expectDoneForToday(stars);
    await app.decks.openStartedCourse(course);
    await app.course.expectStepsDone(chapter, 1);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    // Each question answered added its card to the course's deck.
    await app.decks.openDeck(course);
    await app.deckDetail.expectCardCount(questions);
    await app.statistics.open();
    expect(await app.statistics.value("answers")).toBe(answers);
  });

  await app.step(
    "11 · Reload: the instance is found in the pod, and no study is left to keep",
    async () => {
      await app.chrome.reload();
      await app.chrome.expectLoggedInAs(account.webId);
      expect(await app.statistics.value("answers")).toBe(answers);
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.decks.expectDeck(course);
      await app.decks.expectDoneForToday(stars);
      await app.guestOffer.expectNone();
    },
  );

  await app.step(
    "12 · Log out and open Solid Memo again: no guest's study is left in this browser",
    async () => {
      await app.chrome.logOut();
      // A guest's pod left here would open as the guest's study, not the landing page.
      await app.onboarding.visit();
    },
  );
});
