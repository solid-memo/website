import { expect } from "@playwright/test";
import { chooseLanguage } from "./languages.ts";
import { Screen } from "./Screen.ts";

export interface CardLanguages {
  /** The front's language tag; left as the creator offers it when not given. */
  front?: string;
  back?: string;
}

/**
 * "New card": adds cards to a deck one after another. The first card of
 * a fresh deck may need its languages stated; later ones start in the
 * languages the last card had.
 */
export class CardCreator extends Screen {
  /** Adds a card; "Card added." and the emptied front tell it took. */
  async addCard(front: string, back: string, languages: CardLanguages = { front: "en", back: "en" }): Promise<void> {
    await this.intent(`Add the card ${front} → ${back}`, async () => {
      const frontField = this.page.locator("#card-front");
      await frontField.fill(front);
      await this.page.locator("#card-back").fill(back);
      if (languages.front !== undefined) await chooseLanguage(this.app, this.page.locator("#card-front-language-0"), languages.front);
      if (languages.back !== undefined) await chooseLanguage(this.app, this.page.locator("#card-back-language-0"), languages.back);
      await this.page.getByRole("main").getByRole("button", { name: this.t("addCardForm.submitButton"), exact: true }).click();
      await expect(frontField).toHaveValue("");
      await expect(this.page.getByRole("status").filter({ hasText: this.t("addCardForm.added") })).toBeVisible();
    });
  }

  /**
   * Adds a card written in Markdown: "Format with Markdown" ticked, the
   * sides typed in their textareas, line breaks and all, and the code
   * block the front holds seen in the preview (open, on a wide screen)
   * before adding. The next card starts as plain text again.
   */
  async addMarkdownCard(front: string, back: string, code: string, languages: CardLanguages = { front: "en", back: "en" }): Promise<void> {
    await this.intent("Add a card in Markdown with a code block", async () => {
      const toggle = this.page.getByRole("checkbox", { name: this.t("cardContentFields.markdown"), exact: true });
      await expect(toggle).not.toBeChecked();
      await toggle.check();
      const frontField = this.page.getByRole("textbox", { name: this.t("cardContentFields.front"), exact: true });
      await expect(frontField).toHaveJSProperty("tagName", "TEXTAREA");
      await frontField.fill(front);
      await this.page.getByRole("textbox", { name: this.t("cardContentFields.back"), exact: true }).fill(back);
      if (languages.front !== undefined) await chooseLanguage(this.app, this.page.locator("#card-front-language-0"), languages.front);
      if (languages.back !== undefined) await chooseLanguage(this.app, this.page.locator("#card-back-language-0"), languages.back);
      await expect(this.app.cardEditor.previewCode).toHaveText(code);
      await this.page.getByRole("main").getByRole("button", { name: this.t("addCardForm.submitButton"), exact: true }).click();
      await expect(frontField).toHaveValue("");
      await expect(this.page.getByRole("status").filter({ hasText: this.t("addCardForm.added") })).toBeVisible();
      await expect(toggle).not.toBeChecked();
    });
  }

  /** Adds each card in turn. */
  async addCards(cards: readonly (readonly [string, string])[], languages?: CardLanguages): Promise<void> {
    for (const [front, back] of cards) await this.addCard(front, back, languages);
  }

  /** "Back" to the deck's Browser. */
  async back(): Promise<void> {
    await this.intent("Go back to the Browser", async () => {
      await this.page.getByRole("main").getByRole("link", { name: this.t("cardCreator.backButton"), exact: true }).click();
      await expect(this.page.getByRole("heading", { name: this.tp("browser.heading") })).toBeVisible();
    });
  }
}
