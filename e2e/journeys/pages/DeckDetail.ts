// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/**
 * A deck's own page (from its row in Decks): its name and description,
 * Preferences and Browser, what is due today and Study, and, for a copy
 * of a library release the library has a newer one of, the offer to
 * update it. The description is shown in the app's language when the
 * deck has one in it.
 */
export class DeckDetail extends Screen {
  /** The deck's description, labeled "Description". */
  get description(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("group", { name: this.t("deckAbout.description"), exact: true });
  }

  async expectDeck(name: string): Promise<void> {
    await expect(this.page.getByRole("heading", { name, exact: true, level: 2 })).toBeVisible();
  }

  /** Follows "Browser" to the deck's cards. */
  async openBrowser(): Promise<void> {
    await this.intent("Open the deck's Browser", async () => {
      await this.page
        .getByRole("main")
        .getByRole("link", { name: this.t("deckDetail.browseButton"), exact: true })
        .click();
      await expect(
        this.page.getByRole("heading", { name: this.tp("browser.heading") }),
      ).toBeVisible();
    });
  }

  /** Starts today's session with the page's Study button. */
  async study(): Promise<void> {
    await this.intent("Study the deck from its page", async () => {
      await this.page
        .getByRole("main")
        .getByRole("button", { name: this.t("deckDetail.studyButton"), exact: true })
        .click();
      await expect(
        this.page.getByRole("heading", { name: this.tp("study.heading") }),
      ).toBeVisible();
    });
  }

  /** No card is due today, and `count` new are left to introduce within today's budget. */
  async expectNewToIntroduce(count: number): Promise<void> {
    await expect(this.page.getByRole("main")).toContainText(
      this.t("deckDetail.newOnly", { count }),
    );
  }

  /** Nothing is left to study today, and `studied` cards were studied today. */
  async expectAllStudied(studied: number): Promise<void> {
    await expect(this.page.getByRole("main")).toContainText(this.t("deckDetail.allStudied"));
    await expect(this.page.getByRole("main")).toContainText(
      this.t("deckDetail.studiedToday", {
        studied: this.t("common.cardCount", { count: studied }),
      }),
    );
  }

  /**
   * No card was studied today: the page says of none that it was, and
   * offers no reset. The text stays while a reset is under way (its
   * button then reads "Resetting…"), so this waits for the reset to end.
   */
  async expectNothingStudiedToday(): Promise<void> {
    await expect(
      this.page.getByRole("main").getByText(this.tp("deckDetail.studiedToday")),
    ).toHaveCount(0);
    await expect(this.resetButton).toBeHidden();
  }

  private get resetButton(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("button", { name: this.t("deckDetail.resetButton"), exact: true });
  }

  /**
   * "Reset today's study" of the deck named `name`, confirming that the
   * `studied` cards studied today go back to how they were: then the
   * page offers no reset, as nothing is studied today any more.
   */
  async resetDay(name: string, studied: number): Promise<void> {
    await this.intent(`Reset today's study of ${name}`, async () => {
      this.app.expectDialog(
        this.tp("deckDetail.resetConfirm", {
          title: name,
          studied: this.t("common.cardCount", { count: studied }),
        }),
      );
      await this.resetButton.click();
      await this.expectNothingStudiedToday();
    });
  }

  /** "{n} cards in this deck." */
  async expectCardCount(count: number): Promise<void> {
    await expect(this.page.getByRole("main")).toContainText(
      this.t("deckDetail.cardsInDeck", { cards: this.t("common.cardCount", { count }) }),
    );
  }

  /**
   * "Hardest cards", under what is hard in the deck: one for each of
   * `forgotten`, in order, the card's front a link to its page, then how
   * often it was forgotten of its reviews, none of them a leech yet.
   * Which card each is is not said: the queue that made them is shuffled.
   */
  async expectHardestCards(forgotten: { lapses: number; reviews: number }[]): Promise<void> {
    await this.intent("Check the deck's hardest cards", async () => {
      const list = this.page
        .getByRole("main")
        .getByRole("list", { name: this.t("statistics.hardest"), exact: true });
      await expect(list.getByRole("listitem")).toHaveText(
        forgotten.map(({ lapses, reviews }) => {
          const share = this.t("statistics.recallShare", {
            percent: this.percent(lapses, reviews),
            count: reviews,
          });
          const text = this.t("statistics.forgottenTimes", { count: lapses, share });
          return new RegExp(`^.+ ${escapeRegExp(text)}$`);
        }),
      );
      for (const item of await list.getByRole("listitem").all())
        await expect(item.getByRole("link")).toHaveCount(1);
    });
  }

  /**
   * "Most-confused options", under what is hard in the deck: the wrong
   * options chosen in its course questions, each a link to its card.
   */
  async expectConfusedOptions(): Promise<void> {
    await this.intent("Check the deck's most-confused options", async () => {
      const list = this.page
        .getByRole("main")
        .getByRole("list", { name: this.t("statistics.confusions"), exact: true });
      await expect(list.getByRole("listitem").first()).toBeVisible();
      for (const item of await list.getByRole("listitem").all())
        await expect(item.getByRole("link")).toHaveCount(1);
    });
  }

  /** The description reads `text`, exactly. */
  async expectDescription(text: string): Promise<void> {
    await this.intent("Check the deck's description", () =>
      expect(this.description).toHaveText(text),
    );
  }

  /** The offer of a newer library release ("Newer library release"). */
  private get upgradeOffer(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("region", { name: this.t("libraryUpgradeNotice.region"), exact: true });
  }

  /**
   * The page offers the library's newer release of the copy: which
   * release it came from and which is out, what updating changes
   * (`changes`, as the offer words it) and keeps (`kept`), and the notes
   * of each release after `from`, in order.
   */
  async expectUpgradeOffer(offer: {
    deck: string;
    from: number;
    to: number;
    changes: string;
    kept: string;
    notes: string[];
  }): Promise<void> {
    await this.intent(`Read the offer of release ${offer.to}`, async () => {
      await expect(this.upgradeOffer).toContainText(
        `${this.t("libraryUpgradeNotice.heading")} ${this.t("libraryUpgradeNotice.body", {
          deck: offer.deck,
          from: offer.from,
          to: offer.to,
          changes: offer.changes,
        })} ${offer.kept}`,
      );
      await expect(this.upgradeOffer.getByRole("listitem")).toHaveText(
        offer.notes.map((notes, at) =>
          this.t("libraryUpgradeNotice.releaseNote", { version: offer.from + 1 + at, notes }),
        ),
      );
    });
  }

  /** "Update to release {to}": the offer goes once the deck is updated, which the page says. */
  async upgrade(to: number): Promise<void> {
    await this.intent(`Update the deck to release ${to}`, async () => {
      await this.upgradeOffer
        .getByRole("button", { name: this.t("libraryUpgradeNotice.update", { version: to }) })
        .click();
      await expect(
        this.page
          .getByRole("main")
          .getByRole("status")
          .filter({
            hasText: this.t("libraryUpgrade.updated", { version: to }),
          }),
      ).toBeVisible();
      await expect(this.upgradeOffer).toBeHidden();
    });
  }

  /** The page offers no newer release: the copy is of the library's newest. */
  async expectNoUpgradeOffer(): Promise<void> {
    await expect(this.upgradeOffer).toBeHidden();
  }

  /** Nothing left to study today, `studied` cards studied today, so no Study button. */
  async expectDoneForToday(studied: number): Promise<void> {
    const main = this.page.getByRole("main");
    await expect(main.getByText(this.t("deckDetail.allStudied"), { exact: true })).toBeVisible();
    await expect(
      main.getByText(
        this.t("deckDetail.studiedToday", {
          studied: this.t("common.cardCount", { count: studied }),
        }),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      main.getByRole("button", { name: this.t("deckDetail.studyButton"), exact: true }),
    ).toBeHidden();
  }
}
