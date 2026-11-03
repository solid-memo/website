// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { test } from "../fixtures.ts";
import { BRIGHTEST_STARS } from "../pages/Library.ts";

/** The course the tour writes: its one chapter, its step's theory, and its question by its right answer. */
const COURSE = {
  chapter: "Pods",
  theory: "A pod is where your data lives.",
  answers: { "Where does your data live?": "In a pod" },
};

/** The library release the tour drafts the next version of, by its address, which the site serves. */
const RELEASE = "https://solid-memo.com/decks/brightest-stars/v1.ttl";

/**
 * The theme tour of Solid Memo Studio (docs/accessibility.md): every
 * screen of the Studio checked in the palettes and themes the journeys
 * do not show it in, as each step leaves it, with what the journeys show
 * on it (harness/screens.ts). The journeys check each screen once, as the
 * user sees it; the colors are the tour's, so it reaches each screen by
 * the shortest way and tests nothing the journeys test. A user opens the
 * Studio's landing page, logs in with an account with no instance yet,
 * creates one in Solid Memo and picks Color-blind friendly, dark, in
 * Preferences, makes two decks, studies one and imports a library deck.
 * In the Studio they go through a deck's cards, a card's content,
 * schedule and history, the instance's health, a deck's schedule and
 * about screen, export a deck and delete it, answering the Studio's
 * question, group the decks, and open the library copies and the
 * instance. They draft a course, write it, check it and try it, draft
 * the library deck's next version, compare it, publish it, and see it
 * among the releases, then draw the instance as a graph.
 */
test("the studio screens in every palette and theme @tour-studio", async ({
  app,
  account,
  runId,
}) => {
  const instance = `Tour ${runId}`;
  const alpha = `Alpha ${runId}`;
  const beta = `Beta ${runId}`;
  const course = `Course ${runId}`;

  await app.tour("studio", async () => {
    await app.step("01 · Visit the Studio's landing page", () => app.studio.visitOldAddress(), {
      screen: "studio.landing",
    });
    await app.step(
      "02 · Log in from the Studio's landing page, with no instance yet",
      async () => {
        await app.onboarding.logInWithWebId(account.webId);
        await app.cssLogin.logIn(account);
        await app.cssLogin.authorize(account.webId);
        await app.onboarding.continueConnected(account.pod);
        await app.studio.expectBackAfterLogin();
      },
      { screen: "studio.no-instance" },
    );
    await app.step(
      "03 · Create an instance in Solid Memo, and pick Color-blind friendly, dark",
      async () => {
        await app.studio.backToInstanceCreator();
        await app.instanceCreator.create(instance);
        await app.preferences.open();
        await app.preferences.setPalette("color-vision");
        await app.preferences.setTheme("dark");
        await app.preferences.save();
      },
      { screen: "decks.empty" },
    );
    await app.step(
      "04 · Make two decks, study one's two cards, and import a deck from the library",
      async () => {
        await app.decks.openDeckCreator();
        await app.deckCreator.create(alpha);
        await app.decks.openDeckCreator();
        await app.deckCreator.create(beta);
        await app.deckBrowser.openFor(alpha);
        await app.deckBrowser.openCardCreator();
        await app.cardCreator.addCards(
          [
            ["Sun", "Sol"],
            ["Moon", "Måne"],
          ],
          { front: "en", back: "sv" },
        );
        await app.cardCreator.back();
        await app.chrome.breadcrumb("breadcrumbs.decks");
        await app.decks.study(alpha);
        await app.study.studyAll({ grade: "good" });
        await app.study.endSession();
        await app.library.open();
        await app.library.select(BRIGHTEST_STARS.en);
        await app.library.importSelected([BRIGHTEST_STARS.en]);
      },
      { screen: "decks" },
    );

    await app.step("05 · Open the instance in the Studio", () => app.studio.openFromApp(), {
      screen: "studio.home",
    });
    await app.step(
      "06 · Open a deck's cards in the workbench",
      () => app.studio.openCards(instance, alpha, ["Sun", "Moon"]),
      { screen: "studio.cards" },
    );
    await app.step(
      "07 · Inspect a card, and give it a wrong option",
      async () => {
        await app.studio.openCard(alpha, "Moon");
        await app.studio.openWrongOptions(0);
        await app.studio.addWrongOption("Stjärna", "En stjärna lyser själv.");
      },
      { screen: "studio.card" },
    );
    await app.step("08 · Open the card's schedule", () => app.studio.openSchedule("fsrs6"), {
      screen: "studio.card.schedule",
    });
    await app.step(
      "09 · Open the card's history",
      () => app.studio.openHistory([{ grade: "good", mode: "recall" }]),
      { screen: "studio.card.history" },
    );
    await app.step(
      "10 · Open the instance's health",
      async () => {
        await app.chrome.breadcrumb("breadcrumbs.decks");
        await app.studio.openInstanceHealth(instance, [alpha, beta]);
      },
      { screen: "studio.instance-health" },
    );
    await app.step(
      "11 · Open the deck's schedule",
      async () => {
        await app.chrome.breadcrumb("breadcrumbs.decks");
        await app.studio.openCards(instance, alpha, ["Sun", "Moon"]);
        await app.studio.openDeckSchedule(alpha, { today: 0, week: 2, studied: 2 });
      },
      { screen: "studio.deck-schedule" },
    );
    await app.step(
      "12 · Name the other deck's author and license on its about screen",
      async () => {
        await app.chrome.breadcrumb("breadcrumbs.decks");
        await app.studio.openAbout(instance, beta);
        await app.studio.setAuthorAndLicense("Ada Lovelace", "CC BY 4.0");
      },
      { screen: "studio.deck-about" },
    );
    await app.step(
      "13 · Export that deck as Turtle, with its progress",
      async () => {
        await app.chrome.breadcrumb("breadcrumbs.decks");
        await app.studio.select([beta]);
        await app.studio.exportSelected(instance, beta);
      },
      { screen: "studio.export" },
    );
    await app.step(
      "14 · Ask to delete that deck: the Studio asks first",
      async () => {
        await app.chrome.breadcrumb("breadcrumbs.decks");
        await app.studio.select([beta]);
        await app.studio.askToDeleteSelected([beta]);
      },
      { screen: "studio.confirm" },
    );
    await app.step("15 · Confirm it", () => app.studio.confirmDeletion(instance, [beta]), {
      screen: "studio.home",
    });
    await app.step(
      "16 · Group the decks on the Groups screen",
      async () => {
        await app.studio.openGroups();
        await app.groups.groupWithNeighbor(alpha);
        await app.groups.nameGroup(`Pair ${runId}`);
      },
      { screen: "studio.groups" },
    );
    await app.step(
      "17 · Open the library copies",
      async () => {
        await app.chrome.breadcrumb("breadcrumbs.decks");
        await app.studio.openLibraryCopies(instance, BRIGHTEST_STARS.en);
      },
      { screen: "studio.library-copies" },
    );
    await app.step(
      "18 · Open the instance's name and catalog",
      () => app.studio.openInstance(instance),
      {
        screen: "studio.instance",
      },
    );

    await app.step(
      "19 · Draft a blank course and the library deck's next version",
      async () => {
        await app.studio.openDrafts(instance);
        await app.studio.draftCourse(instance, course);
        await app.studio.draftNextVersion(RELEASE, BRIGHTEST_STARS.en, 2);
      },
      { screen: "studio.drafts" },
    );
    await app.step(
      "20 · Write the course: a chapter, a step, and a question with two wrong options",
      async () => {
        const [[question, answer]] = Object.entries(COURSE.answers) as [[string, string]];
        await app.draftEditor.openDraft(course);
        await app.draftEditor.addChapter(COURSE.chapter);
        await app.draftEditor.openChapter(COURSE.chapter);
        await app.draftEditor.addStep();
        await app.draftEditor.writeTheory(COURSE.theory);
        await app.draftEditor.addQuestion(question, answer);
        await app.draftEditor.openQuestion(question);
        await app.draftEditor.addWrongOption("In the app", "Apps only read it.");
        await app.draftEditor.addWrongOption("On a server of the app's", "The pod is yours.");
        await app.draftEditor.answerPreviewWrong("In the app", "Apps only read it.");
      },
      { screen: "studio.draft" },
    );
    await app.step("21 · Check the course's release", () => app.draftEditor.openCheck(), {
      screen: "studio.draft.check",
    });
    await app.step(
      "22 · Test-play the course in the trial, to the end of its final review",
      async () => {
        await app.trial.open(course);
        await app.trial.playToTheEnd(COURSE.chapter, COURSE.theory, COURSE.answers);
      },
      { screen: "studio.draft.trial" },
    );
    await app.step(
      "23 · Retire a card of the library deck's next version, and compare it with the release",
      async () => {
        await app.studio.openDrafts(instance);
        await app.draftEditor.openDraft(BRIGHTEST_STARS.en, { course: false });
        await app.draftEditor.retireCard("Sirius");
        await app.draftEditor.openDiff();
      },
      { screen: "studio.draft.diff" },
    );
    await app.step("24 · Open its release's metadata", () => app.draftEditor.openRelease(), {
      screen: "studio.draft.release",
    });
    await app.step(
      "25 · Publish it, and see it among the releases",
      async () => {
        await app.draftEditor.publish();
        await app.studio.openReleases(instance);
      },
      { screen: "studio.releases" },
    );
    await app.step("26 · Draw the instance as a graph", () => app.studio.openGraph(instance), {
      screen: "studio.graph",
    });
  });
});
