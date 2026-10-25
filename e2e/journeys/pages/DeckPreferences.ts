// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * A deck's own preferences (from its page, or a course's from the
 * course's page): here, the language its cards are shown in first,
 * chosen from the languages its cards state, or the app's language, and
 * saved with its own button as the page stays; for a course, its course
 * language, from the languages the course states.
 */
export class DeckPreferences extends Screen {
  private get cardLanguage(): Locator {
    return this.language("cardLanguage");
  }

  /** The language picker, a deck's card language or a course's course language (`words`). */
  private language(words: "cardLanguage" | "courseLanguage"): Locator {
    return this.page
      .getByRole("main")
      .getByRole("combobox", { name: this.t(`deckPreferences.${words}.label`), exact: true });
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

  /**
   * Chooses the language a course is shown in first, its own text as
   * well as its cards, by its tag (null for the app's language), and
   * saves it.
   */
  async chooseCourseLanguage(tag: string | null): Promise<void> {
    await this.intent(
      tag === null
        ? "Show the course in the app's language again"
        : `Show the course in ${tag} first`,
      async () => {
        await this.language("courseLanguage").selectOption(tag ?? "");
        await this.page
          .getByRole("main")
          .getByRole("button", {
            name: this.t("deckPreferences.courseLanguage.save"),
            exact: true,
          })
          .click();
      },
    );
  }

  /**
   * Goes back to the course whose preferences these are, with the
   * browser's Back: the page's heading links to the course's deck.
   */
  async backToCourse(): Promise<void> {
    await this.intent("Go back to the course", async () => {
      await this.page.goBack();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.course");
    });
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
