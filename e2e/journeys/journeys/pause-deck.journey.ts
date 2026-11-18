// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";

/**
 * A deck paused and resumed from the deck list: study its cards, pause
 * it until a day after today, the dialog saying how much of it is likely
 * remembered then, and see it paused in the deck list, after a reload
 * too, and in the Studio; resume it, its row as it was, then pause it
 * until resumed and resume it once more.
 *
 * It catches a pause kept only in the page (gone on a reload, as the
 * pause lives in the deck's entry in the catalog), a paused deck still
 * offered for study, a Studio that shows nothing of the pause, and a
 * resume that leaves the deck paused or that a second pause cannot
 * replace.
 */
test("pause a deck and resume it @pause", async ({ app, account, runId }) => {
  const instance = `Pause ${runId}`;
  const deck = `Planets ${runId}`;
  // Ten days on: a day after today in any of the journeys' time zones.
  const until = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit(), { accessibility: false });

  await app.step("02 · Log in with a WebID", () => logInAndCreateInstance(app, account, instance), {
    accessibility: false,
  });

  await app.step(
    "03 · Create a deck and add two flashcards",
    async () => {
      await app.decks.openDeckCreator();
      await app.deckCreator.create(deck);
      await app.deckBrowser.openFor(deck);
      await app.deckBrowser.openCardCreator();
      await app.cardCreator.addCards(
        [
          [`Sun ${runId}`, "Sol"],
          [`Moon ${runId}`, "Måne"],
        ],
        { front: "en", back: "sv" },
      );
    },
    { screen: "card-creator" },
  );

  await app.step(
    "04 · Study both cards from the deck list",
    async () => {
      await app.cardCreator.back();
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.decks.study(deck);
      const session = await app.study.studyAll({ grade: "good" });
      expect(session).toEqual({ studied: 2, total: 2 });
      await app.study.endSession();
      await app.decks.expectDoneForToday(deck);
    },
    { screen: "decks" },
  );

  await app.step(
    "05 · Pause the deck until a day, the dialog saying what is likely remembered then",
    async () => {
      await app.decks.pause(deck, until);
      await app.decks.expectPaused(deck, until);
    },
    { screen: "decks" },
  );

  await app.step(
    "06 · Reload: the pod keeps the pause",
    async () => {
      await app.chrome.reload();
      await app.decks.expectPaused(deck, until);
    },
    { screen: "decks" },
  );

  await app.step(
    "07 · The Studio's Home badges the deck as paused",
    async () => {
      await app.studio.openFromApp();
      await app.studio.expectPaused(instance, deck, until);
    },
    { screen: "studio.home" },
  );

  await app.step(
    "08 · Back in Solid Memo, resume the deck",
    async () => {
      await app.studio.backToApp();
      await app.decks.resume(deck);
      await app.decks.expectDoneForToday(deck);
    },
    { screen: "decks" },
  );

  await app.step(
    "09 · Pause it until resumed, and resume it again",
    async () => {
      await app.decks.pause(deck);
      await app.decks.expectPaused(deck);
      await app.chrome.reload();
      await app.decks.expectPaused(deck);
      await app.decks.resume(deck);
      await app.decks.expectDoneForToday(deck);
    },
    { screen: "decks" },
  );
});
