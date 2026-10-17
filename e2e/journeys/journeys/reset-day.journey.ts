// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";

/**
 * Today's study undone: study a deck from its page, undoing one answer
 * on the way, its card and the count back; reset today's study there
 * (confirming), and see its cards and today's budget of new cards come
 * back, the deck list, the today strip and the statistics saying nothing
 * was studied today, also once the app is read again from the pod on a
 * reload; then study the deck again, its session as large as the first,
 * the statistics counting its answers alone.
 *
 * It catches an undo that leaves the session past its card, or its
 * answer in the log, counted with the day's. It catches a reset that
 * puts the cards back but leaves today's budget spent (nothing new to
 * introduce until tomorrow), one whose screens other than the deck's
 * page go on showing the day's answers until a reload, and one that
 * leaves the discarded answers in the pod's log, so that they come back
 * on a reload or are counted with the next session's.
 *
 * With two new cards a day, a deck of three offers two today; answering
 * both leaves the deck done for the day, its third card for tomorrow.
 */
test("reset today's study @reset", async ({ app, account, runId }) => {
  const deck = `Reset ${runId}`;
  const budget = 2;

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());

  await app.step("02 · Log in with a WebID", () =>
    logInAndCreateInstance(app, account, `Reset ${runId}`),
  );

  await app.step("03 · Set new cards per day to 2 in Preferences", async () => {
    await app.preferences.open();
    await app.preferences.setNewCardsPerDay(budget);
    await app.preferences.save();
  });

  await app.step("04 · Create a deck", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(deck);
  });

  await app.step("05 · Add three flashcards", async () => {
    await app.deckBrowser.openFor(deck);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards(
      [
        [`Red ${runId}`, "Röd"],
        [`Green ${runId}`, "Grön"],
        [`Blue ${runId}`, "Blå"],
      ],
      { front: "en", back: "sv" },
    );
    await app.cardCreator.back();
    await app.deckBrowser.expectFronts([`Red ${runId}`, `Green ${runId}`, `Blue ${runId}`]);
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("06 · The deck's page: three cards, two new to introduce today", async () => {
    await app.decks.expectToReview(deck, budget);
    await app.decks.openDeck(deck);
    await app.deckDetail.expectCardCount(3);
    await app.deckDetail.expectNewToIntroduce(budget);
    await app.deckDetail.expectNothingStudiedToday();
  });

  await app.step("07 · Study the deck from its page, answer a card and undo it", async () => {
    await app.deckDetail.study();
    await app.study.expectStudying(deck);
    await app.study.expectPosition(1, budget);
    const first = await app.study.question();
    await app.study.answer("good");
    await app.study.undo(1, budget);
    expect(await app.study.question(), "the card answered, up again").toBe(first);
  });

  await app.step("08 · Study the whole session and end it", async () => {
    const session = await app.study.studyAll({ grade: "good" });
    expect(session, "today's budget: two of the deck's three cards").toEqual({
      studied: budget,
      total: budget,
    });
    await app.study.endSession();
    await app.decks.expectDoneForToday(deck);
    await app.decks.expectAnsweredToday(budget);
  });

  await app.step("09 · Reset today's study on the deck's page", async () => {
    await app.decks.openDeck(deck);
    await app.deckDetail.expectAllStudied(budget);
    await app.deckDetail.resetDay(deck, budget);
    // The two cards are new again, and today's budget whole once more.
    await app.deckDetail.expectNewToIntroduce(budget);
    await app.deckDetail.expectCardCount(3);
  });

  await app.step(
    "10 · The deck list, the today strip and the statistics say nothing was studied today",
    async () => {
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.decks.expectToReview(deck, budget);
      await app.decks.expectNothingAnsweredToday();
      await app.statistics.open();
      await app.statistics.expectEmpty();
    },
  );

  await app.step("11 · Reload: the pod says the same", async () => {
    await app.chrome.reload();
    await app.statistics.expectEmpty();
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.chrome.reload();
    await app.decks.expectToReview(deck, budget);
    await app.decks.expectNothingAnsweredToday();
    await app.decks.openDeck(deck);
    await app.deckDetail.expectNewToIntroduce(budget);
    await app.deckDetail.expectNothingStudiedToday();
  });

  await app.step("12 · Study the deck again: its two cards come round, counted once", async () => {
    await app.deckDetail.study();
    const session = await app.study.studyAll({ grade: "good" });
    expect(session, "the budget the reset gave back").toEqual({
      studied: budget,
      total: budget,
    });
    await app.study.endSession();
    await app.decks.expectDoneForToday(deck);
    // The answers the reset discarded count nowhere: only this session's.
    await app.decks.expectAnsweredToday(budget);
    await app.statistics.open();
    await app.statistics.expectStatistics({
      answers: budget,
      studyDays: 1,
      today: { answers: budget, introduced: budget, remembered: 0, lapses: 0, repeats: 0 },
    });
  });
});
