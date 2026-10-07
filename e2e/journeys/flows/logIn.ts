import type { CssAccount } from "../harness/cssAccount.ts";
import type { App } from "../pages/App.ts";

/**
 * From the landing page to an instance's decks, for a fresh account: log
 * in with the WebID at its identity provider (the Solid server's own login
 * and consent pages), back to the app, and create the instance.
 */
export async function logInAndCreateInstance(app: App, account: CssAccount, instanceName: string): Promise<void> {
  await app.onboarding.logInWithWebId(account.webId);
  await app.cssLogin.logIn(account);
  await app.cssLogin.authorize(account.webId);
  await app.onboarding.continueConnected(account.pod);
  await app.instanceCreator.create(instanceName);
  await app.chrome.expectLoggedInAs(account.webId);
}
