import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * A library deck's own page: its name, its description (from the library
 * index, so it never shows changes made to an imported copy), its facts,
 * "Import this deck" and "Preview". It has no Browser: an imported copy's
 * is on that deck's page under Decks (DeckDetail, DeckBrowser).
 */
export class LibraryDeck extends Screen {
  heading(title: string): Locator {
    return this.page.getByRole("heading", { name: title, exact: true, level: 2 });
  }

  async expectOpen(title: string): Promise<void> {
    await expect(this.heading(title)).toBeVisible();
    await expect(this.page.getByRole("main").getByRole("button", { name: this.t("libraryDeck.import"), exact: true })).toBeVisible();
  }

  /** "Preview": the deck's cards, one at a time, before importing it. */
  async openPreview(title: string): Promise<void> {
    await this.intent(`Preview ${title}`, async () => {
      await this.page.getByRole("main").getByRole("link", { name: this.t("libraryDeck.preview"), exact: true }).click();
      await expect(this.page.getByRole("heading", { name: this.t("libraryPreview.heading", { deck: title }) })).toBeVisible();
    });
  }
}
