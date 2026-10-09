import { test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";
import type { App } from "../pages/App.ts";
import type { CssAccount } from "../harness/cssAccount.ts";

/**
 * Solid Memo Studio beside Solid Memo, on one origin (docs/studio.md): a
 * learner with two decks, one with two cards, opens the instance in the
 * Studio from Solid Memo's instance bar, logs in to it at the Solid server
 * (the session is Solid Memo's, which restores only there), and sees the
 * instance's decks in its table. In the card workbench they find a card
 * by its back (accents aside), sort the cards and select them with the
 * keyboard, the URL holding the view. On the Groups screen they group
 * the two decks, as Solid Memo's deck list would; back on Home, the
 * table shows the group, filters and sorts by what the URL says, gives
 * both decks a pace and moves them back to the top level at once, and
 * deletes one of them, once the user confirms. They pick the instance
 * again from the picker, and go back to Solid Memo, which takes a login
 * of its own again (docs/authentication.md) and lists the deck that is
 * left.
 */
test("log in to the Studio and manage an instance's decks @studio", async ({ app, account, runId }) => {
  const instance = `Studio ${runId}`;
  const alpha = `Alpha ${runId}`;
  const beta = `Beta ${runId}`;
  const group = `Pair ${runId}`;

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in with a WebID", () => logInAndCreateInstance(app, account, instance));
  await app.step("03 · Create two decks, one with two cards", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(alpha);
    await app.decks.openDeckCreator();
    await app.deckCreator.create(beta);
    await app.deckBrowser.openFor(alpha);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addCards([["Sun", "Sol"], ["Moon", "Måne"]], { front: "en", back: "sv" });
    await app.cardCreator.back();
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("04 · Open the instance in Solid Memo Studio: its own login", () => app.studio.openFromApp());
  await app.step("05 · Log in to the Studio with the WebID", () => logInAgain(app, account));
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
    await app.chrome.breadcrumb("breadcrumbs.decks");
  });

  await app.step("08 · Group the two decks on the Groups screen", async () => {
    await app.studio.openGroups();
    await app.groups.groupWithNeighbour(alpha);
    await app.groups.nameGroup(group);
    await app.chrome.breadcrumb("breadcrumbs.decks");
    await app.studio.expectDeck(instance, alpha, { cards: 2, due: 0, group });
    await app.studio.expectDeck(instance, beta, { cards: 0, due: 0, group });
  });

  await app.step("09 · Filter the decks, then sort them by name", async () => {
    await app.studio.filter(instance, "beta", [beta]);
    await app.studio.filter(instance, runId, [alpha, beta]);
    await app.studio.sortBy(instance, "title", [alpha, beta]);
  });

  await app.step("10 · Give both decks a pace and move them to the top level", async () => {
    await app.studio.select([alpha, beta]);
    await app.studio.setNewCardsPerDay(7, 2);
    await app.studio.moveToTopLevel(2);
    await app.studio.expectDeck(instance, alpha, { cards: 2, due: 0, newCardsPerDay: "7" });
    await app.studio.expectDeck(instance, beta, { cards: 0, due: 0, newCardsPerDay: "7" });
  });

  await app.step("11 · Delete one deck, confirming", async () => {
    await app.studio.clearSelection();
    await app.studio.select([beta]);
    await app.studio.deleteSelected(instance, [beta]);
    await app.studio.expectDeck(instance, alpha, { cards: 2, due: 0 });
  });

  await app.step("12 · Pick the instance from the instance picker", async () => {
    await app.studio.pickInstance(instance);
    await app.studio.expectDeck(instance, alpha, { cards: 2, due: 0 });
  });

  await app.step("13 · Go back to Solid Memo and log in to it again", async () => {
    await app.studio.backToApp();
    await logInAgain(app, account);
    await app.decks.expectDeck(alpha);
  });
});

/**
 * Logs in from the landing page, as a user already logged in at the Solid
 * server: it asks only to let the app (Solid Memo, or the Studio) use the Pod.
 */
async function logInAgain(app: App, account: CssAccount): Promise<void> {
  await app.onboarding.logInWithWebId(account.webId);
  await app.cssLogin.authorize(account.webId);
  await app.onboarding.continueConnected(account.pod);
  await app.chrome.expectLoggedInAs(account.webId);
}
