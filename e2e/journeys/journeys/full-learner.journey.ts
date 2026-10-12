// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";
import { BRIGHTEST_STARS } from "../pages/Library.ts";
import type { StudyResult } from "../pages/Study.ts";

/**
 * A learner's whole first day, as the journey's spec numbers it: log in,
 * keep new cards to one a day, make two decks of two cards and study,
 * group the decks, reorder and ungroup them, allow two new cards a day on
 * four answer buttons and study again, read the statistics and a card's
 * history, preview,
 * import and describe a library deck in English and Swedish, validate
 * the instance and log out. How journeys are run, read when they fail
 * and written: docs/testing.md#user-journeys.
 *
 * New cards per day count per deck, so with 1 the first session holds
 * one of deck A's two cards; with 2, deck A has its other card left and
 * deck B both of its own. Every answer is Good, which keeps a card out
 * of the session once answered, but deck B's first in step 13: Again,
 * which brings it round once more the same day.
 */
test("a learner's full journey @library", async ({ app, account, runId }) => {
  const deckA = `Deck A ${runId}`;
  const deckB = `Deck B ${runId}`;
  const group = `Group ${runId}`;
  const description = {
    en: `The night sky's brightest stars, described by journey ${runId}.`,
    sv: `Natthimlens ljusaste stjärnor, åäö ÅÄÖ, beskrivna av resa ${runId}.`,
  };
  const sessions: Record<"first" | "deckA" | "deckB", StudyResult> = {
    first: { studied: 0, total: 0 },
    deckA: { studied: 0, total: 0 },
    deckB: { studied: 0, total: 0 },
  };

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());

  await app.step("02 · Log in with a WebID", () =>
    logInAndCreateInstance(app, account, `Journey ${runId}`),
  );

  await app.step("03 · Set new cards per day to 1 in Preferences", async () => {
    await app.preferences.open();
    await app.preferences.setNewCardsPerDay(1);
    await app.preferences.save();
  });

  await app.step("04 · Create a deck", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(deckA);
  });

  await app.step("05 · Add two flashcards", async () => {
    await app.deckBrowser.openFor(deckA);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards(
      [
        [`Sun ${runId}`, "Sol"],
        [`Moon ${runId}`, "Måne"],
      ],
      { front: "en", back: "sv" },
    );
    await app.cardCreator.back();
    await app.deckBrowser.expectFronts([`Sun ${runId}`, `Moon ${runId}`]);
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("06 · Study the deck and end the session", async () => {
    await app.decks.study(deckA);
    sessions.first = await app.study.studyAll({ grade: "good", scale: "sm2" });
    expect(sessions.first, "one new card a day: one of the deck's two").toEqual({
      studied: 1,
      total: 1,
    });
    await app.study.endSession();
    await app.decks.expectDoneForToday(deckA);
  });

  await app.step("07 · Create another deck", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(deckB);
  });

  await app.step("08 · Add two flashcards", async () => {
    await app.deckBrowser.openFor(deckB);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards(
      [
        [`Star ${runId}`, "Stjärna"],
        [`Sky ${runId}`, "Himmel"],
      ],
      { front: "en", back: "sv" },
    );
    await app.cardCreator.back();
    await app.deckBrowser.expectFronts([`Star ${runId}`, `Sky ${runId}`]);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.expectOrder([deckA, deckB]);
  });

  await app.step("09 · Group the decks and name the group", async () => {
    expect(
      await app.groups.groupWithNeighbor(deckA),
      "deck A is first, so it groups with the one below",
    ).toBe("below");
    await app.groups.nameGroup(group);
    expect(await app.groups.orderIn(group)).toEqual([deckA, deckB]);
  });

  await app.step("10 · Move the first deck in the group down, under the next deck", async () => {
    await app.groups.moveDown(deckA, { position: 2, count: 2, group });
    await expect.poll(() => app.groups.orderIn(group)).toEqual([deckB, deckA]);
  });

  await app.step("11 · Remove the group", async () => {
    await app.groups.deleteGroup(group);
    await app.decks.expectOrder([deckB, deckA]);
  });

  await app.step(
    "12 · Set new cards per day to 2 and the answer buttons to Again · Hard · Good · Easy",
    async () => {
      await app.preferences.open();
      await app.preferences.expectNewCardsPerDay(1);
      await app.preferences.expectAnswerButtons("sm2");
      await app.preferences.setNewCardsPerDay(2);
      await app.preferences.setAnswerButtons("minimal");
      await app.preferences.save();
    },
  );

  await app.step("13 · Study both decks", async () => {
    await app.decks.study(deckA);
    sessions.deckA = await app.study.studyAll({ grade: "good", scale: "minimal" });
    expect(sessions.deckA, "deck A: the card left from step 06").toEqual({ studied: 1, total: 1 });
    await app.study.endSession();
    // The strip counts each session's answers as soon as it ends.
    await app.decks.expectAnsweredToday(sessions.first.studied + sessions.deckA.studied);
    await app.decks.study(deckB);
    sessions.deckB = await app.study.studyAll({
      grade: "good",
      scale: "minimal",
      againFirst: true,
    });
    expect(sessions.deckB, "deck B: two new cards a day, the first answered twice").toEqual({
      studied: 3,
      total: 2,
    });
    await app.study.endSession();
    await app.decks.expectAnsweredToday(
      sessions.first.studied + sessions.deckA.studied + sessions.deckB.studied,
    );
    await app.decks.expectDoneForToday(deckA);
    await app.decks.expectDoneForToday(deckB);
  });

  await app.step("14 · Turn developer mode on", async () => {
    await app.preferences.open();
    await app.preferences.expectNewCardsPerDay(2);
    await app.preferences.expectAnswerButtons("minimal");
    await app.preferences.setDeveloperMode(true);
    await app.preferences.save();
    await expect(app.chrome.developerTools).toBeVisible();
  });

  await app.step("15 · Check the statistics", async () => {
    // Each card was answered once, Good, but deck B's first, answered
    // Again and then Good: still no reviews (a card's first answer is not
    // one, nor is the answer to a card back in the session that day), so
    // no recall and no lapse.
    const answeredA = sessions.first.studied + sessions.deckA.studied;
    const answeredB = sessions.deckB.studied;
    const answers = answeredA + answeredB;
    expect({ answeredA, answeredB, answers }, "what steps 06 and 13 add up to").toEqual({
      answeredA: 2,
      answeredB: 3,
      answers: 5,
    });
    const cards = 4;
    await app.statistics.open();
    await app.statistics.expectStatistics({
      answers,
      studyDays: 1,
      cards,
      currentStreak: 1,
      longestStreak: 1,
      young: null,
      mature: null,
      // The log begins today, inside the 12 months read: the page says since when.
      coverage: "thisMonth",
      // Four new cards, one of them deck B's first, answered Again; once
      // more the same day, it is a repeat, which no figure but the day's
      // answers counts.
      today: { answers, introduced: cards, remembered: 0, lapses: 0, repeats: 1 },
      buttons: {
        first: { again: 1, hard: 0, good: cards - 1, easy: 0 },
        young: { again: 0, hard: 0, good: 0, easy: 0 },
        mature: { again: 0, hard: 0, good: 0, easy: 0 },
      },
      // The first study day is today: one of its weekday, studied.
      weekday: { average: answers, studied: 1, of: 1 },
      decks: [deckA, deckB].map((name, i) => ({
        name,
        answers: i === 0 ? answeredA : answeredB,
        introduced: 2,
        young: null,
        mature: null,
        directions: "–" as const,
        // Deck B's first card was answered Again when it was new.
        firstTry: { recalled: i === 0 ? 2 : 1, introduced: 2 },
        lapses: 0,
        quiz: null,
        lastStudied: "today" as const,
      })),
      // Two front→back decks of two cards make four prompts, every one
      // answered, so young (an interval of a day) and none left new; deck
      // B's first, answered Again, was remembered once more, so it is not
      // relearning. None falls due before tomorrow.
      maturity: { new: 0, relearning: 0, young: cards, mature: 0 },
      overdue: 0,
      maturityByDeck: [
        { name: deckA, new: 0, relearning: 0, young: 2, mature: 0 },
        { name: deckB, new: 0, relearning: 0, young: 2, mature: 0 },
      ],
      // No review yet, so nothing is hard to tell: no leeches listed.
      leeches: null,
    });
  });

  await app.step("15b · Read the history of deck B's cards", async () => {
    const histories = [];
    for (const front of [`Star ${runId}`, `Sky ${runId}`]) {
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.deckBrowser.openFor(deckB);
      await app.cardEditor.open(front);
      histories.push(await app.cardEditor.history());
    }
    // One card was answered Good once; the other Again, then Good once
    // more the same day, newest first, the repeat told apart.
    const good = app.t("study.minimal.good");
    expect(histories.sort((a, b) => a.length - b.length)).toEqual([
      [{ kind: app.t("card.historyFirst"), answer: good }],
      [
        { kind: app.t("card.historyRepeat"), answer: good },
        { kind: app.t("card.historyFirst"), answer: app.t("study.minimal.again") },
      ],
    ]);
  });

  await app.step(
    "16 · Preview a library deck and answer 2 cards, then back to the library",
    async () => {
      await app.chrome.breadcrumb("breadcrumbs.decks");
      await app.library.open();
      await app.library.openDeck(BRIGHTEST_STARS.en);
      await app.libraryDeck.openPreview(BRIGHTEST_STARS.en);
      await app.libraryPreview.answer(2);
      await app.libraryPreview.backToLibrary();
    },
  );

  await app.step("17 · Select the deck and import it", async () => {
    await app.library.select(BRIGHTEST_STARS.en);
    await app.library.importSelected([BRIGHTEST_STARS.en]);
  });

  await app.step(
    "18 · Describe the imported deck in English and Swedish in its Browser",
    async () => {
      // Importing lands on Decks; the imported copy's Browser is under it.
      await app.deckBrowser.openFor(BRIGHTEST_STARS.en);
      await app.deckBrowser.describe(description);
    },
  );

  await app.step("19 · The deck's details show the updated description", async () => {
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.openDeck(BRIGHTEST_STARS.en);
    await app.deckDetail.expectDescription(description.en);
  });

  await app.step(
    "20 · In Swedish, the deck's details show the updated Swedish description",
    async () => {
      await app.chrome.switchLanguage("sv");
      await app.deckDetail.expectDeck(BRIGHTEST_STARS.sv);
      await app.deckDetail.expectDescription(description.sv);
    },
  );

  await app.step("20b · Switch back to English", async () => {
    await app.chrome.switchLanguage("en");
    await app.deckDetail.expectDeck(BRIGHTEST_STARS.en);
    await app.deckDetail.expectDescription(description.en);
  });

  await app.step(
    "21 · With developer mode on, validate the instance: all documents conform",
    async () => {
      await app.preferences.open();
      await app.preferences.expectDeveloperMode(true);
      await app.preferences.setDeveloperMode(true);
      await app.preferences.save();
      await app.validation.open();
      const documents = await app.validation.expectAllConform();
      // The spec's "All N documents conform.": three decks and more, so the plural.
      expect(documents).toBeGreaterThan(1);
      test.info().annotations.push({ type: "documents conform", description: String(documents) });
    },
  );

  await app.step("22 · Log out", async () => {
    await app.chrome.logOut();
    await app.onboarding.expectLoggedOut();
  });
});
