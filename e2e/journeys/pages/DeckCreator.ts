import { expect } from "@playwright/test";
import { chooseLanguage } from "./languages.ts";
import { Screen } from "./Screen.ts";

/**
 * "New deck": a name and the language it is in. The language picker
 * starts on the last deck language used (remembered in the browser), or
 * on none.
 */
export class DeckCreator extends Screen {
  /** Names the deck, says its language (`tag`, "en" unless told) and creates it; back on Decks it is listed. */
  async create(name: string, language = "en"): Promise<void> {
    await this.intent(`Create the deck ${name}`, async () => {
      await expect(this.page.getByRole("heading", { name: this.t("deckCreator.heading") })).toBeVisible();
      await this.page.locator("#deck-name").fill(name);
      await chooseLanguage(this.app, this.page.locator("#deck-name-language-0"), language);
      await this.page.getByRole("button", { name: this.t("deckCreator.createButton"), exact: true }).click();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
      await this.app.decks.expectDeck(name);
    });
  }
}
