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
 * its name, ticked by its checkbox and imported with "Import N decks".
 */
export class Library extends Screen {
  get heading(): Locator {
    return this.page.getByRole("heading", { name: this.t("library.heading"), level: 2 });
  }

  /** The deck's name in the list; it links to the deck's page. */
  deckLink(title: string): Locator {
    return this.page.getByRole("main").getByRole("link", { name: title, exact: true });
  }

  /** From Decks, the link "Deck library". */
  async open(): Promise<void> {
    await this.intent("Open the deck library", async () => {
      await this.page.getByRole("main").getByRole("link", { name: this.t("deckList.libraryLink"), exact: true }).click();
      await this.expectOpen();
    });
  }

  async expectOpen(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await this.app.chrome.expectBreadcrumbHere("breadcrumbs.library");
  }

  async expectDeck(title: string): Promise<void> {
    await this.intent(`Check the library has ${title}`, async () => {
      await expect(this.deckLink(title)).toBeVisible();
    });
  }

  /** Opens a deck's page (LibraryDeck) by its name. */
  async openDeck(title: string): Promise<void> {
    await this.intent(`Open the library deck ${title}`, async () => {
      await this.deckLink(title).click();
      await this.app.libraryDeck.expectOpen(title);
    });
  }

  /** Ticks a deck; the import button then counts it. */
  async select(title: string): Promise<void> {
    await this.intent(`Tick ${title}`, async () => {
      const box = this.page.getByRole("checkbox", { name: title, exact: true });
      await box.check();
      await expect(box).toBeChecked();
    });
  }

  /**
   * "Import N decks": imports the ticked decks, which must be `titles`
   * exactly; the app goes back to Decks, where each now is.
   */
  async importSelected(titles: string[]): Promise<void> {
    await this.intent(`Import ${titles.length} deck(s)`, async () => {
      const button = this.page.getByRole("button", { name: this.t("library.importDecks", { count: titles.length }), exact: true });
      await button.click();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
      for (const title of titles) await this.app.decks.expectDeck(title);
    });
  }
}
