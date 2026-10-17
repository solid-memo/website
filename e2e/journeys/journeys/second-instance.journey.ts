// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";

/**
 * A second instance, as the journey's spec numbers it: log in to a first
 * instance in the storage's own `solid-memo/main/` and study a deck of
 * its own there, make a second instance in another folder with a deck of
 * its own, switch between the two, reload, and delete the first, a file
 * another app put in its folder: the folder is kept, and the picker says
 * which and why. How journeys are run, read when they fail and written:
 * docs/testing.md#user-journeys.
 *
 * It catches an instance's decks or study showing in the other (their
 * queries are kept per instance), a new instance written over the first
 * one's folder, the app opening on the wrong screen for how many
 * instances there are (one opens, more are offered), and a deletion that
 * takes what is not Solid Memo's, or keeps its folder without saying so.
 */
test("a second instance @instances", async ({ app, account, otherApp, runId }) => {
  const first = { name: `First ${runId}`, folder: `${account.pod}solid-memo/main/` };
  const second = { name: `Second ${runId}`, folder: `${account.pod}solid-memo/second-${runId}/` };
  const deckA = `Deck A ${runId}`;
  const deckB = `Deck B ${runId}`;
  const otherAppsFile = `${first.folder}notes-${runId}.txt`;

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());

  await app.step("02 · Log in with a WebID and create the first instance", async () => {
    await logInAndCreateInstance(app, account, first.name);
    await app.chrome.expectInstance(first.name, first.folder);
  });

  await app.step("03 · Create a deck of one card and study it", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(deckA);
    await app.deckBrowser.openFor(deckA);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards([[`Sun ${runId}`, "Sol"]], { front: "en", back: "sv" });
    await app.cardCreator.back();
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.openDeck(deckA);
    await app.deckDetail.expectCardCount(1);
    await app.deckDetail.study();
    await app.study.expectStudying(deckA);
    await app.study.answer("good");
    await app.study.expectFinished();
    await app.study.endSession();
    await app.decks.expectDoneForToday(deckA);
  });

  await app.step("04 · Make a second instance in another folder", async () => {
    await app.chrome.switchInstance();
    await app.instancePicker.expectInstances([first.name]);
    await app.instancePicker.openInstanceCreator();
    await app.instanceCreator.create(second.name, second.folder);
    // A new instance has no decks: the course for newcomers is offered, the first's deck is not there.
    await expect(app.decks.newcomerCourse).toBeVisible();
    await expect(app.decks.deckLink(deckA)).toBeHidden();
  });

  await app.step("05 · Create a deck of one card in the second instance", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(deckB);
    await app.deckBrowser.openFor(deckB);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards([[`Moon ${runId}`, "Måne"]], { front: "en", back: "sv" });
    await app.cardCreator.back();
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.expectToReview(deckB, 1);
    // The first instance's study is its own: this one has none yet.
    await app.statistics.open();
    await app.statistics.expectEmpty();
  });

  await app.step("06 · Switch to the first instance, then back to the second", async () => {
    await app.chrome.switchInstance();
    await app.instancePicker.expectInstances([first.name, second.name]);
    await app.instancePicker.open(first.name);
    await app.chrome.expectInstance(first.name, first.folder);
    await app.decks.expectDoneForToday(deckA);
    await expect(app.decks.deckLink(deckB)).toBeHidden();

    await app.chrome.switchInstance();
    await app.instancePicker.open(second.name);
    await app.chrome.expectInstance(second.name, second.folder);
    await app.decks.expectToReview(deckB, 1);
    await expect(app.decks.deckLink(deckA)).toBeHidden();
  });

  await app.step("07 · Reload: the second instance is still open", async () => {
    await app.chrome.reload();
    await app.chrome.expectInstance(second.name, second.folder);
    await app.decks.expectToReview(deckB, 1);
    await expect(app.decks.deckLink(deckA)).toBeHidden();
  });

  await app.step("08 · At Solid Memo's address, two instances: it asks which", async () => {
    await app.chrome.openAtItsAddress();
    await app.instancePicker.expectInstances([first.name, second.name]);
  });

  await app.step(
    "09 · Delete the first instance, which another app keeps a file in: its folder is kept, and why",
    async () => {
      await otherApp.put(otherAppsFile, `Another app's notes, run ${runId}.\n`, "text/plain");
      // The first's own data is in its folder before, so that it is gone after says something.
      expect(await otherApp.status(`${first.folder}meta.ttl`), "the first's meta.ttl").toBe(200);
      await app.instancePicker.delete(first.name);
      await app.instancePicker.expectKeptFolder(first.folder);
      await app.instancePicker.expectInstances([second.name]);
      // Solid Memo's own data is gone from the folder; the other app's file is not.
      expect(await otherApp.status(`${first.folder}meta.ttl`), "the first's meta.ttl").toBe(404);
      expect(await otherApp.status(otherAppsFile), "the other app's file").toBe(200);
    },
  );

  await app.step("10 · At Solid Memo's address, one instance: it opens", async () => {
    await app.chrome.openAtItsAddress();
    await app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
    await app.chrome.expectInstance(second.name, second.folder);
    await app.decks.expectToReview(deckB, 1);
  });
});
