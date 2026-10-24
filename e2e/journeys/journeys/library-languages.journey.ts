// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, test } from "../fixtures.ts";
import { BRIGHTEST_STARS } from "../pages/Library.ts";

/** The one library deck whose cards are in Japanese (decks/index.ttl). */
const JAPANESE_BASICS = "Basic Japanese";

/**
 * The deck library narrowed to the language of the cards
 * (docs/deck-library.md, In the app): a guest checks Japanese under
 * "Card languages" and finds only the deck whose cards are in it, its
 * row naming its languages; its page names them too, and back in the
 * library the language is still checked, until it is unchecked.
 *
 * What it catches: the index's dcterms:language not read, or read into
 * names the browser cannot give (an EU language IRI with no tag), and a
 * filter lost on the way to a deck's page and back.
 */
test("the deck library narrowed to the language of the cards", async ({ app }) => {
  await app.step("01 · Visit Solid Memo and try it as a guest", async () => {
    await app.onboarding.visit();
    await app.onboarding.tryAsGuest();
  });

  await app.step("02 · In the deck library, check Japanese: only its deck is left", async () => {
    await app.library.open();
    await app.library.expectDeck(BRIGHTEST_STARS.en);
    await app.library.expectRowLanguages(BRIGHTEST_STARS.en, ["English", "Swedish"]);
    await app.library.checkCardLanguage("Japanese");
    await expect.poll(() => app.library.shownDecks()).toEqual([JAPANESE_BASICS]);
    await app.library.expectRowLanguages(JAPANESE_BASICS, ["Japanese", "English", "Swedish"]);
  });

  await app.step("03 · Its page names the languages of its cards", async () => {
    await app.library.openDeck(JAPANESE_BASICS);
    await app.libraryDeck.expectCardLanguages(["Japanese", "English", "Swedish", "Korean"]);
  });

  await app.step("04 · Back in the library, Japanese is still checked; uncheck it", async () => {
    await app.chrome.breadcrumb("breadcrumbs.library");
    await app.library.expectCardLanguageChecked("Japanese");
    await expect.poll(() => app.library.shownDecks()).toEqual([JAPANESE_BASICS]);
    await app.library.uncheckCardLanguage("Japanese");
    await app.library.expectDeck(BRIGHTEST_STARS.en);
  });
});
