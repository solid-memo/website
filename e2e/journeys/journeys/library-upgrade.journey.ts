// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";
import { BRIGHTEST_STARS } from "../pages/Library.ts";

/**
 * A learner who holds an older release of a library deck, as the
 * journey's spec numbers it: add release 1 of the brightest stars from
 * its link, study it, see release 2 offered in Solid Memo and in the
 * Studio and read what it changes, update the copy, reload, and find the
 * progress kept, Solid Memo and the Studio agreeing that the copy is up
 * to date. A card studied offers to report a mistake in it, the
 * library's deck form filled in with the release and the card, though
 * release 1 names no contact. It catches an offer that never appears, an update that loses
 * the day's study, and the Studio and Solid Memo disagreeing after the
 * update's many writes. How journeys are run, read when they fail and
 * written: docs/testing.md#user-journeys.
 *
 * The library's index offers only a deck's current release, so release
 * 1 is added by its address, which the app reads where the site serves
 * the library (decks/brightest-stars/v1.ttl); its copy names that
 * release, of a series the index lists, so it is a library copy.
 * Release 2 changes no card: it adds the deck's name, description and
 * keywords in Korean, German, Spanish and French, which the German name
 * shows once the copy is updated.
 */
test("a learner updates a library copy @upgrade", async ({ app, account, runId }) => {
  const instance = `Journey ${runId}`;
  const deck = BRIGHTEST_STARS.en;
  const releaseOne = "https://solid-memo.com/decks/brightest-stars/v1.ttl";
  // decks/brightest-stars/v2.ttl: its name in German, its notes, and the
  // offer's words for what a change of name, description and keywords does.
  const german = "Die hellsten Sterne des Nachthimmels";
  const notes =
    "Title, description and keywords in Korean, German, Spanish and French as well, now that the app speaks them; no card was changed.";
  const upgrade = {
    from: 1,
    to: 2,
    changes: app.t("libraryUpgradeNotice.describes"),
    kept: app.t("libraryUpgradeNotice.historyKept"),
    notes: [notes],
  };
  const cards = 52;
  const newPerDay = 3;

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());

  await app.step("02 · Log in with a WebID", () => logInAndCreateInstance(app, account, instance));

  await app.step(`03 · Set new cards per day to ${newPerDay} in Preferences`, async () => {
    await app.preferences.open();
    await app.preferences.setNewCardsPerDay(newPerDay);
    await app.preferences.save();
  });

  await app.step("04 · Add release 1 of a library deck from its link", async () => {
    await app.importUrl.openFromDeckList();
    await app.importUrl.showDeck(releaseOne, deck, { version: 1, notes: "First release." });
    await app.importUrl.importDeck(deck);
    await app.decks.expectToReview(deck, newPerDay);
  });

  await app.step("05 · Study the copy: its new cards for today", async () => {
    await app.statistics.open();
    await app.statistics.expectEmpty();
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.openDeck(deck);
    await app.deckDetail.expectCardCount(cards);
    await app.deckDetail.study();
    await app.study.expectStudying(deck);
    await app.study.expectReportMistake(releaseOne);
    for (let card = 1; card <= newPerDay; card++) await app.study.answer("good");
    await app.study.expectFinished();
    await app.study.endSession();
    await app.decks.expectDoneForToday(deck);
    await app.decks.expectAnsweredToday(newPerDay);
  });

  await app.step("06 · Solid Memo offers release 2 and says what it changes", async () => {
    await app.decks.expectNewRelease(deck);
    await app.decks.openDeck(deck);
    await app.deckDetail.expectUpgradeOffer({ deck, ...upgrade });
    // Release 1 has no German name: in German, the copy keeps its English one.
    await app.chrome.switchLanguage("de");
    await app.deckDetail.expectDeck(deck);
    await app.chrome.switchLanguage("en");
  });

  await app.step("07 · The Studio offers release 2 too, with the same changes", async () => {
    await app.studio.openFromApp();
    await app.studio.followUpdateBadge(instance, deck, upgrade.to);
    await app.studio.readCopyUpgrade(instance, deck, upgrade);
    await app.studio.backToApp();
  });

  await app.step("08 · Update the copy to release 2 from its page", async () => {
    await app.decks.openDeck(deck);
    await app.deckDetail.upgrade(upgrade.to);
  });

  await app.step("09 · Reload: the copy is release 2, its progress kept", async () => {
    await app.chrome.reload();
    await app.deckDetail.expectDeck(deck);
    await app.deckDetail.expectNoUpgradeOffer();
    await app.deckDetail.expectCardCount(cards);
    await app.deckDetail.expectDoneForToday(newPerDay);
    // What release 2 changes: the deck now has a German name.
    await app.chrome.switchLanguage("de");
    await app.deckDetail.expectDeck(german);
    await app.chrome.switchLanguage("en");
    await app.deckDetail.expectDeck(deck);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.decks.expectNewRelease(deck, false);
    await app.decks.expectDoneForToday(deck);
    await app.decks.expectAnsweredToday(newPerDay);
    // The day's answers, from before the update, and where the cards
    // stand: the ones studied young (an interval of a few days), the rest new.
    // Cards the update had started afresh would be new again.
    await app.statistics.open();
    await app.statistics.expectStatistics({
      answers: newPerDay,
      maturity: { new: cards - newPerDay, relearning: 0, young: newPerDay, mature: 0 },
    });
  });

  await app.step(
    "10 · The Studio agrees: the copy is up to date, its cards as before",
    async () => {
      await app.studio.openFromApp();
      await app.studio.expectDeck(instance, deck, { cards, due: 0 });
      await app.studio.expectNoUpdateBadge(instance, deck);
      await app.studio.openLibraryCopies(instance, deck);
      await app.studio.expectCopyUpToDate(instance, deck, upgrade.to);
    },
  );
});
