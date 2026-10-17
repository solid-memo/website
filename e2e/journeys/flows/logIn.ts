// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { CssAccount } from "../harness/cssAccount.ts";
import type { App } from "../pages/App.ts";

/**
 * From the landing page to an instance's decks, for a fresh account: log
 * in with the WebID at its identity provider (the Solid server's own login
 * and consent pages), back to the app, and create the instance.
 */
export async function logInAndCreateInstance(
  app: App,
  account: CssAccount,
  instanceName: string,
): Promise<void> {
  await app.onboarding.logInWithWebId(account.webId);
  await app.cssLogin.logIn(account);
  await app.cssLogin.authorize(account.webId);
  await app.onboarding.continueConnected(account.pod);
  await app.instanceCreator.create(instanceName);
  await app.chrome.expectLoggedInAs(account.webId);
}

/** Where a login to an instance the account has starts, and what the Solid server asks. */
export interface ReturningLogin {
  /** The WebID form is shown already, as it is to someone who logged out in this browser. */
  loggedOutHere?: boolean;
  /**
   * The Solid server knows this browser (its session cookie, from a login
   * earlier), so it skips its login and asks only for consent.
   */
  knownToServer?: boolean;
}

/**
 * From the landing page (or the WebID form) to the decks of the instance
 * the account has, `instanceName`: log in with the WebID as above, back
 * to the app, and it opens the instance, the only one, without the
 * instance creator or the picker.
 */
export async function logInToInstance(
  app: App,
  account: CssAccount,
  instanceName: string,
  { loggedOutHere = false, knownToServer = false }: ReturningLogin = {},
): Promise<void> {
  if (loggedOutHere) await app.onboarding.logInAgainWithWebId(account.webId);
  else await app.onboarding.logInWithWebId(account.webId);
  if (!knownToServer) await app.cssLogin.logIn(account);
  await app.cssLogin.authorize(account.webId);
  await app.onboarding.continueConnected(account.pod);
  await app.decks.expectShown();
  await app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
  await app.chrome.expectInstance(instanceName);
  await app.chrome.expectLoggedInAs(account.webId);
}
