import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * A try of a library deck: a random card, Reveal, then Next card, with
 * nothing recorded. Which card comes up is random, so a journey only
 * counts them.
 */
export class LibraryPreview extends Screen {
  private get reveal(): Locator {
    return this.page.getByRole("main").getByRole("button", { name: this.t("libraryPreview.reveal"), exact: true });
  }

  private get nextCard(): Locator {
    return this.page.getByRole("main").getByRole("button", { name: this.t("libraryPreview.nextCard"), exact: true });
  }

  /** Reveals the card shown and goes on to the next, `count` times. */
  async answer(count: number): Promise<void> {
    await this.intent(`Look at ${count} card(s)`, async () => {
      for (let card = 1; card <= count; card++) {
        await this.reveal.click();
        await expect(this.reveal).toBeHidden();
        await this.nextCard.click();
        await expect(this.reveal).toBeVisible();
      }
    });
  }

  /** "Back to library": the library's list again. */
  async backToLibrary(): Promise<void> {
    await this.intent("Go back to the library", async () => {
      await this.page.getByRole("main").getByRole("button", { name: this.t("libraryPreview.back"), exact: true }).click();
      await this.app.library.expectOpen();
    });
  }
}
