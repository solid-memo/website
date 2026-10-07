import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/** Which neighbour a deck was grouped with, as its actions menu offered. */
export type Neighbour = "below" | "above";

/**
 * Deck groups on the Decks screen: the actions menu of each deck and
 * group ("Actions for …", a menu laid over the page), the name field a
 * new group opens with, moves within a group and deleting a group. Each
 * change is checked by what the list announces (its status line) and by
 * where the rows are.
 */
export class DeckGroups extends Screen {
  /** The button that opens the actions menu of a deck or group, by its name. */
  actionsButton(name: string): Locator {
    return this.page.getByRole("button", { name: this.t("deckList.actions", { name }), exact: true });
  }

  /** The list item of the group named, its header and what it holds (no deck row holds a group's menu). */
  group(name: string): Locator {
    // The innermost: a group inside another is in its list item too.
    return this.page.getByRole("listitem").filter({ has: this.actionsButton(name) }).last();
  }

  /**
   * Puts the deck in a new group with its neighbour: the one below when
   * there is one, else the one above. The new group's name field opens.
   */
  async groupWithNeighbour(deckName: string): Promise<Neighbour> {
    return this.intent(`Group ${deckName} with its neighbour`, async () => {
      const menu = await this.openMenu(deckName);
      const below = menu.getByRole("menuitem", { name: this.t("deckList.groupWithNext"), exact: true });
      const above = menu.getByRole("menuitem", { name: this.t("deckList.groupWithPrevious"), exact: true });
      const neighbour: Neighbour = (await below.getAttribute("aria-disabled")) === "true" ? "above" : "below";
      const item = neighbour === "below" ? below : above;
      await expect(item).not.toHaveAttribute("aria-disabled", "true");
      await item.click();
      await this.expectStatus(this.tp("deckList.combined", { group: this.t("deckList.newGroupName") }));
      await expect(this.groupNameField).toBeFocused();
      return neighbour;
    });
  }

  /** Names the group whose name field is open (a new group's). */
  async nameGroup(name: string): Promise<void> {
    await this.intent(`Name the group ${name}`, async () => {
      await this.groupNameField.fill(name);
      await this.groupNameField.press("Enter");
      await this.expectStatus(this.tp("deckList.renamed", { name }));
      await expect(this.groupNameField).toBeHidden();
      await expect(this.actionsButton(name)).toBeVisible();
    });
  }

  /**
   * Moves the deck (or group) one place down among its neighbours; given
   * where it should land (inside a group), checks the list says so.
   */
  async moveDown(name: string, to?: { position: number; count: number; group: string }): Promise<void> {
    await this.intent(`Move ${name} down`, async () => {
      const menu = await this.openMenu(name);
      await menu.getByRole("menuitem", { name: this.t("deckList.moveDown"), exact: true }).click();
      const place: Record<string, string | number> =
        to === undefined ? {} : { position: to.position, count: to.count, place: this.t("deckList.inGroup", { group: to.group }) };
      await this.expectStatus(this.tp("deckList.moved", { name, ...place }));
    });
  }

  /** The names of what the group holds, in the order the list shows them (the group's own name left out). */
  async orderIn(groupName: string): Promise<string[]> {
    const labels = await this.group(groupName).getByRole("button", { name: this.tp("deckList.actions") }).evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label") ?? ""),
    );
    const named = this.tp("deckList.actions");
    return labels.flatMap((label) => named.exec(label)?.groups?.name ?? []).filter((name) => name !== groupName);
  }

  /** Deletes the group, confirming; what it held stays, one level up. */
  async deleteGroup(groupName: string): Promise<void> {
    await this.intent(`Delete the group ${groupName}`, async () => {
      const held = await this.orderIn(groupName);
      expect(held.length, `decks in ${groupName}`).toBeGreaterThan(0);
      this.app.expectDialog(this.tp("deckList.deleteGroupConfirm", { name: groupName, count: held.length }));
      const menu = await this.openMenu(groupName);
      await menu.getByRole("menuitem", { name: this.t("deckList.deleteGroup"), exact: true }).click();
      await this.expectStatus(this.tp("deckList.deleted", { name: groupName }));
      await this.expectNoGroup(groupName);
      for (const name of held) await this.expectAtTopLevel(name);
    });
  }

  async expectNoGroup(name: string): Promise<void> {
    await expect(this.actionsButton(name)).toHaveCount(0);
  }

  /** The deck is in no group: the only list item around it is its own row. */
  async expectAtTopLevel(deckName: string): Promise<void> {
    await expect(this.actionsButton(deckName)).toBeVisible();
    await expect(this.page.getByRole("listitem").filter({ has: this.actionsButton(deckName) })).toHaveCount(1);
  }

  private get groupNameField(): Locator {
    return this.page.getByRole("textbox", { name: this.t("deckList.groupName"), exact: true });
  }

  private async openMenu(name: string): Promise<Locator> {
    const label = this.t("deckList.actions", { name });
    await this.actionsButton(name).click();
    const menu = this.page.getByRole("menu", { name: label, exact: true });
    await expect(menu).toBeVisible();
    return menu;
  }

  /** The list's status line (visually hidden) says this. */
  private async expectStatus(message: RegExp): Promise<void> {
    await expect(this.page.getByRole("status").filter({ hasText: message })).toHaveCount(1);
  }
}
