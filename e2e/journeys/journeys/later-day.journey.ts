// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";
import { fixedOffsetZone, offsetWhereItIs } from "../harness/timezone.ts";

/**
 * A later study day, as the journey's spec numbers it: study a deck of
 * four cards, switch the scheduler to FSRS-6, come back the next study
 * day, review them, forgetting two,
 * and read what that did to the statistics and the deck's hardest cards;
 * then reload, and the deck list still agrees. It catches the review
 * path (cards met before, due again, answered Again) and the deck list's
 * counts, cached in the pod's digest, across a change of study day and
 * after a session left unfinished, on a real pod. How journeys are run,
 * read when they fail and written: docs/testing.md#user-journeys.
 *
 * The next day comes by the time zone, not the clock (page.clock): the
 * Solid server refuses a request whose proof of possession (DPoP) was
 * made more than two minutes off its own clock, and the login's tokens
 * would have expired. The study day is the local date less the day
 * boundary, 4 a.m. (docs/srs.md), so the journey studies at 2 a.m., in
 * a study day that ends at 4, and moves three hours on, to 5 a.m.: the
 * next study day. Its zone, to the minute, is one where it is 2 a.m. as
 * the journey starts, so not the config's, where it is noon.
 *
 * The next day's first session answers two cards Again and ends before
 * either comes round again (where the session puts them back is
 * shuffled), so both are left relearning, due the day after; a second
 * session holds the other two, answered Good. Of the four reviews, two
 * are remembered and two are lapses. A leech, forgotten 4 times, would
 * take three more study days than the time zones' 28 hours hold, so there
 * is none: the statistics say so.
 */
test.use({ timezoneId: "" });

test("a later study day @review", async ({ app, account, runId }) => {
  const deck = `Deck ${runId}`;
  const cards = 4;
  const night = offsetWhereItIs(new Date(), 2);

  await app.step("01 · At 2 a.m., before the study day turns at 4, visit Solid Memo", async () => {
    await app.setTimeZone(fixedOffsetZone(night));
    await app.onboarding.visit();
  });

  await app.step("02 · Log in with a WebID", () =>
    logInAndCreateInstance(app, account, `Journey ${runId}`),
  );

  await app.step("03 · Set the answer buttons to Again · Hard · Good · Easy", async () => {
    await app.preferences.open();
    await app.preferences.setAnswerButtons("minimal");
    await app.preferences.save();
  });

  await app.step("04 · Create a deck of four flashcards", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(deck);
    await app.deckBrowser.openFor(deck);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards(
      [
        [`Sun ${runId}`, "Sol"],
        [`Moon ${runId}`, "Måne"],
        [`Star ${runId}`, "Stjärna"],
        [`Sky ${runId}`, "Himmel"],
      ],
      { front: "en", back: "sv" },
    );
    await app.cardCreator.back();
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("05 · Study the deck, every card Good", async () => {
    await app.decks.study(deck);
    expect(await app.study.studyAll({ grade: "good", scale: "minimal" })).toEqual({
      studied: cards,
      total: cards,
    });
    await app.study.endSession();
    await app.decks.expectDoneForToday(deck);
    await app.decks.expectAnsweredToday(cards);
  });

  await app.step(
    "06 · Switch the scheduler to FSRS-6: each card is worked out from its answer",
    async () => {
      await app.preferences.open();
      await app.preferences.setScheduler("fsrs6");
      await app.preferences.setDesiredRetention(90);
      // Each card's whole history is in the log: its one answer, which introduced it.
      await app.preferences.saveSwitching({ replayed: cards, estimated: 0 });
      // The switch keeps each card due when SM-2 had it due: none today.
      await app.decks.expectDoneForToday(deck);
      await app.preferences.open();
      await app.preferences.expectScheduler("fsrs6");
      await app.chrome.breadcrumb("breadcrumbs.decks");
    },
  );

  await app.step(
    "07 · At 5 a.m., the next study day, open Solid Memo again: every card is due",
    async () => {
      await app.setTimeZone(fixedOffsetZone(night + 3 * 60));
      await app.chrome.reload();
      // A good answer to a new card gave it a day, which the switch kept:
      // all four are due today.
      await app.decks.expectToReview(deck, cards);
    },
  );

  await app.step(
    "08 · Review the deck from its page: answer two cards Again, and end the session",
    async () => {
      await app.decks.openDeck(deck);
      await app.deckDetail.expectCardCount(cards);
      await app.deckDetail.study();
      await app.study.expectStudying(deck);
      await app.study.expectPosition(1, cards);
      // FSRS-6 asks on the four answer buttons, each with the interval it gives.
      await app.study.reveal();
      await app.study.expectScale("minimal");
      await app.study.again();
      await app.study.reveal();
      await app.study.again();
      // Each Again puts its card back, never as the very next one: the
      // second card is another, and the session grows to six.
      await app.study.endSession();
      // A card forgotten is due the next study day; the other two today.
      await app.decks.expectToReview(deck, 2);
      await app.decks.expectAnsweredToday(2);
    },
  );

  await app.step("09 · Study the deck's other two cards, both Good", async () => {
    await app.decks.study(deck);
    await app.study.expectPosition(1, 2);
    await app.study.answer("good");
    await app.study.answer("good");
    await app.study.expectFinished();
    await app.study.endSession();
    await app.decks.expectDoneForToday(deck);
    await app.decks.expectAnsweredToday(cards);
  });

  await app.step(
    "10 · The statistics show recall, lapses and relearning, and no leech yet",
    async () => {
      // Yesterday's four first answers, and today's four reviews: two
      // Again and two Good.
      const answers = 2 * cards;
      await app.statistics.open();
      await app.statistics.expectStatistics({
        answers,
        studyDays: 2,
        cards,
        currentStreak: 2,
        longestStreak: 2,
        young: { recalled: 2, reviews: cards },
        mature: null,
        today: { answers: cards, introduced: 0, remembered: 2, lapses: 2, repeats: 0 },
        buttons: {
          first: { again: 0, hard: 0, good: cards, easy: 0 },
          young: { again: 2, hard: 0, good: 2, easy: 0 },
          mature: { again: 0, hard: 0, good: 0, easy: 0 },
        },
        hours: answers,
        // Every review came after an interval of a day, the first span's.
        recallByInterval: [
          { recalled: 2, reviews: cards },
          ...Array.from({ length: 8 }, () => null),
        ],
        thisWeek: { young: 2, mature: 0, relearning: 2 },
        decks: [
          {
            name: deck,
            answers,
            introduced: cards,
            young: { recalled: 2, reviews: cards },
            mature: null,
            directions: "–",
            firstTry: { recalled: cards, introduced: cards },
            lapses: 2,
            quiz: null,
            lastStudied: "today",
          },
        ],
        // The two forgotten, not remembered since, are relearning, due
        // tomorrow; the two remembered are young, due in a week or so.
        maturity: { new: 0, relearning: 2, young: 2, mature: 0 },
        overdue: 0,
        maturityByDeck: [{ name: deck, new: 0, relearning: 2, young: 2, mature: 0 }],
        // Forgotten once each: hard, but no leech.
        leeches: [],
        cardsYouKnow: 0,
      });
      // Each answer kept how long it took; today's, to cards met before,
      // the day each was due.
      await app.statistics.expectAnswersTimed({ answers, reviewed: cards });
    },
  );

  await app.step("11 · The deck's page lists the two cards forgotten as its hardest", async () => {
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.openDeck(deck);
    await app.deckDetail.expectHardestCards([
      { lapses: 1, reviews: 1 },
      { lapses: 1, reviews: 1 },
    ]);
  });

  await app.step("12 · Reload: the deck list's counts still agree", async () => {
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.chrome.reload();
    await app.decks.expectDoneForToday(deck);
    await app.decks.expectAnsweredToday(cards);
  });
});
