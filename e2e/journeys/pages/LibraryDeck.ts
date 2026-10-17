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
   * "Copy link": the link to the deck that names no instance, as the app
   * wrote it to the clipboard. Only Chromium lets a page read the
   * clipboard back, or needs a permission to write it, so the link is
   * taken from the app's call to write it, in every engine alike.
   */
  async copyLink(): Promise<string> {
    return this.intent("Copy the deck's link", async () => {
      if (this.page.context().browser()?.browserType().name() === "chromium")
        await this.page.context().grantPermissions(["clipboard-write"]);
      await this.page.evaluate(() => {
        const write = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = (text) => {
          document.documentElement.dataset.copied = text;
          return write(text);
        };
      });
      await this.page
        .getByRole("main")
        .getByRole("button", { name: this.t("libraryDeck.copyLink"), exact: true })
        .click();
      await expect(this.page.getByRole("main")).toContainText(this.t("libraryDeck.linkCopied"));
      return this.page.evaluate(() => document.documentElement.dataset.copied ?? "");
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
      // The page the link was followed from; not the browser's blank
      // first page, which Firefox drops from the history.
      const from = new URL("robots.txt", link).href;
      await this.page.goto(from);
      await this.page.goto(link);
      await this.expectOpen(title);
      await this.app.chrome.expectGuest();
      await expect(this.page).toHaveURL(/#\/library-deck\?/);
      await this.page.goBack();
      await expect(this.page).toHaveURL(from);
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
