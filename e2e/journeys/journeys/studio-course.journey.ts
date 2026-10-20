// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect } from "@playwright/test";
import { test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";

// The second journey adds what the first publishes: they run in turn, the second only after the first passed.
test.describe.configure({ mode: "serial" });

/** The course the first journey published, at its address: what the next journey adds from a link. */
let published: { url: string; title: string } | null = null;

/** The course the first journey writes: its one chapter, its step's theory, and its questions by their right answers. */
const COURSE = {
  chapter: "Pods",
  theory: "A pod is where your data lives.",
  answers: { "Where does your data live?": "In a pod", "Who chooses the app?": "You do" },
};

/**
 * Writing a course in Solid Memo Studio (docs/studio.md), from a blank
 * draft to its release in the user's pod. A user logs in, creates an
 * instance, makes a deck with a card and studies it, and opens the
 * instance in the Studio. They write a course in a blank
 * draft: a chapter, a step with its theory, and two questions, the first
 * with two wrong options, saved as they go, trying one question as the
 * course would ask it. Its release check lists what is still wrong: the
 * second question has no wrong options and the release no description.
 * They follow each problem to its field, fix it, and see it clear; the
 * shapes find what a release still lacks, and the listing preview shows
 * the course as the library will. They note what Solid Memo's statistics
 * count, then test-play the course in the Studio's trial, to the end of
 * its one chapter's final review. The instance, and Solid Memo's
 * statistics, are as they were: the trial is played in a sandbox. They
 * say how the course was made, then publish it to their pod, saying it
 * will be public: someone with no login reads it, and the releases list
 * it. Managing an instance's decks in the Studio is studio.journey.ts's.
 */
test("write a course in the Studio, try it, and publish it to the pod @studio", async ({
  app,
  account,
  runId,
  playwright,
}) => {
  const instance = `Courses ${runId}`;
  const deck = `Studied ${runId}`;
  const authored = `Authored ${runId}`;

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in and create an instance", () =>
    logInAndCreateInstance(app, account, instance),
  );
  // Something studied, for the statistics the trial must leave as they were.
  await app.step("03 · Create a deck with a card, and study it", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(deck);
    await app.deckBrowser.openFor(deck);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards([["Sun", "Sol"]], { front: "en", back: "sv" });
    await app.cardCreator.back();
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.study(deck);
    await app.study.studyAll({ grade: "good" });
    await app.study.endSession();
  });
  await app.step("04 · Open the instance in Solid Memo Studio", () => app.studio.openFromApp());
  await app.step(
    "05 · Write a course: a chapter, a step, and two questions with two wrong options each",
    async () => {
      await app.studio.openDrafts(instance);
      await app.studio.draftCourse(instance, authored);
      await app.draftEditor.openDraft(authored);
      await app.draftEditor.addChapter("Pods");
      await app.draftEditor.openChapter("Pods");
      await app.draftEditor.addStep();
      await app.draftEditor.writeTheory("A pod is where your data lives.");
      await app.draftEditor.addQuestion("Where does your data live?", "In a pod");
      await app.draftEditor.addQuestion("Who chooses the app?", "You do");
      await app.draftEditor.openQuestion("Where does your data live?");
      await app.draftEditor.addWrongOption("In the app", "Apps only read it.");
      await app.draftEditor.addWrongOption("On a server of the app's", "The pod is yours.");
      await app.draftEditor.answerPreviewWrong("In the app", "Apps only read it.");
      await app.draftEditor.expectOutline(authored, "Pods", "Step 1.1", [
        "Where does your data live?",
        "Who chooses the app?",
      ]);
      await app.draftEditor.expectBadge("Who chooses the app?", 1);
    },
  );

  await app.step(
    "06 · Check the release: follow its problems to their fields, fix them, and see them clear",
    async () => {
      const fewOptions = app.t("studio.problem.fewDistractors", { count: 0, least: 2 });
      const noDescription = app.t("studio.problem.required", {
        field: app.t("studio.field.description"),
      });
      const release = app.t("studio.check.release");
      await app.draftEditor.openCheck();
      await app.draftEditor.expectProblem("Who chooses the app?", fewOptions);
      await app.draftEditor.expectProblem(release, noDescription);
      await app.draftEditor.followProblem("Who chooses the app?", fewOptions);
      await app.draftEditor.addWrongOption("The pod", "A pod holds data.");
      await app.draftEditor.addWrongOption("Its maker", "The user chooses.");
      await app.draftEditor.openCheck();
      await app.draftEditor.expectNoProblem("Who chooses the app?", fewOptions);
      await app.draftEditor.followProblem(release, noDescription);
      await app.draftEditor.writeDescription("What a pod is, and who holds the data in it.");
      await app.draftEditor.openCheck();
      await app.draftEditor.expectNoProblem(release, noDescription);
      await app.draftEditor.checkShapes();
      await app.draftEditor.openPreview(authored);
      await app.chrome.breadcrumb("breadcrumbs.decks");
    },
  );

  const counted: Record<string, string> = {};
  const tiles = ["answers", "studyDays", "cards"] as const;
  await app.step("07 · Note what Solid Memo's statistics count", async () => {
    await app.studio.backToApp();
    await app.statistics.open();
    for (const tile of tiles) counted[tile] = await app.statistics.value(tile);
  });

  await app.step(
    "08 · Test-play the course in the Studio's trial, to the end of its final review",
    async () => {
      await app.studio.openFromApp();
      await app.studio.openDrafts(instance);
      await app.draftEditor.openDraft(authored);
      await app.trial.open(authored);
      await app.trial.playToTheEnd(COURSE.chapter, COURSE.theory, COURSE.answers);
    },
  );

  await app.step(
    "09 · The instance's decks and Solid Memo's statistics are as they were",
    async () => {
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.studio.expectDeck(instance, deck, { cards: 1, due: 0 });
      await app.studio.expectNoDeck(instance, authored);
      await app.studio.backToApp();
      await app.statistics.open();
      for (const tile of tiles) expect(await app.statistics.value(tile), tile).toBe(counted[tile]);
    },
  );

  await app.step(
    "10 · Say how the course was made: its author, an attribution, its license, a source and an AI check; follow the source's warning and fix it",
    async () => {
      const source = "https://example.org/pods-explained";
      const undescribed = app.t("studio.problem.sourceUndescribed", {
        missing: app.t("studio.release.detail.creator"),
      });
      await app.studio.openFromApp();
      await app.studio.openDrafts(instance);
      await app.draftEditor.openDraft(authored);
      await app.draftEditor.openRelease();
      await app.draftEditor.addAuthor("Journey Author");
      await app.draftEditor.attributeWithAi("Journey Author");
      await app.draftEditor.chooseReleaseLicense("CC0 1.0");
      await app.draftEditor.addSource(source, "Pods explained", "The page's footer: CC0.");
      await app.draftEditor.recordAiCheck("Facts", "every question", "none wrong");
      await app.draftEditor.openCheck();
      await app.draftEditor.expectProblem(source, undescribed);
      await app.draftEditor.followProblem(source, undescribed);
      await app.draftEditor.describeSource(source, "Pods explained", "Example authors");
      await app.draftEditor.openCheck();
      await app.draftEditor.expectNoProblem(source, undescribed);
    },
  );

  await app.step(
    "11 · Publish the course to the pod, public: anyone can read it, and the releases list it",
    async () => {
      await app.draftEditor.openRelease();
      await app.draftEditor.choosePublisher("Journey Author");
      const url = await app.draftEditor.publish();
      // Someone with no login reads it.
      const anyone = await playwright.request.newContext();
      const read = await anyone.get(url, { headers: { accept: "text/turtle" } });
      expect(read.status()).toBe(200);
      expect(await read.text()).toContain(`"${authored}"@en`);
      await anyone.dispose();
      await app.studio.openReleases(instance);
      await app.studio.expectRelease(instance, url, `authored-${runId}`, 1);
      published = { url, title: authored };
    },
  );
});

/**
 * A course published in a pod, added from its link by someone else
 * (docs/deck-library.md, From a link): another user, with an account and
 * a pod of their own, opens "Add from a link" from their empty deck list
 * and pastes the address of the course the journey before published.
 * The release is read and shown, with the host it is published on, as a
 * course. They start it, and play its chapter to the end of its final
 * review, as a library course is played. Their deck list then says where
 * the course came from.
 */
test("add a course published in a pod from its link, as another user, and play its chapter @studio", async ({
  app,
  account,
  runId,
}) => {
  const course = published;
  expect(course, "the journey just before publishes the course").not.toBeNull();
  const { url, title } = course!;

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in as another user and create an instance", () =>
    logInAndCreateInstance(app, account, `Learner ${runId}`),
  );
  await app.step(
    "03 · Paste the course's link: what it is, and where it is published",
    async () => {
      await app.importUrl.openFromDeckList();
      await app.importUrl.showCourse(url, title);
    },
  );
  await app.step(
    "04 · Start the course and play its chapter to the end of its final review",
    async () => {
      await app.importUrl.startCourse(title);
      await app.course.playChapter(COURSE.chapter, COURSE.theory, COURSE.answers);
    },
  );
  await app.step("05 · Back at Decks: the course says where it came from", async () => {
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.expectDeckFrom(title, new URL(url).host);
  });
});
