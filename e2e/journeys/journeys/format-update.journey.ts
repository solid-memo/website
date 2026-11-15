// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, test } from "../fixtures.ts";
import { logInAndCreateInstance, logInToInstance } from "../flows/logIn.ts";
import { type OlderInstance, writeOlderInstance } from "../flows/podDocuments.ts";

/**
 * The format update, as the journey's spec numbers it: an instance an
 * older version of Solid Memo left in the pod (written over a new one
 * while the learner is logged out) is read as it is, its decks, cards and
 * review states, and the update is offered. Not now writes nothing. The
 * update is cut off by leaving the page part-way, and the next opening
 * offers only the rest; a document changed elsewhere meanwhile is left as
 * it was and named, and Try again updates it. After a reload nothing is
 * offered, and the decks, cards, directions and progress are as they were.
 * How journeys are run, read when they fail and written:
 * docs/testing.md#user-journeys.
 *
 * It catches an update that loses or changes what the learner had (a
 * review state, a direction, another app's triple), one that writes
 * before the learner starts it, one a closed tab leaves unreadable or
 * not offered again, and one a refused write stops or hides
 * (docs/migrations.md "The pod migration"). The pod's answers are held
 * back or refused by the browser's routes, so every run cuts the update
 * off at the same write.
 */
test("an instance in an older format is updated, and an update cut off is finished later @format-update", async ({
  app,
  account,
  otherApp,
  runId,
}) => {
  const name = `Older ${runId}`;
  const folder = `${account.pod}solid-memo/main/`;
  const capitals = `Capitals ${runId}`;
  const planets = `Planets ${runId}`;
  let docs!: OlderInstance;

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit(), { accessibility: false });

  await app.step(
    "02 · Log in and create the instance",
    async () => {
      await logInAndCreateInstance(app, account, name);
      await app.chrome.expectInstance(name, folder);
    },
    { accessibility: false },
  );

  await app.step(
    "03 · Log out; an older version of Solid Memo's data is in the instance",
    async () => {
      await app.chrome.logOut();
      await app.onboarding.expectLoggedOut();
      docs = await writeOlderInstance(otherApp, folder, { name, capitals, planets, runId });
    },
    { screen: "onboarding" },
  );

  await app.step(
    "04 · Log in: the decks are as the older version left them, and a format update is offered",
    async () => {
      await logInToInstance(app, account, name, { loggedOutHere: true, knownToServer: true });
      // One card due and one new: the review states are read, the card not due left out.
      await app.decks.expectToReview(capitals, 2);
      await app.decks.expectToReview(planets, 1);
      await app.formatUpdate.expectOffered({
        decks: [capitals, planets],
        instance: true,
        preferences: true,
        catalog: true,
      });
    },
    { screen: "decks.format-update" },
  );

  await app.step(
    "05 · Open the update's confirmation and answer Not now: nothing is written",
    async () => {
      const before = await Promise.all(Object.values(docs).map((url) => otherApp.read(url)));
      await app.formatUpdate.decline(name);
      for (const [index, url] of Object.values(docs).entries())
        expect(await otherApp.read(url), url).toBe(before[index]);
    },
    { screen: "decks.format-update" },
  );

  await app.step(
    "06 · Start the update and close the tab part-way, then open Solid Memo again: only the rest is offered",
    async () => {
      await app.formatUpdate.interruptUpdate(folder, { written: 3, total: 6 });
      await app.chrome.expectInstance(name, folder);
      // The record and the preferences were written; whichever deck came first, both are left.
      await app.formatUpdate.expectOffered({ decks: [capitals, planets], catalog: true });
      // Updated and outdated documents side by side read as before.
      await app.decks.expectToReview(capitals, 2);
      await app.decks.expectToReview(planets, 1);
    },
    { screen: "decks.format-update" },
  );

  await app.step(
    "07 · Update the rest while the catalog is changed elsewhere: it is left as it was and named, and Try again updates it",
    async () => {
      await app.formatUpdate.updateRefused(docs.catalog, { document: "catalog", updated: 2 });
      await app.formatUpdate.tryAgain();
    },
    { screen: "decks" },
  );

  await app.step(
    "08 · Reload: the decks, cards and progress are as they were",
    async () => {
      await app.chrome.reload();
      await app.decks.expectToReview(capitals, 2);
      await app.decks.expectToReview(planets, 1);
      await app.deckBrowser.openFor(capitals);
      await app.deckBrowser.expectFronts([
        `Sweden ${runId}`,
        `Norway ${runId}`,
        `Finland ${runId}`,
      ]);
      await app.deckBrowser.expectBack(`Sweden ${runId}`, "Stockholm");
      const cards = await otherApp.read(docs.capitalsCards);
      // Another app's triple is kept.
      expect(cards).toContain("other-app.example/ns#");
      expect(cards).toContain("kept by another app");
      for (const url of Object.values(docs)) expect(await otherApp.status(url), url).toBe(200);
      // Ends on the deck's page: the Browser of cards that state no language does not reflow at 320px.
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.decks.openDeck(capitals);
      await app.deckDetail.expectCardCount(3);
      await app.deckDetail.expectDueAndNew(1, 1);
    },
    { screen: "deck" },
  );

  await app.step(
    "09 · Study both decks: the planets deck still asks the back, the capitals deck offers only what was due, and nothing is left to update",
    async () => {
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.decks.study(planets);
      const question = await app.study.question();
      expect(question).toContain(`Red planet ${runId}`);
      expect(question).not.toContain(`Mars ${runId}`);
      await app.study.answer("good");
      await app.study.expectFinished();
      await app.study.endSession();
      await app.decks.study(capitals);
      const result = await app.study.studyAll({ grade: "good" });
      // The card reviewed before and not due stays out: its review state came through.
      expect(result.total).toBe(2);
      await app.study.endSession();
      await app.decks.expectDoneForToday(capitals);
      await app.decks.expectDoneForToday(planets);
      // A failed plan shows nothing too; step 07's "up to date" proved the plan empty.
      await app.formatUpdate.expectNone();
    },
    { screen: "decks" },
  );
});
