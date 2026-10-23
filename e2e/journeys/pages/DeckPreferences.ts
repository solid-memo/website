// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * A deck's own preferences (from its page): here, the language its cards
 * are shown in first, chosen from the languages its cards state, or the
 * app's language, and saved with its own button as the page stays.
 */
export class DeckPreferences extends Screen {
  private get cardLanguage(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("combobox", { name: this.t("deckPreferences.cardLanguage.label"), exact: true });
  }

  /**
   * Chooses the language the deck's cards are shown in first, by its tag
   * (null for the app's language), and saves it.
   */
  async chooseCardLanguage(tag: string | null): Promise<void> {
    await this.intent(
      tag === null
        ? "Show the deck's cards in the app's language again"
        : `Show the deck's cards in ${tag} first`,
      async () => {
        await this.cardLanguage.selectOption(tag ?? "");
        await this.page
          .getByRole("main")
          .getByRole("button", { name: this.t("deckPreferences.cardLanguage.save"), exact: true })
          .click();
      },
    );
  }

  /** Follows the deck's name in the heading back to its page. */
  async backToDeck(name: string): Promise<void> {
    await this.intent(`Go back to the deck ${name}`, async () => {
      await this.page
        .getByRole("main")
        .getByRole("heading", { level: 2 })
        .getByRole("link", { name, exact: true })
        .click();
      await expect(this.page.getByRole("heading", { name, exact: true, level: 2 })).toBeVisible();
    });
  }

  /** The deck's card language as the page shows it: a tag, or null for the app's. */
  async expectCardLanguage(tag: string | null): Promise<void> {
    await expect(this.cardLanguage).toHaveValue(tag ?? "");
  }
}
