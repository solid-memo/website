// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect } from "@playwright/test";
import { test } from "../fixtures.ts";
import { logInAndCreateInstance, logInToInstance } from "../flows/logIn.ts";

/**
 * A learner who comes back, as the journey's spec numbers it: log in,
 * choose the dark theme and save the preferences, choose High contrast
 * and Larger text, kept through a reload, log out and log back
 * in, the form refusing an http WebID first, then log in on a second
 * device (a browser context of its own), refusing Solid Memo the Pod at
 * the Solid server's consent first. How journeys are run, read when they
 * fail and written: docs/testing.md#user-journeys.
 *
 * It catches what a second login meets and a first does not: the Solid
 * server's session cookie, which skips its login page (consent is asked
 * again, each login registering Solid Memo afresh), and an account that
 * has an instance, which the app must find and open, not offer to create.
 * The theme, the colors and the text size are kept in the pod's
 * preferences once they are saved (docs/theme.md), so the second device,
 * which starts in the browser's light theme, the standard colors and the
 * browser's text size, takes on the first device's when the instance
 * opens. There the learner designs a palette of their own, warned of a
 * pair with too little contrast and using it anyway; a third device
 * finds it in the pod, and resets the colors to Standard.
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
    "05 · Choose High contrast and Larger text, which the Pod keeps, through a reload",
    async () => {
      await app.preferences.open();
      await app.preferences.setPalette("high-contrast");
      await app.preferences.setTextSize("larger");
      // Saved once both are written; back to Decks, where the next login opens.
      await app.preferences.save();
      await app.chrome.reload();
      await app.preferences.open();
      await app.preferences.expectPalette("high-contrast");
      await app.preferences.expectTextSize("larger");
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
    // Nothing on this device yet: the colors and the text size come with the instance.
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
    "11 · Log in again and let Solid Memo use the Pod: the instance opens, in the dark theme, High contrast and Larger text",
    async () => {
      await logInToInstance(device, account, instance, { knownToServer: true });
      await device.chrome.expectTheme("dark");
      await device.preferences.open();
      await device.preferences.expectTheme("dark");
      await device.preferences.expectPalette("high-contrast");
      await device.preferences.expectTextSize("larger");
    },
  );

  await device.step(
    "12 · Design a palette of one's own: its faint muted text is warned of, used anyway, and the page painted in it",
    async () => {
      await device.paletteEditor.openNew();
      await device.paletteEditor.name("Evening");
      await device.paletteEditor.setColor("dark", "textMuted", "#4a5058");
      await device.paletteEditor.expectTooLittleContrast("dark");
      await device.paletteEditor.saveAnyway();
      await device.preferences.expectOwnPalette("Evening", EVENING);
    },
  );

  const third = await newDevice();

  await third.step(
    "13 · On a third device, log in: the palette of one's own comes from the Pod",
    async () => {
      await third.onboarding.visit();
      await logInToInstance(third, account, instance);
      await third.chrome.expectTheme("dark");
      await third.preferences.open();
      await third.preferences.expectOwnPalette("Evening", EVENING);
    },
  );

  await third.step("14 · Reset the colors to Standard, which the Pod keeps", async () => {
    await third.preferences.resetColors();
    // Saved once the choice is written; back to Decks.
    await third.preferences.save();
    await third.chrome.reload();
    await third.preferences.open();
    await third.preferences.expectPalette("standard");
  });
});

/** The palette of one's own step 12 designs: Standard, its muted text in the dark theme fainter. */
const EVENING = { basedOn: "standard", role: "--text-muted", color: "#4a5058" } as const;
