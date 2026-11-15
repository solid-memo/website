// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/** A deck's description in the languages the app speaks. */
export interface Description {
  en: string;
  sv: string;
}

/**
 * A deck's "Browser: {deck}": its cards in a table, the "Add card" link
 * (to the card creator; the creator's own submit is a button of the same
 * name), the deck's "About this deck" with "Describe deck", and its study
 * direction. Describing a deck edits one text per language: the one in
 * the app's language is the main field (#deck-description), the others
 * translations (#deck-description-1, …), there only for languages the
 * deck already has a description in.
 */
export class DeckBrowser extends Screen {
  /** From Decks: opens the deck named `name`, then its Browser. */
  async openFor(name: string): Promise<void> {
    await this.intent(`Open the Browser of ${name}`, async () => {
      await this.app.decks.openDeck(name);
      await this.app.deckDetail.openBrowser();
      await this.expectDeck(name);
    });
  }

  async expectDeck(name: string): Promise<void> {
    await expect(
      this.page.getByRole("heading", { name: this.t("browser.heading", { deck: name }) }),
    ).toBeVisible();
  }

  /** "About this deck", where "Describe deck" is. */
  get about(): Locator {
    return this.page.getByRole("region", { name: this.t("deckAbout.label") });
  }

  get describeButton(): Locator {
    return this.about.getByRole("button", {
      name: this.t("deckAbout.describeButton"),
      exact: true,
    });
  }

  /**
   * "Describe deck", the English and the Swedish text replaced, "Save
   * description"; "About this deck" then shows the new English text. The
   * app must speak English, and the deck have a Swedish description
   * already (checked first: the field is there only then).
   */
  async describe(text: Description): Promise<void> {
    await this.intent("Describe the deck in English and Swedish", async () => {
      expect(this.app.locale, "the main field is in the app's language").toBe("en");
      await this.describeButton.click();
      const form = this.page.getByRole("form", { name: this.t("deckAbout.label") });
      const english = form.locator("#deck-description");
      // The deck's other languages follow the main field in no set order: the Swedish one is found by its language.
      const swedish = form.locator('textarea[id^="deck-description-"][lang="sv"]');
      await expect(english).toBeVisible();
      await expect(
        swedish,
        "the Swedish description: only a deck that has one shows it",
      ).toHaveAttribute("lang", "sv");
      await english.fill(text.en);
      await swedish.fill(text.sv);
      await form.getByRole("button", { name: this.t("deckAbout.saveButton"), exact: true }).click();
      await expect(this.about.getByText(text.en, { exact: true })).toBeVisible();
      await expect(this.describeButton).toBeEnabled();
    });
  }

  /** The cards' rows (the table's header left out). */
  get cardRows(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("table")
      .getByRole("row")
      .filter({ has: this.page.getByRole("cell") });
  }

  /** Follows the header's "Add card" link to the card creator. */
  async openCardCreator(): Promise<void> {
    await this.intent("Open the card creator", async () => {
      await this.page
        .getByRole("main")
        .getByRole("link", { name: this.t("browser.addCardButton"), exact: true })
        .click();
      await expect(
        this.page.getByRole("heading", { name: this.t("cardCreator.heading") }),
      ).toBeVisible();
    });
  }

  /** The row of the card whose front is `front` shows `back`, in its language. */
  async expectBack(front: string, back: string, lang?: string): Promise<void> {
    const cell = this.cardRows
      .filter({ hasText: front })
      .getByRole("cell")
      .filter({ hasText: back });
    await expect(cell).toHaveCount(1);
    if (lang !== undefined) await expect(cell.locator(`[lang="${lang}"]`)).toHaveCount(1);
  }

  /**
   * Removes the card whose front is `front` with its row's button, saying
   * yes to the browser's question: the status line says so, the focus is
   * on the link of the card now in its row (the last row, if it was
   * last), and the table lists exactly the fronts `left`, at least one.
   */
  async removeCard(front: string, left: readonly string[]): Promise<void> {
    await this.intent(`Remove the card ${front} from the Browser`, async () => {
      this.app.expectDialog(this.tp("browser.removeConfirm", { card: front }));
      const table = this.page.getByRole("main").getByRole("table");
      const row = await this.cardRows.evaluateAll(
        (rows, text) => rows.findIndex((tr) => tr.querySelector("a")?.textContent?.includes(text)),
        front,
      );
      expect(row, `${front}'s row`).toBeGreaterThanOrEqual(0);
      await table
        .getByRole("button", {
          name: this.t("browser.removeCardLabel", { card: front }),
          exact: true,
        })
        .click();
      await expect(
        this.page
          .getByRole("status")
          .filter({ hasText: this.t("browser.removed", { card: front }) }),
      ).toHaveCount(1);
      await expect(
        this.cardRows
          .nth(Math.min(row, left.length - 1))
          .getByRole("link")
          .first(),
        "the card now in the removed card's row",
      ).toBeFocused();
      await this.expectFronts(left);
    });
  }

  /** The table lists exactly these fronts (in any order). */
  async expectFronts(fronts: readonly string[]): Promise<void> {
    await expect(this.cardRows).toHaveCount(fronts.length);
    for (const front of fronts)
      await expect(this.cardRows.filter({ hasText: front })).toHaveCount(1);
  }
}
