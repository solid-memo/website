import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * A deck's own page (from its row in Decks): its name and description,
 * Preferences and Browser, what is due today and Study. The description
 * is shown in the app's language when the deck has one in it.
 */
export class DeckDetail extends Screen {
  /** The deck's description, labelled "Description". */
  get description(): Locator {
    return this.page.getByRole("main").getByRole("group", { name: this.t("deckAbout.description"), exact: true });
  }

  async expectDeck(name: string): Promise<void> {
    await expect(this.page.getByRole("heading", { name, exact: true, level: 2 })).toBeVisible();
  }

  /** Follows "Browser" to the deck's cards. */
  async openBrowser(): Promise<void> {
    await this.intent("Open the deck's Browser", async () => {
      await this.page.getByRole("main").getByRole("link", { name: this.t("deckDetail.browseButton"), exact: true }).click();
      await expect(this.page.getByRole("heading", { name: this.tp("browser.heading") })).toBeVisible();
    });
  }

  /** Starts today's session with the page's Study button. */
  async study(): Promise<void> {
    await this.intent("Study the deck from its page", async () => {
      await this.page.getByRole("main").getByRole("button", { name: this.t("deckDetail.studyButton"), exact: true }).click();
      await expect(this.page.getByRole("heading", { name: this.tp("study.heading") })).toBeVisible();
    });
  }

  /** "{n} cards in this deck." */
  async expectCardCount(count: number): Promise<void> {
    await expect(this.page.getByRole("main")).toContainText(
      this.t("deckDetail.cardsInDeck", { cards: this.t("common.cardCount", { count }) }),
    );
  }

  /** The description reads `text`, exactly. */
  async expectDescription(text: string): Promise<void> {
    await this.intent("Check the deck's description", () => expect(this.description).toHaveText(text));
  }
}
