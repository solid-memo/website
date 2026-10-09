import { test } from "../fixtures.ts";

/**
 * Solid Memo Studio in Solid Memo's page (docs/studio.md): a visitor
 * opens the Studio's old address, /studio/, which lands on the Studio's
 * landing page at #/studio, and logs in there: the identity provider
 * sends them back to the Studio. From there they go back to Solid Memo,
 * still logged in, create an instance, make two decks, one with two
 * cards studied once, and open the instance in the Studio from the
 * instance bar: the same page and the same session, so no second
 * login. They see the
 * instance's decks in its table. In the card workbench they find a card
 * by its back (accents aside), sort the cards and select them with the
 * keyboard, the URL holding the view; they replace a word in the
 * selected cards, checking the preview first, then retire both cards and
 * undo that. They inspect one card, give it two wrong options (saved as
 * each is added), retire one and delete the other, then forget its
 * progress on its schedule tab. Back in the workbench they set the other
 * card due today, which Home then counts as due, and move it, with its
 * progress, to the other deck, where Home then counts it. From Home they open a
 * deck's about screen and name its author and licence. On the Groups screen they group
 * the two decks, as Solid Memo's deck list would; back on Home, the
 * table shows the group, filters and sorts by what the URL says, gives
 * both decks a pace and moves them back to the top level at once, and
 * deletes one of them, once the user confirms. They rename the instance
 * and describe its catalogue, under a licence, then pick it, by its new
 * name, from the picker, and go back to Solid Memo, still logged in,
 * which lists the deck that is left.
 */
test("open the Studio from Solid Memo and manage an instance's decks @studio", async ({ app, account, runId }) => {
  const instance = `Studio ${runId}`;
  const alpha = `Alpha ${runId}`;
  const beta = `Beta ${runId}`;
  const group = `Pair ${runId}`;
  const renamed = `Renamed ${runId}`;

  await app.step("01 · Visit the Studio's old address: the Studio's landing page", () => app.studio.visitOldAddress());
  await app.step("02 · Log in from the Studio's landing page: back in the Studio", async () => {
    await app.onboarding.logInWithWebId(account.webId);
    await app.cssLogin.logIn(account);
    await app.cssLogin.authorize(account.webId);
    await app.onboarding.continueConnected(account.pod);
    await app.studio.expectBackAfterLogin();
  });
  await app.step("03 · Go back to Solid Memo, still logged in, and create an instance", async () => {
    await app.studio.backToInstanceCreator();
    await app.instanceCreator.create(instance);
    await app.chrome.expectLoggedInAs(account.webId);
  });
  await app.step("04 · Create two decks, one with two cards, and study those", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(alpha);
    await app.decks.openDeckCreator();
    await app.deckCreator.create(beta);
    await app.deckBrowser.openFor(alpha);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards([["Sun", "Sol"], ["Moon", "Måne"]], { front: "en", back: "sv" });
    await app.cardCreator.back();
    await app.chrome.breadcrumb("breadcrumbs.decks");
    // Five new cards a day: both are studied, and due again tomorrow.
    await app.decks.study(alpha);
    await app.study.studyAll({ grade: "good" });
    await app.study.endSession();
  });

  await app.step("05 · Open the instance in Solid Memo Studio: no second login", () => app.studio.openFromApp());
  await app.step("06 · See the instance's decks", async () => {
    await app.studio.expectDeck(instance, alpha, { cards: 2, due: 0 });
    await app.studio.expectDeck(instance, beta, { cards: 0, due: 0 });
  });

  await app.step("07 · Find, sort and select a deck's cards in the workbench", async () => {
    await app.studio.openCards(instance, alpha, ["Sun", "Moon"]);
    await app.studio.searchCards(alpha, "mane", ["Moon"]);
    await app.studio.clearCardSearch(alpha, ["Sun", "Moon"]);
    await app.studio.sortCardsBy(alpha, "front", ["Moon", "Sun"]);
    await app.studio.selectCardsWithKeys(alpha, 2);
  });

  await app.step("08 · Find and replace in the selected cards, then retire them and undo it", async () => {
    await app.studio.findAndReplace("Sol", "Solen", 1);
    await app.studio.expectBack(alpha, "Sun", "Solen");
    await app.studio.retireSelectedCards(alpha, ["Moon", "Sun"]);
    await app.studio.undoCardEdit(alpha, ["Moon", "Sun"]);
  });

  await app.step("09 · Inspect a card: add two wrong options, retire one and delete the other", async () => {
    await app.studio.openCard(alpha, "Moon");
    await app.studio.openWrongOptions(0);
    await app.studio.addWrongOption("Stjärna", "En stjärna lyser själv.");
    await app.studio.addWrongOption("Jord", "Jorden är en planet.");
    await app.studio.retireWrongOption("Stjärna");
    await app.studio.deleteWrongOption("Jord");
  });

  await app.step("10 · Forget the card's progress on its schedule tab", async () => {
    await app.studio.openSchedule();
    await app.studio.forgetProgress();
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectDeck(instance, alpha, { cards: 2, due: 0 });
  });

  await app.step("11 · Set the other card due today in the workbench: Home counts it due", async () => {
    await app.studio.openCards(instance, alpha, ["Sun", "Moon"]);
    await app.studio.selectCardsWithKeys(alpha, 2);
    await app.studio.rescheduleSelectedToday(1);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectDeck(instance, alpha, { cards: 2, due: 1 });
  });

  await app.step("12 · Move the card due today to the other deck, with its progress: Home counts it there", async () => {
    await app.studio.openCards(instance, alpha, ["Sun", "Moon"]);
    await app.studio.selectCardsWithKeys(alpha, 1);
    await app.studio.moveSelectedCards(alpha, beta, 1, ["Moon"]);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectDeck(instance, alpha, { cards: 1, due: 0 });
    await app.studio.expectDeck(instance, beta, { cards: 1, due: 1 });
  });

  await app.step("13 · Name a deck's author and licence on its about screen", async () => {
    await app.studio.openAbout(instance, beta);
    await app.studio.setAuthorAndLicence("Ada Lovelace", "CC BY 4.0");
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("14 · Group the two decks on the Groups screen", async () => {
    await app.studio.openGroups();
    await app.groups.groupWithNeighbour(alpha);
    await app.groups.nameGroup(group);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectDeck(instance, alpha, { cards: 1, due: 0, group });
    await app.studio.expectDeck(instance, beta, { cards: 1, due: 1, group });
  });

  await app.step("15 · Filter the decks, then sort them by name", async () => {
    await app.studio.filter(instance, "beta", [beta]);
    await app.studio.filter(instance, runId, [alpha, beta]);
    await app.studio.sortBy(instance, "title", [alpha, beta]);
  });

  await app.step("16 · Give both decks a pace and move them to the top level", async () => {
    await app.studio.select([alpha, beta]);
    await app.studio.setNewCardsPerDay(7, 2);
    await app.studio.moveToTopLevel(2);
    await app.studio.expectDeck(instance, alpha, { cards: 1, due: 0, newCardsPerDay: "7" });
    await app.studio.expectDeck(instance, beta, { cards: 1, due: 1, newCardsPerDay: "7" });
  });

  await app.step("17 · Delete one deck, confirming", async () => {
    await app.studio.clearSelection();
    await app.studio.select([beta]);
    await app.studio.deleteSelected(instance, [beta]);
    await app.studio.expectDeck(instance, alpha, { cards: 1, due: 0 });
  });

  await app.step("18 · Rename the instance and describe its catalogue", async () => {
    await app.studio.openInstance(instance);
    await app.studio.renameInstance(renamed);
    await app.studio.describeCatalog("Decks for the Studio journey.", "CC0 1.0");
  });

  await app.step("19 · Pick the instance, by its new name, from the instance picker", async () => {
    await app.studio.pickInstance(renamed);
    await app.studio.expectDeck(renamed, alpha, { cards: 1, due: 0 });
  });

  await app.step("20 · Go back to Solid Memo, still logged in", async () => {
    await app.studio.backToApp();
    await app.chrome.expectLoggedInAs(account.webId);
    await app.decks.expectDeck(alpha);
  });
});
