// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * "Something went wrong", in place of a screen that failed while it
 * rendered (docs/privacy.md, When something goes wrong): under the
 * masthead and above the footer, which still work, with Try again, Go to
 * the start, Copy details and Report it. A journey makes a screen fail
 * by swapping the Studio's code for code that throws (`breakStudio`), as
 * a bug in it would.
 */
export class SomethingWentWrong extends Screen {
  private get heading(): Locator {
    return this.page.getByRole("heading", { level: 2, name: this.t("crash.title") });
  }

  /**
   * Has the browser get, for the Studio's code (its chunk of the build),
   * a module whose workspace throws `message` whenever it renders, with
   * no messages of its own. The module is fixed code that reads the
   * message from the page, so none of it is built from the message.
   */
  async breakStudio(message: string): Promise<void> {
    await this.intent("Break the Studio's code", async () => {
      await this.page.evaluate((text) => {
        (globalThis as { studioError?: string }).studioError = text;
      }, message);
      await this.page.route("**/assets/StudioWorkspace-*.js", (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: [
            "export function StudioWorkspace() { throw new Error(globalThis.studioError); }",
            "const none = async () => ({ default: {} });",
            "export const STUDIO_CATALOGS = { en: {}, others: { sv: none, ko: none, de: none, es: none, fr: none } };",
          ].join("\n"),
        }),
      );
    });
  }

  /** The screen, its heading focused, under the masthead (named `app`, linking home) and above the footer. */
  async expectShown(app: string): Promise<void> {
    await this.intent("See that something went wrong", async () => {
      await expect(this.heading).toBeVisible();
      await expect(this.heading).toBeFocused();
      await expect(this.page.getByRole("main")).toContainText(this.t("crash.explain"));
      await expect(
        this.page.getByRole("banner").getByRole("link", { name: app, exact: true }),
      ).toBeVisible();
      await expect(
        this.page
          .getByRole("contentinfo")
          .getByRole("link", { name: new RegExp(this.t("footer.reportIssue")) }),
      ).toBeVisible();
    });
  }

  /** Copy details, which says it copied them: what the clipboard then holds. */
  async copyDetails(): Promise<string> {
    return this.intent("Copy the details", async () => {
      await this.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await this.page.getByRole("button", { name: this.t("crash.copy"), exact: true }).click();
      await expect(
        this.page.getByRole("status").filter({ hasText: this.t("crash.copied") }),
      ).toBeVisible();
      return this.page.evaluate(() => navigator.clipboard.readText());
    });
  }

  /** Where Report it leads, without following it there: the bug form, filled in. */
  async reportLink(): Promise<URL> {
    return this.intent("Read where Report it leads", async () => {
      const href = await this.page
        .getByRole("link", { name: new RegExp(this.t("crash.report")) })
        .getAttribute("href");
      return new URL(href!);
    });
  }

  async tryAgain(): Promise<void> {
    await this.intent("Try again", async () => {
      await this.page.getByRole("button", { name: this.t("crash.tryAgain"), exact: true }).click();
    });
  }

  async goToStart(): Promise<void> {
    await this.intent("Go to the start", async () => {
      await this.page.getByRole("button", { name: this.t("crash.start"), exact: true }).click();
      // Not the URL: the start, #/, is replaced at once by where it leads.
      await expect(this.heading).toBeHidden();
    });
  }
}
