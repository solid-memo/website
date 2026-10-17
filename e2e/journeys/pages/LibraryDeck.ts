// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * A library deck's own page: its name, its description (from the library
 * index, so it never shows changes made to an imported copy), its facts,
 * "Import this deck", "Preview" and "Copy link". It has no Browser: an
 * imported copy's is on that deck's page under Decks (DeckDetail,
 * DeckBrowser).
 */
export class LibraryDeck extends Screen {
  heading(title: string): Locator {
    return this.page.getByRole("heading", { name: title, exact: true, level: 2 });
  }

  async expectOpen(title: string): Promise<void> {
    await expect(this.heading(title)).toBeVisible();
    await expect(
      this.page
        .getByRole("main")
        .getByRole("button", { name: this.t("libraryDeck.import"), exact: true }),
    ).toBeVisible();
  }

  /**
   * "Copy link": the link to the deck that names no instance, read back
   * from the clipboard, which the browser is let to use for it.
   */
  async copyLink(): Promise<string> {
    return this.intent("Copy the deck's link", async () => {
      await this.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await this.page
        .getByRole("main")
        .getByRole("button", { name: this.t("libraryDeck.copyLink"), exact: true })
        .click();
      await expect(this.page.getByRole("main")).toContainText(this.t("libraryDeck.linkCopied"));
      return this.page.evaluate(() => navigator.clipboard.readText());
    });
  }

  /**
   * Opens a link to a library deck (`#/try`) in a browser where no one is
   * logged in: no landing page, but the deck's page, in a guest's study,
   * in place of the link, so Back leaves the app rather than returning to
   * the link, which would go on to the deck again.
   */
  async followLink(link: string, title: string): Promise<void> {
    await this.intent(`Follow the link to ${title}`, async () => {
      await this.page.goto(link);
      await this.expectOpen(title);
      await this.app.chrome.expectGuest();
      await expect(this.page).toHaveURL(/#\/library-deck\?/);
      // The browser was opened for the link: before it, there is only the blank page.
      await this.page.goBack();
      await expect(this.page).toHaveURL("about:blank");
      await this.page.goForward();
      await this.expectOpen(title);
    });
  }

  /** "Import this deck": its copy goes into the instance, and the deck list shows it. */
  async import(title: string): Promise<void> {
    await this.intent(`Import ${title} from its page`, async () => {
      await this.page
        .getByRole("main")
        .getByRole("button", { name: this.t("libraryDeck.import"), exact: true })
        .click();
      await this.app.decks.expectDeck(title);
    });
  }

  /** "Preview": the deck's cards, one at a time, before importing it. */
  async openPreview(title: string): Promise<void> {
    await this.intent(`Preview ${title}`, async () => {
      await this.page
        .getByRole("main")
        .getByRole("link", { name: this.t("libraryDeck.preview"), exact: true })
        .click();
      await expect(
        this.page.getByRole("heading", { name: this.t("libraryPreview.heading", { deck: title }) }),
      ).toBeVisible();
    });
  }
}
