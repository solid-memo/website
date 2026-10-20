// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect } from "@playwright/test";
import { test } from "../fixtures.ts";
import { logInAndCreateInstance, logInToInstance } from "../flows/logIn.ts";

/**
 * A learner who comes back, as the journey's spec numbers it: log in,
 * choose the dark theme and save the preferences, choose High contrast
 * and Larger text, kept on the device through a reload, log out and log back
 * in, the form refusing an http WebID first, then log in on a second
 * device (a browser context of its own), refusing Solid Memo the Pod at
 * the Solid server's consent first. How journeys are run, read when they
 * fail and written: docs/testing.md#user-journeys.
 *
 * It catches what a second login meets and a first does not: the Solid
 * server's session cookie, which skips its login page (consent is asked
 * again, each login registering Solid Memo afresh), and an account that
 * has an instance, which the app must find and open, not offer to create.
 * The theme is kept in the pod's preferences once they are saved
 * (docs/theme.md), so the second device, which starts in the browser's
 * light theme, turns dark when the instance opens.
 */
test("a returning learner @returning", async ({ app, account, runId, newDevice }) => {
  const instance = `Journey ${runId}`;
  const httpWebId = account.webId.replace(/^https:/, "http:");

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());

  await app.step("02 · Log in with a WebID", () => logInAndCreateInstance(app, account, instance));

  await app.step("03 · Switch to the dark theme", () => app.chrome.switchTheme("dark"));

  await app.step("04 · Save the study preferences, which keeps the theme in the Pod", async () => {
    await app.preferences.open();
    await app.preferences.expectTheme("dark");
    await app.preferences.save();
  });

  await app.step(
    "05 · Choose High contrast and Larger text, which this device keeps through a reload",
    async () => {
      await app.preferences.open();
      await app.preferences.setPalette("high-contrast");
      await app.preferences.setTextSize("larger");
      await app.chrome.reload();
      await app.preferences.expectPalette("high-contrast");
      await app.preferences.expectTextSize("larger");
      // Back to Decks, where the next login opens.
      await app.preferences.save();
    },
  );

  await app.step("06 · Log out", async () => {
    await app.chrome.logOut();
    await app.onboarding.expectLoggedOut();
  });

  await app.step("07 · Log in with the WebID over http, which is refused", () =>
    app.onboarding.submitRefusedWebId(httpWebId, "webIdNotHttps"),
  );

  await app.step(
    "08 · Log in with the WebID: the Solid server asks only for consent, and the instance opens",
    async () => {
      await logInToInstance(app, account, instance, { loggedOutHere: true, knownToServer: true });
      await app.chrome.expectTheme("dark");
    },
  );

  const device = await newDevice();

  await device.step("09 · On a second device, visit Solid Memo", async () => {
    await device.onboarding.visit();
    await device.chrome.expectTheme("light");
    // The colors and the text size are the first device's alone, until the pod keeps them too.
    await expect(device.page.locator("html")).not.toHaveAttribute("data-palette");
    await expect(device.page.locator("html")).not.toHaveAttribute("data-text-size");
  });

  await device.step("10 · Log in with the WebID and refuse Solid Memo the Pod", async () => {
    await device.onboarding.logInWithWebId(account.webId);
    await device.cssLogin.logIn(account);
    await device.cssLogin.refuse(account.webId);
    // Back where it started, nobody logged in.
    await device.onboarding.expectStart();
  });

  await device.step(
    "11 · Log in again and let Solid Memo use the Pod: the instance opens, in the dark theme",
    async () => {
      await logInToInstance(device, account, instance, { knownToServer: true });
      await device.chrome.expectTheme("dark");
      await device.preferences.open();
      await device.preferences.expectTheme("dark");
    },
  );
});
