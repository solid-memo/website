import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/**
 * Solid Memo Studio, in Solid Memo's page at #/studio (docs/studio.md):
 * its old address, its landing page (the same login as Solid Memo's,
 * under the Studio's name, which comes back to the Studio),
 * its instance picker, Home's table of decks (its filter, sort and bulk
 * actions), its Groups screen, the card workbench (its search, sort,
 * selection and bulk edits, with their Undo, its edits of review
 * states, and its moves to another deck), the card inspector (a card's content, its wrong options and
 * its schedule), a deck's about screen (its
 * authors and licence), the instance's name and catalogue, and its way
 * back to Solid Memo.
 */
export class Studio extends Screen {
  /** Home's table of the instance's decks ("The decks of {instance}"). */
  decks(instance: string): Locator {
    return this.page.getByRole("table", { name: this.t("studio.decks.caption", { instance }) });
  }

  /**
   * Visits the Studio's old address, /studio/, which sends the visitor on
   * to the Studio in Solid Memo's page: its landing page, before anyone is
   * logged in.
   */
  async visitOldAddress(): Promise<void> {
    await this.intent("Visit the Studio's old address", async () => {
      await this.page.goto("studio/#/");
      await expect(this.page).toHaveURL(/\/#\/studio\/$/);
      await expect(this.page.getByRole("heading", { level: 1, name: this.t("studio.name") })).toBeVisible();
      await expect(this.page.getByText(this.t("studio.tagline"))).toBeVisible();
      await expect(this.page.getByRole("button", { name: this.t("onboardingFlow.havePod") })).toBeVisible();
    });
  }

  /**
   * Back from a login set off at the Studio's landing page: the Studio
   * again, at the route the login left from, not Solid Memo.
   */
  async expectBackAfterLogin(): Promise<void> {
    await this.intent("Come back to the Studio after the login", async () => {
      await expect(this.page).toHaveURL(/\/#\/studio\/$/);
      await expect(this.page.getByRole("banner").getByRole("link", { name: this.t("studio.name"), exact: true })).toBeVisible();
    });
  }

  /**
   * Follows the header's link back to Solid Memo for a user with no
   * instance yet: the same session, so still logged in, at Solid Memo's
   * instance creator.
   */
  async backToInstanceCreator(): Promise<void> {
    await this.intent("Go back to Solid Memo to create an instance", async () => {
      await this.page.getByRole("banner").getByRole("link", { name: this.t("studio.backToApp") }).click();
      await expect(this.page.getByRole("heading", { name: this.t("instanceCreator.heading") })).toBeVisible();
    });
  }

  /**
   * Follows Solid Memo's "Open in Studio" in the instance bar: the Studio
   * opens in the same page, in the same session, so with no login of its own.
   */
  async openFromApp(): Promise<void> {
    await this.intent("Open Solid Memo Studio from Solid Memo", async () => {
      await this.app.chrome.instanceNav.getByRole("link", { name: this.t("studio.open") }).click();
      await expect(this.page).toHaveURL(/\/#\/studio\?instance=/);
      await expect(this.page.getByRole("banner").getByRole("link", { name: this.t("studio.name"), exact: true })).toBeVisible();
      await expect(this.page.getByRole("banner").getByRole("link", { name: this.t("studio.backToApp") })).toBeVisible();
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
      await expect(this.page).toHaveURL(/#\/studio\/cards\?deck=/);
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

  /** Opens a card from the workbench in the card inspector, on its content. */
  async openCard(deck: string, front: string): Promise<void> {
    await this.intent(`Inspect the card ${front}`, async () => {
      await this.cards(deck).getByRole("rowheader", { name: front, exact: true }).getByRole("link").click();
      await expect(this.page.getByRole("heading", { level: 2, name: this.t("studio.card.heading", { card: front }) })).toBeVisible();
      await expect(this.page).toHaveURL(/#\/studio\/card\?deck=/);
      await expect(this.page.getByLabel(this.t("cardContentFields.front"), { exact: true })).toHaveValue(front);
    });
  }

  /** Follows the inspector's tab of the card's wrong options, which the URL holds. */
  async openWrongOptions(count: number): Promise<void> {
    await this.intent("Open the card's wrong options", async () => {
      await this.page.getByRole("link", { name: this.t("studio.card.tab.distractors", { count }) }).click();
      await expect(this.page).toHaveURL(/[?&]tab=distractors/);
      await expect(this.wrongOptions).toBeVisible();
    });
  }

  /** Adds a wrong option, in the back's language, which is saved at once and listed. */
  async addWrongOption(text: string, note: string): Promise<void> {
    await this.intent(`Add the wrong option ${text}`, async () => {
      await this.wrongOptions.getByRole("button", { name: this.t("distractorFields.add") }).click();
      await this.wrongOptions.getByLabel(this.t("distractorFields.text"), { exact: true }).fill(text);
      await this.wrongOptions.getByLabel(this.t("distractorFields.note"), { exact: true }).fill(note);
      await this.wrongOptions.getByRole("button", { name: this.t("distractorFields.addDone"), exact: true }).click();
      await this.expectStatus(this.t("card.saved"));
      await expect(this.wrongOption(text)).toContainText(note);
    });
  }

  /** Retires a wrong option: it is kept, marked retired. */
  async retireWrongOption(text: string): Promise<void> {
    await this.intent(`Retire the wrong option ${text}`, async () => {
      await this.wrongOptions.getByRole("button", { name: this.t("distractorFields.retireLabel", { option: text }) }).click();
      await expect(this.wrongOption(text)).toContainText(this.t("distractorFields.retiredTag"));
      await expect(this.wrongOptions.getByRole("button", { name: this.t("distractorFields.restoreLabel", { option: text }) })).toBeVisible();
    });
  }

  /** Deletes a wrong option never published, confirming: it goes. */
  async deleteWrongOption(text: string): Promise<void> {
    await this.intent(`Delete the wrong option ${text}`, async () => {
      this.app.expectDialog(this.tp("distractorFields.deleteConfirm", { option: text }));
      await this.wrongOptions.getByRole("button", { name: this.t("distractorFields.deleteLabel", { option: text }) }).click();
      await expect(this.wrongOption(text)).toHaveCount(0);
    });
  }

  /** Follows the inspector's tab of the card's schedule, which the URL holds: the card was studied front to back. */
  async openSchedule(): Promise<void> {
    await this.intent("Open the card's schedule", async () => {
      await this.page.getByRole("link", { name: this.t("studio.card.tab.schedule") }).click();
      await expect(this.page).toHaveURL(/[?&]tab=schedule/);
      await expect(this.scheduleOf("frontToBack").getByRole("term")).toHaveText([
        this.t("studio.schedule.due"),
        this.t("studio.schedule.interval"),
        this.t("studio.schedule.ease"),
        this.t("studio.schedule.repetitions"),
        this.t("studio.schedule.firstReviewed"),
        this.t("studio.schedule.lastReviewed"),
      ]);
    });
  }

  /** Forgets the card's progress front to back, confirming: it is new that way. */
  async forgetProgress(): Promise<void> {
    await this.intent("Forget the card's progress front to back", async () => {
      this.app.expectDialog(this.tp("studio.schedule.resetConfirm"));
      await this.scheduleOf("frontToBack").getByRole("button", { name: this.t("studio.schedule.reset") }).click();
      await this.expectStatus(this.t("studio.schedule.done.reset", { direction: this.t("common.direction.frontToBack") }));
      await expect(this.scheduleOf("frontToBack").getByText(this.t("studio.schedule.new"))).toBeVisible();
    });
  }

  /** Sets the selected cards due today, the day the form offers; the status line counts those studied. */
  async rescheduleSelectedToday(count: number): Promise<void> {
    await this.intent("Set the selected cards due today", async () => {
      await this.cardBulk.getByRole("button", { name: this.t("studio.cardBulk.reschedule") }).click();
      await expect(this.cardBulk.getByLabel(this.t("studio.cardBulk.dueLabel"))).not.toHaveValue("");
      await this.cardBulk.getByRole("button", { name: this.t("studio.bulk.apply") }).click();
      await expect(this.page.getByRole("status").filter({ hasText: this.tp("studio.cardBulk.done.reschedule", { count }) })).toHaveCount(1);
    });
  }

  /**
   * Moves the selected cards to another deck of the instance, with their
   * progress (ticked to start with): the status line says how many went
   * where, and the workbench lists the fronts left.
   */
  async moveSelectedCards(deck: string, to: string, count: number, left: string[]): Promise<void> {
    await this.intent(`Move the selected cards to ${to}`, async () => {
      await this.cardBulk.getByRole("button", { name: this.t("studio.cardBulk.moveTo") }).click();
      await this.cardBulk.getByRole("combobox", { name: this.t("studio.cardBulk.transfer.deck") }).selectOption({ label: to });
      await expect(this.cardBulk.getByRole("checkbox", { name: this.t("studio.cardBulk.transfer.keepProgress") })).toBeChecked();
      await this.cardBulk.getByRole("button", { name: this.t("studio.cardBulk.transfer.move", { count }) }).click();
      await this.expectStatus(this.t("studio.cardBulk.transfer.moved", { count, deck: to }));
      await expect(this.cards(deck).getByRole("rowheader")).toHaveText(left);
    });
  }

  /** The schedule tab's section of one direction. */
  private scheduleOf(direction: "frontToBack" | "backToFront"): Locator {
    return this.page.getByRole("region", { name: this.t(`common.direction.${direction}`) });
  }

  /** Follows a deck's name on Home to what it says of itself. */
  async openAbout(instance: string, deck: string): Promise<void> {
    await this.intent(`Open what ${deck} says of itself`, async () => {
      await this.row(instance, deck).getByRole("rowheader").getByRole("link", { name: deck, exact: true }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: this.t("studio.about.heading", { deck }) })).toBeVisible();
      await expect(this.page).toHaveURL(/#\/studio\/about\?deck=/);
    });
  }

  /** Gives the deck one author and a licence (by its name), which the about screen then shows. */
  async setAuthorAndLicence(author: string, licence: string): Promise<void> {
    await this.intent(`Name ${author} the author, under ${licence}`, async () => {
      const section = this.page.getByRole("region", { name: this.t("studio.about.provenance") });
      await section.getByRole("button", { name: this.t("studio.about.editProvenance") }).click();
      await section.getByRole("textbox", { name: this.t("studio.about.author", { number: 1 }) }).fill(author);
      await section.getByRole("combobox", { name: this.t("studio.license.label") }).selectOption({ label: licence });
      await section.getByRole("button", { name: this.t("studio.about.saveProvenance") }).click();
      await this.expectStatus(this.t("studio.about.saved"));
      await expect(section).toContainText(author);
      await expect(section.getByRole("link", { name: new RegExp(escapeRegExp(licence)) })).toBeVisible();
    });
  }

  /** Follows Home's link to the instance's name and catalogue. */
  async openInstance(instance: string): Promise<void> {
    await this.intent("Open the instance's name and catalogue", async () => {
      await this.page.getByRole("link", { name: this.t("studio.decks.instanceLink") }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: this.t("studio.instance.heading", { instance }) })).toBeVisible();
      await this.app.chrome.expectBreadcrumbHere("studio.instance.crumb");
    });
  }

  /** Renames the instance: the screen names it anew once its registrations say so. */
  async renameInstance(name: string): Promise<void> {
    await this.intent(`Rename the instance ${name}`, async () => {
      await this.page.getByLabel(this.t("studio.instance.nameLabel"), { exact: true }).fill(name);
      await this.page.getByRole("button", { name: this.t("studio.instance.saveName") }).click();
      await this.expectStatus(this.t("studio.about.saved"));
      await expect(this.page.getByRole("heading", { level: 2, name: this.t("studio.instance.heading", { instance: name }) })).toBeVisible();
    });
  }

  /** Describes the instance's catalogue and gives it a licence (by its name). */
  async describeCatalog(description: string, licence: string): Promise<void> {
    await this.intent(`Describe the catalogue, under ${licence}`, async () => {
      await this.page.getByLabel(this.t("studio.instance.description"), { exact: true }).fill(description);
      await this.page.getByRole("combobox", { name: this.t("studio.license.label") }).selectOption({ label: licence });
      await this.page.getByRole("button", { name: this.t("studio.instance.saveCatalog") }).click();
      await this.expectStatus(this.t("studio.about.saved"));
    });
  }

  /** The inspector's wrong options. */
  private get wrongOptions(): Locator {
    return this.page.getByRole("group", { name: this.t("distractorFields.legend") });
  }

  /** A wrong option's item in the list, by its text. */
  private wrongOption(text: string): Locator {
    return this.wrongOptions.getByRole("listitem").filter({ hasText: text });
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
   * Follows the header's link back to Solid Memo, at the open instance's
   * decks: the same page and the same session, so still logged in.
   */
  async backToApp(): Promise<void> {
    await this.intent("Go back to Solid Memo", async () => {
      await this.page.getByRole("banner").getByRole("link", { name: this.t("studio.backToApp") }).click();
      await expect(this.page).toHaveURL(/\/#\/decks\?instance=/);
      await expect(this.page.getByRole("banner").getByRole("link", { name: this.t("app.documentTitle"), exact: true })).toBeVisible();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
    });
  }
}
