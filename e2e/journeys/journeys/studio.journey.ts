import { test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";
import type { App } from "../pages/App.ts";
import type { CssAccount } from "../harness/cssAccount.ts";

/**
 * Solid Memo Studio beside Solid Memo, on one origin (docs/studio.md): a
 * learner with a deck opens the Studio, logs in to it at the Solid server
 * (the session is Solid Memo's, which restores only there), sees the
 * instance's decks in its table, picks the instance again from the
 * picker, and goes back to Solid Memo, which takes a login of its own
 * again (docs/authentication.md).
 */
test("log in to the Studio and see an instance's decks @studio", async ({ app, account, runId }) => {
  const instance = `Studio ${runId}`;
  const deck = `Deck ${runId}`;

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in with a WebID", () => logInAndCreateInstance(app, account, instance));
  await app.step("03 · Create a deck", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(deck);
  });

  await app.step("04 · Open Solid Memo Studio: its own login", () => app.studio.visit());
  await app.step("05 · Log in to the Studio with the WebID", () => logInAgain(app, account));
  await app.step("06 · See the instance's decks", () => app.studio.expectDeck(instance, deck, { cards: 0, due: 0 }));
  await app.step("07 · Pick the instance from the instance picker", async () => {
    await app.studio.pickInstance(instance);
    await app.studio.expectDeck(instance, deck, { cards: 0, due: 0 });
  });

  await app.step("08 · Go back to Solid Memo and log in to it again", async () => {
    await app.studio.backToApp();
    await logInAgain(app, account);
    await app.decks.expectDeck(deck);
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
