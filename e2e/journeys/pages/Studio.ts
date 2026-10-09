import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/**
 * Solid Memo Studio, at studio/ of the same site (docs/studio.md): its
 * landing page (the same login as Solid Memo's, under the Studio's name),
 * its instance picker, Home's table of decks (its filter, sort and bulk
 * actions), its Groups screen, the card workbench (its search, sort,
 * selection and bulk edits, with their Undo), and its way back to Solid Memo.
 */
export class Studio extends Screen {
  /** Home's table of the instance's decks ("The decks of {instance}"). */
  decks(instance: string): Locator {
    return this.page.getByRole("table", { name: this.t("studio.decks.caption", { instance }) });
  }

  /**
   * Follows Solid Memo's "Open in Studio" in the instance bar. The Studio
   * shows its landing page, unless the session was logged in from the Studio.
   */
  async openFromApp(): Promise<void> {
    await this.intent("Open Solid Memo Studio from Solid Memo", async () => {
      await this.app.chrome.instanceNav.getByRole("link", { name: this.t("studio.open") }).click();
      await expect(this.page).toHaveURL(/\/studio\/#\/\?instance=/);
      await expect(this.page.getByRole("heading", { level: 1, name: this.t("studio.name") })).toBeVisible();
      await expect(this.page.getByRole("button", { name: this.t("onboardingFlow.havePod") })).toBeVisible();
    });
  }

  /** The deck's row in the instance's table. */
  row(instance: string, deck: string): Locator {
    return this.decks(instance).getByRole("row").filter({ has: this.page.getByRole("rowheader", { name: deck, exact: true }) });
  }

  /**
   * Home lists the deck, in the instance's table: its name, the groups
   * it is in, what is due today and its cards (the row's cells after its
   * checkbox: group, direction, pace twice, due, new, last changed, cards).
   */
  async expectDeck(
    instance: string,
    deck: string,
    figures: { cards: number; due: number; group?: string; newCardsPerDay?: string },
  ): Promise<void> {
    await this.intent(`See ${deck} in the Studio`, async () => {
      await expect(this.page.getByRole("heading", { name: this.t("studio.decks.heading"), level: 2 })).toBeVisible();
      const cells = this.row(instance, deck).getByRole("cell");
      await expect(cells.nth(1)).toHaveText(figures.group ?? this.t("studio.decks.topLevel"));
      if (figures.newCardsPerDay !== undefined) await expect(cells.nth(3)).toHaveText(figures.newCardsPerDay);
      await expect(cells.nth(5)).toHaveText(String(figures.due));
      await expect(cells.nth(8)).toContainText(String(figures.cards));
    });
  }

  /** Follows Home's link to the Groups screen, which arranges the decks as Solid Memo's list does (app.groups). */
  async openGroups(): Promise<void> {
    await this.intent("Open the Groups screen", async () => {
      await this.page.getByRole("link", { name: this.t("studio.decks.groupsLink") }).click();
      await expect(this.page.getByRole("heading", { name: this.t("studio.groups.heading"), level: 2 })).toBeVisible();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.groups");
    });
  }

  /** Filters Home's table: only the decks named still show, and the URL holds the filter. */
  async filter(instance: string, text: string, shown: string[]): Promise<void> {
    await this.intent(`Filter the decks by ${text}`, async () => {
      await this.page.getByRole("searchbox", { name: this.t("studio.decks.filter") }).fill(text);
      await expect(this.page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(text)}`));
      await expect(this.decks(instance).getByRole("rowheader")).toHaveText(shown);
    });
  }

  /** Sorts Home's table by a column (as its header names it), which says so; the URL holds the sort. */
  async sortBy(instance: string, column: string, order: string[]): Promise<void> {
    await this.intent(`Sort the decks by ${column}`, async () => {
      // Named by its column, then the sort's arrow; the checkboxes' column names "deck" too.
      const name = new RegExp(`^${escapeRegExp(this.t(`studio.decks.${column}`))}`);
      const header = this.decks(instance).getByRole("columnheader", { name });
      await header.getByRole("button").click();
      await expect(header).toHaveAttribute("aria-sort", "ascending");
      await expect(this.page).toHaveURL(new RegExp(`[?&]sort=${column}`));
      await expect(this.decks(instance).getByRole("rowheader")).toHaveText(order);
    });
  }

  /** Ticks the decks' checkboxes in Home's table. */
  async select(decks: string[]): Promise<void> {
    await this.intent(`Select ${decks.join(", ")}`, async () => {
      for (const deck of decks) {
        await this.page.getByRole("checkbox", { name: this.t("studio.decks.selectDeck", { deck }), exact: true }).check();
      }
      await expect(this.bulk.getByText(this.t("studio.bulk.selected", { count: decks.length }))).toBeVisible();
    });
  }

  /** Clears the selection: the bulk actions go. */
  async clearSelection(): Promise<void> {
    await this.intent("Clear the selection", async () => {
      await this.bulk.getByRole("button", { name: this.t("studio.bulk.clear") }).click();
      await expect(this.bulk).toHaveCount(0);
    });
  }

  /** Gives the selected decks their own number of new cards per day. */
  async setNewCardsPerDay(count: number, decks: number): Promise<void> {
    await this.intent(`Set the selected decks' new cards per day to ${count}`, async () => {
      await this.bulk.getByRole("button", { name: this.t("studio.bulk.pace"), exact: true }).click();
      await this.bulk.getByRole("spinbutton", { name: this.t("studio.bulk.newCardsPerDay") }).fill(String(count));
      await this.bulk.getByRole("button", { name: this.t("studio.bulk.apply") }).click();
      await this.expectStatus(this.t("studio.bulk.paced", { count: decks }));
    });
  }

  /** Moves the selected decks out of their groups, to the top level. */
  async moveToTopLevel(decks: number): Promise<void> {
    await this.intent("Move the selected decks to the top level", async () => {
      await this.bulk.getByRole("button", { name: this.t("studio.bulk.move"), exact: true }).click();
      await this.bulk.getByRole("combobox", { name: this.t("studio.bulk.group") }).selectOption("");
      await this.bulk.getByRole("button", { name: this.t("studio.bulk.apply") }).click();
      await this.expectStatus(this.t("studio.bulk.moved", { count: decks, group: this.t("studio.bulk.topLevel") }));
    });
  }

  /** Deletes the selected decks, confirming the question that names them; their rows go. */
  async deleteSelected(instance: string, decks: string[]): Promise<void> {
    await this.intent(`Delete ${decks.join(", ")}`, async () => {
      const names = decks.map((deck) => `“${deck}”`).join(", ");
      this.app.expectDialog(this.tp("studio.bulk.removeConfirm", { count: decks.length, names }));
      await this.bulk.getByRole("button", { name: this.t("studio.bulk.remove"), exact: true }).click();
      await this.expectStatus(this.t("studio.bulk.removed", { count: decks.length }));
      for (const deck of decks) await expect(this.row(instance, deck)).toHaveCount(0);
    });
  }

  /** The card workbench's table of a deck's cards ("The cards of {deck}"). */
  cards(deck: string): Locator {
    return this.page.getByRole("table", { name: this.t("studio.cards.caption", { deck }) });
  }

  /** Follows the deck's number of cards on Home to its cards in the workbench, which lists their fronts. */
  async openCards(instance: string, deck: string, fronts: string[]): Promise<void> {
    await this.intent(`Open the cards of ${deck}`, async () => {
      const name = new RegExp(escapeRegExp(this.t("studio.decks.cardsOf", { deck })));
      await this.row(instance, deck).getByRole("link", { name }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: this.t("studio.cards.heading", { deck }) })).toBeVisible();
      await expect(this.page).toHaveURL(/#\/cards\?deck=/);
      await expect(this.cards(deck).getByRole("rowheader")).toHaveText(fronts);
    });
  }

  /** Searches the deck's cards: only the fronts named still show, and the URL holds the search. */
  async searchCards(deck: string, text: string, fronts: string[]): Promise<void> {
    await this.intent(`Search the cards for ${text}`, async () => {
      await this.page.getByRole("searchbox", { name: this.t("studio.cards.search") }).fill(text);
      await expect(this.page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(text)}`));
      await expect(this.cards(deck).getByRole("rowheader")).toHaveText(fronts);
    });
  }

  /** Empties the search: every card shows again, and the URL holds no search. */
  async clearCardSearch(deck: string, fronts: string[]): Promise<void> {
    await this.intent("Clear the search", async () => {
      await this.page.getByRole("searchbox", { name: this.t("studio.cards.search") }).fill("");
      await expect(this.page).not.toHaveURL(/[?&]q=/);
      await expect(this.cards(deck).getByRole("rowheader")).toHaveText(fronts);
    });
  }

  /** Sorts the deck's cards by a column (its key, as the header names it), which says so; the URL holds the sort. */
  async sortCardsBy(deck: string, column: string, fronts: string[]): Promise<void> {
    await this.intent(`Sort the cards by ${column}`, async () => {
      // Named by its column, then the sort's arrow.
      const name = new RegExp(`^${escapeRegExp(this.t(`studio.cards.column.${column}`))}`);
      const header = this.cards(deck).getByRole("columnheader", { name });
      await header.getByRole("button").click();
      await expect(header).toHaveAttribute("aria-sort", "ascending");
      await expect(this.page).toHaveURL(new RegExp(`[?&]sort=${column}`));
      await expect(this.cards(deck).getByRole("rowheader")).toHaveText(fronts);
    });
  }

  /**
   * Selects the first `count` cards with the keyboard, as the screen's
   * hint says: j goes to the first row from wherever the focus is, x
   * selects it and j moves on. The status line counts them.
   */
  async selectCardsWithKeys(deck: string, count: number): Promise<void> {
    await this.intent(`Select ${count} cards with the keyboard`, async () => {
      await expect(this.page.getByText(this.t("studio.cards.keys", { j: "j", k: "k", x: "x", enter: "Enter" }))).toBeVisible();
      await this.page.keyboard.press("j");
      await expect(this.cards(deck).getByRole("rowheader").first().getByRole("link")).toBeFocused();
      for (let index = 0; index < count; index++) {
        await this.page.keyboard.press("x");
        await this.page.keyboard.press("j");
      }
      await this.expectStatus(this.t("studio.cards.selected", { count }));
    });
  }

  /**
   * Finds and replaces in the selected cards: the preview shows the text
   * before and after, and the status line says how many cards changed
   * once the user confirms.
   */
  async findAndReplace(find: string, replace: string, changes: number): Promise<void> {
    await this.intent(`Replace ${find} with ${replace} in the selected cards`, async () => {
      await this.cardBulk.getByRole("button", { name: this.t("studio.cardBulk.findReplace") }).click();
      const form = this.page.getByRole("form", { name: this.t("studio.cardBulk.findReplace") });
      await form.getByRole("textbox", { name: this.t("studio.cardBulk.find") }).fill(find);
      await form.getByRole("textbox", { name: this.t("studio.cardBulk.replaceWith") }).fill(replace);
      const preview = form.getByRole("region", { name: this.t("studio.cardBulk.preview") });
      await expect(preview.getByText(this.t("studio.cardBulk.changes", { count: changes }))).toBeVisible();
      await expect(preview.locator("del").first()).toHaveText(find);
      await expect(preview.locator("ins").first()).toHaveText(replace);
      await form.getByRole("button", { name: this.t("studio.cardBulk.confirmReplace", { count: changes }) }).click();
      await this.expectStatus(this.t("studio.cardBulk.done.replaceText", { count: changes }));
    });
  }

  /** The workbench shows the card of this front with this back. */
  async expectBack(deck: string, front: string, back: string): Promise<void> {
    await this.intent(`See ${front}'s back as ${back}`, async () => {
      const row = this.cards(deck).getByRole("row").filter({ has: this.page.getByRole("rowheader", { name: front, exact: true }) });
      await expect(row.getByRole("cell").nth(1)).toHaveText(back);
    });
  }

  /** Retires the selected cards: they say so in the table. */
  async retireSelectedCards(deck: string, fronts: string[]): Promise<void> {
    await this.intent(`Retire ${fronts.join(", ")}`, async () => {
      await this.cardBulk.getByRole("button", { name: this.t("studio.cardBulk.retire") }).click();
      await this.expectStatus(this.t("studio.cardBulk.done.retire", { count: fronts.length }));
      const tag = this.t("retiredCards.tag");
      for (const front of fronts) {
        await expect(this.cards(deck).getByRole("rowheader").filter({ hasText: front }).filter({ hasText: tag })).toHaveCount(1);
      }
    });
  }

  /** Undoes the last edit of the cards: the cards are as they were, the fronts named in use again. */
  async undoCardEdit(deck: string, fronts: string[]): Promise<void> {
    await this.intent("Undo the last edit of the cards", async () => {
      await this.page.getByRole("button", { name: this.t("studio.cardBulk.undo") }).click();
      await this.expectStatus(this.t("studio.cardBulk.undone"));
      for (const front of fronts) {
        await expect(this.cards(deck).getByRole("rowheader", { name: front, exact: true })).toBeVisible();
      }
    });
  }

  /** What can be done with the selected cards. */
  private get cardBulk(): Locator {
    return this.page.getByRole("group", { name: this.t("studio.cardBulk.label") });
  }

  /** What can be done with the selected decks. */
  private get bulk(): Locator {
    return this.page.getByRole("group", { name: this.t("studio.bulk.label") });
  }

  /** Home's status line (visually hidden) says this. */
  private async expectStatus(message: string): Promise<void> {
    await expect(this.page.getByRole("status").filter({ hasText: message })).toHaveCount(1);
  }

  /** Follows the trail to the instance picker and opens the instance named. */
  async pickInstance(name: string): Promise<void> {
    await this.intent(`Pick the instance ${name}`, async () => {
      await this.app.chrome.breadcrumb("breadcrumbs.instances");
      await expect(this.page.getByRole("heading", { name: this.t("instancePicker.heading") })).toBeVisible();
      await this.page.getByRole("main").getByRole("button", { name, exact: true }).click();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
    });
  }

  /**
   * Follows the header's link back to Solid Memo. The session is the
   * Studio's now, which restores only in the Studio, so Solid Memo opens
   * on its landing page, to log in to.
   */
  async backToApp(): Promise<void> {
    await this.intent("Go back to Solid Memo", async () => {
      await this.page.getByRole("banner").getByRole("link", { name: this.t("studio.backToApp") }).click();
      await expect(this.page.getByRole("heading", { level: 1, name: this.t("app.documentTitle") })).toBeVisible();
      await expect(this.page.getByRole("button", { name: this.t("onboardingFlow.havePod") })).toBeVisible();
    });
  }
}
