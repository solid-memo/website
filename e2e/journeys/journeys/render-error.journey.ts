// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, test } from "../fixtures.ts";

/**
 * A screen fails while it renders (docs/privacy.md, When something goes
 * wrong): a guest opens the Studio, whose code throws, as a bug in it
 * would. "Something went wrong" takes the screen's place under the
 * masthead; its details copy without the address in the error, its
 * report link fills in the bug form with them, Try again meets the same
 * error, and Go to the start leads back to the deck list.
 *
 * What it catches: a render error that leaves the page blank (no
 * boundary, or one around the wrong part), details that keep an address,
 * and a way out that does not get out.
 */
test("a screen that fails while it renders gives a way out and a way to report it @error", async ({
  app,
}) => {
  const address = "https://alice.pod.example/solid-memo/main/decks/capitals/index.ttl";
  const studio = app.t("studio.name");
  let details = "";

  await app.step("01 · Visit Solid Memo and try it as a guest", async () => {
    await app.onboarding.visit();
    await app.onboarding.tryAsGuest();
  });

  await app.step("02 · Open the Studio, whose code fails", async () => {
    await app.crash.breakStudio(`Cannot read ${address}`);
    await app.chrome.instanceNav.getByRole("link", { name: app.t("studio.open") }).click();
    await app.crash.expectShown(studio);
  });

  await app.step("03 · Copy the details: no address in them", async () => {
    details = await app.crash.copyDetails();
    expect(details).toMatch(/^Version: \S+/);
    expect(details).toContain("Route: #/studio?instance=\n");
    expect(details).toContain("Error: Error: Cannot read <address>");
    expect(details).not.toContain("pod.example");
  });

  await app.step("04 · Report it: the bug form, filled in with the same details", async () => {
    const report = await app.crash.reportLink();
    expect(report.pathname).toBe("/solid-memo/website/issues/new");
    expect(report.searchParams.get("template")).toBe("bug.yml");
    expect(report.searchParams.get("where")).toBe("#/studio?instance=");
    expect(report.searchParams.get("version")).toMatch(/\S/);
    expect(report.searchParams.get("more")).toBe(`\`\`\`text\n${details}\n\`\`\``);
  });

  await app.step("05 · Try again: the Studio fails again", async () => {
    await app.crash.tryAgain();
    await app.crash.expectShown(studio);
  });

  await app.step("06 · Go to the start: the deck list", async () => {
    await app.crash.goToStart();
    await app.decks.expectShown();
  });
});
