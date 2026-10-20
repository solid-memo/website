// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, test } from "../fixtures.ts";
import { BRIGHTEST_STARS } from "../pages/Library.ts";

/**
 * A library deck shared by its link (docs/routing.md, A link to a
 * library deck): a guest copies a deck's link from its page, and
 * someone opens it in a browser of their own, where no one has used
 * Solid Memo: they land on the deck's page as a guest, at once, import
 * it and study a card. A link to a deck the library does not have opens
 * the library, which says so.
 *
 * What it catches: a copied link that names the sharer's instance, which
 * no one else can open (a guest's exists only in their browser); the
 * landing page shown instead of a guest's study started; and the link
 * left in the history, or not followed on to the deck's page once the
 * guest's instance is made. The other engines follow the link; importing,
 * studying and the unknown link are checked in Chromium.
 */
test("a library deck shared by its link @guest", async ({ app, newDevice }) => {
  const stars = BRIGHTEST_STARS.en;
  let link = "";

  await app.step("01 · Visit Solid Memo and try it as a guest", async () => {
    await app.onboarding.visit();
    await app.onboarding.tryAsGuest();
  });

  await app.step("02 · Copy a library deck's link from its page", async () => {
    await app.library.open();
    await app.library.openDeck(stars);
    link = await app.libraryDeck.copyLink();
    expect(new URL(link).hash).toMatch(/^#\/try\?deck=[^&]+$/);
  });

  const friend = await newDevice();

  await friend.step("03 · In a browser of their own, follow the link: the deck, as a guest", () =>
    friend.libraryDeck.followLink(link, stars),
  );

  // Importing and studying are the app's logic, which the guest journey
  // goes through in every engine: Chromium checks them here.
  await friend.step(
    "04 · Import it and study a card",
    async () => {
      await friend.libraryDeck.import(stars);
      await friend.decks.study(stars);
      await friend.study.expectStudying(stars);
      await friend.study.answer("good");
      await friend.study.endSession();
      await friend.decks.expectAnsweredToday(1);
    },
    { in: ["chromium"] },
  );

  await friend.step(
    "05 · Follow a link to a deck the library does not have",
    async () => {
      const url = new URL(link);
      url.hash = `#/try?deck=${encodeURIComponent(new URL("decks/index.ttl#no-such-deck", url).href)}`;
      await friend.page.goto(url.href);
      await friend.library.expectFromUnknownLink();
    },
    { in: ["chromium"] },
  );
});
