import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * Solid Memo Studio, at studio/ of the same site (docs/studio.md): its
 * landing page (the same login as Solid Memo's, under the Studio's name),
 * its instance picker, Home's table of decks, and its way back to Solid
 * Memo.
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

  /** Home lists the deck, in the instance's table: its name, its cards and what is due today. */
  async expectDeck(instance: string, deck: string, figures: { cards: number; due: number }): Promise<void> {
    await this.intent(`See ${deck} in the Studio`, async () => {
      await expect(this.page.getByRole("heading", { name: this.t("studio.decks.heading"), level: 2 })).toBeVisible();
      const row = this.decks(instance).getByRole("row").filter({ has: this.page.getByRole("rowheader", { name: deck, exact: true }) });
      await expect(row.getByRole("cell")).toHaveText([String(figures.cards), String(figures.due)]);
    });
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
