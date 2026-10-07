import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * "Decks": the instance's home, its decks as the user arranged them into
 * groups, each row a link to the deck's page, what it offers today ("Study
 * {deck}" or "Done for today") and its actions menu (DeckGroups); under
 * them, Create deck and Deck library (Library.open).
 */
export class DeckList extends Screen {
  get heading(): Locator {
    return this.page.getByRole("heading", { name: this.t("deckList.heading"), level: 2 });
  }

  /**
   * The list of decks and groups: the outermost list whose rows have an
   * actions menu ("Actions for {name}"), so not the breadcrumbs' list.
   */
  get tree(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("list")
      .filter({ has: this.page.getByRole("button", { name: this.tp("deckList.actions") }) })
      .first();
  }

  /** The links of the decks in the list, in the order shown (groups' decks included, if open). */
  private get deckLinks(): Locator {
    return this.tree.getByRole("link");
  }

  /** The link that opens the deck named `name` (its row's name). */
  deckLink(name: string): Locator {
    return this.tree.getByRole("link", { name, exact: true });
  }

  /** The row of the deck named `name`: the innermost list item holding its link. */
  row(name: string): Locator {
    return this.tree.getByRole("listitem").filter({ has: this.page.getByRole("link", { name, exact: true }) }).last();
  }

  /** The deck's "Study" button in its row ("Study {deck}"), there while it has something to study today. */
  studyButton(name: string): Locator {
    return this.page.getByRole("button", { name: this.t("deckStudyAction.studyLabel", { deck: name }), exact: true });
  }

  async expectShown(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }

  async expectDeck(name: string): Promise<void> {
    await expect(this.deckLink(name)).toBeVisible();
  }

  /** Follows "Create deck" to the deck creator. */
  async openDeckCreator(): Promise<void> {
    await this.intent("Open the deck creator", async () => {
      await this.page.getByRole("main").getByRole("link", { name: this.t("deckList.createButton"), exact: true }).click();
      await expect(this.page.getByRole("heading", { name: this.t("deckCreator.heading") })).toBeVisible();
    });
  }

  /** Opens the deck's own page (its name, its Browser and Study). */
  async openDeck(name: string): Promise<void> {
    await this.intent(`Open the deck ${name}`, async () => {
      await this.deckLink(name).click();
      await this.app.deckDetail.expectDeck(name);
    });
  }

  /** Starts studying the deck with its row's Study button. */
  async study(name: string): Promise<void> {
    await this.intent(`Study ${name} from the deck list`, async () => {
      await this.studyButton(name).click();
      await expect(this.page.getByRole("heading", { name: this.t("study.heading", { deck: name }) })).toBeVisible();
    });
  }

  /** The row says the deck is done for today (nothing more to study). */
  async expectDoneForToday(name: string): Promise<void> {
    await expect(this.row(name)).toContainText(this.t("deckStudyAction.done"));
    await expect(this.studyButton(name)).toBeHidden();
  }

  /** The row offers `count` to study ("{count} to review"). */
  async expectToReview(name: string, count: number): Promise<void> {
    await expect(this.row(name)).toContainText(this.t("common.toReview", { count }));
    await expect(this.studyButton(name)).toBeVisible();
  }

  /** The names of the decks shown, in the order shown; with `among`, only those. */
  async deckNames(among?: readonly string[]): Promise<string[]> {
    await expect(this.heading).toBeVisible();
    const names = (await this.deckLinks.allTextContents()).map((name) => name.trim());
    const unique = names.filter((name, at) => names.indexOf(name) === at);
    return among === undefined ? unique : unique.filter((name) => among.includes(name));
  }

  /** The decks named come in this order (others may be between them). */
  async expectOrder(names: readonly string[]): Promise<void> {
    await expect.poll(() => this.deckNames(names)).toEqual([...names]);
  }
}
