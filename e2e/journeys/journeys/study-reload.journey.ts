// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";

/**
 * Reloading the app in the middle of a study session: the study screen
 * comes back, and its session starts again from the pod with only the
 * cards not answered yet, so no answer is lost or counted twice. The
 * deck list, the statistics and each card's history count every answer
 * once (docs/srs.md#study-sessions). Catches answers kept only in the
 * page, a session that starts over with the cards already answered, and
 * a reload that loses the route.
 *
 * Four new cards, all within the five new cards a day: two answered
 * Good before the reload, the other two after it. Good keeps a card out
 * of the session once answered, so each card is answered once.
 */
test("reload in the middle of a study session @reload", async ({ app, account, runId }) => {
  const deck = `Reload ${runId}`;
  const fronts = [`North ${runId}`, `South ${runId}`, `East ${runId}`, `West ${runId}`];
  const cards = fronts.length;
  const beforeReload = 2;

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());

  await app.step("02 · Log in with a WebID", () =>
    logInAndCreateInstance(app, account, `Reload ${runId}`),
  );

  await app.step("03 · Create a deck", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(deck);
  });

  await app.step("04 · Add four flashcards", async () => {
    await app.deckBrowser.openFor(deck);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards(
      [
        [fronts[0]!, "Norr"],
        [fronts[1]!, "Söder"],
        [fronts[2]!, "Öster"],
        [fronts[3]!, "Väster"],
      ],
      { front: "en", back: "sv" },
    );
    await app.cardCreator.back();
    await app.deckBrowser.expectFronts(fronts);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.expectToReview(deck, cards);
  });

  await app.step("05 · Study the deck from its page and answer two cards", async () => {
    await app.decks.openDeck(deck);
    await app.deckDetail.expectCardCount(cards);
    await app.deckDetail.study();
    await app.study.expectStudying(deck);
    await app.study.expectPosition(1, cards);
    for (let i = 0; i < beforeReload; i++) await app.study.answer("good");
    await app.study.expectPosition(beforeReload + 1, cards);
  });

  await app.step("06 · Reload: the session goes on with the two cards left", async () => {
    await app.chrome.reload();
    await app.study.expectStudying(deck);
    // The session is read again from the pod: the cards answered are
    // done for today, so it holds only the others, from the first.
    await app.study.expectPosition(1, cards - beforeReload);
  });

  await app.step("07 · Answer the cards left and end the session", async () => {
    const after = await app.study.studyAll({ grade: "good" });
    expect(after, "the two cards not answered before the reload").toEqual({
      studied: cards - beforeReload,
      total: cards - beforeReload,
    });
    await app.study.expectFinished();
    await app.study.endSession();
    await app.decks.expectDoneForToday(deck);
    await app.decks.expectAnsweredToday(cards);
  });

  await app.step("08 · Reload: the deck list counts each answer once", async () => {
    await app.chrome.reload();
    await app.decks.expectDoneForToday(deck);
    await app.decks.expectAnsweredToday(cards);
  });

  await app.step("09 · The statistics count each answer once", async () => {
    await app.statistics.open();
    await app.statistics.expectStatistics({
      answers: cards,
      studyDays: 1,
      cards,
      // Four new cards, each answered once, Good: no review, no repeat.
      today: { answers: cards, introduced: cards, remembered: 0, lapses: 0, repeats: 0 },
      decks: [{ name: deck, answers: cards, introduced: cards, lapses: 0, lastStudied: "today" }],
      maturity: { new: 0, relearning: 0, young: cards, mature: 0 },
    });
  });

  await app.step("10 · Each card's history holds one answer", async () => {
    for (const front of fronts) {
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.deckBrowser.openFor(deck);
      await app.cardEditor.open(front);
      // The history names an answer by the four buttons' words, whichever scale gave it.
      expect(await app.cardEditor.history(), front).toEqual([
        { kind: app.t("card.historyFirst"), answer: app.t("study.minimal.good") },
      ]);
    }
  });
});
