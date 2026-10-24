// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * A library deck's name in each language the app speaks, as the library
 * index has it (decks/index.ttl): the app shows the one in its language.
 */
export interface LibraryTitle {
  en: string;
  sv: string;
}

/** The library deck whose description is in both English and Swedish. */
export const BRIGHTEST_STARS: LibraryTitle = {
  en: "Brightest stars of the night sky",
  sv: "Natthimlens ljusaste stjärnor",
};

/**
 * The deck library: ready-made decks, reached from Decks, each opened by
 * its name, checked by its checkbox and imported with "Import N decks".
 */
export class Library extends Screen {
  get heading(): Locator {
    return this.page.getByRole("heading", { name: this.t("library.heading"), level: 2 });
  }

  /** The deck's name in the list; it links to the deck's page. */
  deckLink(title: string): Locator {
    return this.page.getByRole("main").getByRole("link", { name: title, exact: true });
  }

  /**
   * From Decks, the link "Deck library" under the list: the last one, as
   * the strip of courses has one too while every deck is a course.
   */
  async open(): Promise<void> {
    await this.intent("Open the deck library", async () => {
      await this.page
        .getByRole("main")
        .getByRole("link", { name: this.t("deckList.libraryLink"), exact: true })
        .last()
        .click();
      await this.expectOpen();
    });
  }

  async expectOpen(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await this.app.chrome.expectBreadcrumbHere("breadcrumbs.library");
  }

  /** Reached from a link to a deck the library does not have: the library, saying so. */
  async expectFromUnknownLink(): Promise<void> {
    await this.intent("Check the library says the link's deck is not in it", async () => {
      await this.expectOpen();
      await expect(this.page.getByRole("main")).toContainText(this.t("workspace.triedUnknown"));
    });
  }

  async expectDeck(title: string): Promise<void> {
    await this.intent(`Check the library has ${title}`, async () => {
      await expect(this.deckLink(title)).toBeVisible();
    });
  }

  /** The decks the list shows, by name, in its order. */
  async shownDecks(): Promise<string[]> {
    return this.page.getByRole("main").locator(".library-deck-name").allInnerTexts();
  }

  /** A box of "Card languages", by the language's name in the app's language. */
  private cardLanguage(name: string): Locator {
    return this.page
      .getByRole("group", { name: this.t("library.cardLanguages"), exact: true })
      .getByRole("checkbox", { name, exact: true });
  }

  /** Checks a language under "Card languages": the list keeps the decks with cards in it. */
  async checkCardLanguage(name: string): Promise<void> {
    await this.intent(`Check the card language ${name}`, async () => {
      await this.cardLanguage(name).check();
      await expect(this.cardLanguage(name)).toBeChecked();
    });
  }

  /** Unchecks a language under "Card languages". */
  async uncheckCardLanguage(name: string): Promise<void> {
    await this.intent(`Uncheck the card language ${name}`, async () => {
      await this.cardLanguage(name).uncheck();
      await expect(this.cardLanguage(name)).not.toBeChecked();
    });
  }

  async expectCardLanguageChecked(name: string): Promise<void> {
    await this.intent(`Check ${name} is still checked under the card languages`, async () => {
      await expect(this.cardLanguage(name)).toBeChecked();
    });
  }

  /** The languages a deck's row names beside its size: `names`, in the deck's order. */
  async expectRowLanguages(title: string, names: string[]): Promise<void> {
    await this.intent(`Check the row of ${title} names its card languages`, async () => {
      const row = this.page
        .getByRole("main")
        .getByRole("listitem")
        .filter({ has: this.page.getByRole("link", { name: title, exact: true }) });
      await expect(row).toContainText(names.join(", "));
    });
  }

  /** Opens a deck's page (LibraryDeck) by its name. */
  async openDeck(title: string): Promise<void> {
    await this.intent(`Open the library deck ${title}`, async () => {
      await this.deckLink(title).click();
      await this.app.libraryDeck.expectOpen(title);
    });
  }

  /** Checks a deck; the import button then counts it. */
  async select(title: string): Promise<void> {
    await this.intent(`Check ${title}`, async () => {
      const box = this.page.getByRole("checkbox", { name: title, exact: true });
      await box.check();
      await expect(box).toBeChecked();
    });
  }

  /**
   * "Import N decks": imports the checked decks, which must be `titles`
   * exactly; the app goes back to Decks, where each now is.
   */
  async importSelected(titles: string[]): Promise<void> {
    await this.intent(`Import ${titles.length} deck(s)`, async () => {
      const button = this.page.getByRole("button", {
        name: this.t("library.importDecks", { count: titles.length }),
        exact: true,
      });
      await button.click();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
      for (const title of titles) await this.app.decks.expectDeck(title);
    });
  }
}
