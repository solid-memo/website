import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/**
 * A card's own screen ("Card"), opened from the deck's Browser by its
 * front's link, and the card editor's fields it shares with the card
 * creator: "Format with Markdown", the sides, the preview of a card in
 * Markdown and "Save".
 */
export class CardEditor extends Screen {
  /** From the deck's Browser: opens the card whose front's link starts with `front`. */
  async open(front: string): Promise<void> {
    await this.intent(`Open the card ${front}`, async () => {
      const table = this.page.getByRole("main").getByRole("table");
      await table.getByRole("link", { name: new RegExp(`^${escapeRegExp(front)}`) }).click();
      await expect(this.page.getByRole("heading", { name: this.t("card.heading"), exact: true })).toBeVisible();
    });
  }

  get markdownToggle(): Locator {
    return this.page.getByRole("checkbox", { name: this.t("cardContentFields.markdown"), exact: true });
  }

  get front(): Locator {
    return this.page.getByRole("textbox", { name: this.t("cardContentFields.front"), exact: true });
  }

  /** The "Preview" disclosure under the fields, there while the card is in Markdown. */
  get preview(): Locator {
    return this.page.locator("details", {
      has: this.page.getByText(this.t("cardContentFields.preview"), { exact: true }),
    });
  }

  /** The code block the preview shows, the region it scrolls in named "Code". */
  get previewCode(): Locator {
    return this.preview.getByRole("region", { name: this.t("markdown.code"), exact: true });
  }

  /**
   * The card is in Markdown: the box ticked, the front a textarea holding
   * `front` exactly, its line breaks and indentation kept, and the
   * preview, open on a wide screen, showing `code` as a code block.
   */
  async expectMarkdown(front: string, code: string): Promise<void> {
    await this.intent("See the card in Markdown, its lines as typed", async () => {
      await expect(this.markdownToggle).toBeChecked();
      await expect(this.front).toHaveJSProperty("tagName", "TEXTAREA");
      await expect(this.front).toHaveValue(front);
      await expect(this.preview).toHaveAttribute("open", "");
      await expect(this.previewCode).toHaveText(code);
    });
  }

  /** Replaces the front's text and saves; "Saved." tells it took. */
  async saveFront(front: string): Promise<void> {
    await this.intent("Edit the front and save", async () => {
      await this.front.fill(front);
      await this.page.getByRole("main").getByRole("button", { name: this.t("card.saveButton"), exact: true }).click();
      await expect(this.page.getByRole("status").filter({ hasText: this.t("card.saved") })).toBeVisible();
    });
  }
}
