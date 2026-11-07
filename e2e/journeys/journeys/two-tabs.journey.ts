// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";

/** A logout reaches the browser's other tabs, each of which holds its own token. */
test("logging out in one tab logs out another", async ({ app, account, runId, newTab }) => {
  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit(), { screen: "onboarding" });
  await app.step(
    "02 · Log in with the WebID",
    () => logInAndCreateInstance(app, account, `Tabs ${runId}`),
    { screen: "decks.empty" },
  );
  const second = await newTab();
  await second.step(
    "03 · Open a second tab, which restores the session",
    async () => {
      await second.page.goto("./");
      await second.chrome.expectLoggedInAs(account.webId);
    },
    { screen: "decks.empty" },
  );
  await app.step(
    "04 · Log out in the first tab",
    async () => {
      await app.chrome.logOut();
      await app.onboarding.expectLoggedOut();
    },
    { screen: "onboarding" },
  );
  await second.step(
    "05 · The second tab is logged out, and stays so when reloaded",
    async () => {
      await second.onboarding.expectLoggedOut();
      await second.page.reload();
      await second.onboarding.expectStart();
    },
    { screen: "onboarding" },
  );
});
