// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";
import { cellOf } from "./tables.ts";

/**
 * A card's own screen ("Card"), opened from the deck's Browser by its
 * front's link, and the card editor's fields it shares with the card
 * creator: "Format with Markdown", the sides, the preview of a card in
 * Markdown and "Save"; under them, the card's history.
 */
export class CardEditor extends Screen {
  /** From the deck's Browser: opens the card whose front's link starts with `front`. */
  async open(front: string): Promise<void> {
    await this.intent(`Open the card ${front}`, async () => {
      const table = this.page.getByRole("main").getByRole("table");
      await table.getByRole("link", { name: new RegExp(`^${escapeRegExp(front)}`) }).click();
      await expect(
        this.page.getByRole("heading", { name: this.t("card.heading"), exact: true }),
      ).toBeVisible();
    });
  }

  get markdownToggle(): Locator {
    return this.page.getByRole("checkbox", {
      name: this.t("cardContentFields.markdown"),
      exact: true,
    });
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
   * The card is in Markdown: the box checked, the front a textarea holding
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

  /**
   * The card's history: each answer to it, newest first, as its kind
   * ("First answer", "Again the same day", …) and the answer given
   * ("Good", …), as the table under "History" says them.
   */
  async history(): Promise<{ kind: string; answer: string }[]> {
    return this.intent("Read the card's history", async () => {
      const table = this.page
        .getByRole("main")
        .getByRole("table", { name: this.t("card.historyAnswers"), exact: true });
      await expect(table).toBeVisible();
      const rows = [];
      for (const row of await table
        .getByRole("row")
        .filter({ has: this.page.getByRole("cell") })
        .all())
        rows.push({
          kind: (await (await cellOf(table, row, this.t("card.historyKind"))).innerText()).trim(),
          answer: (
            await (await cellOf(table, row, this.t("card.historyAnswer"))).innerText()
          ).trim(),
        });
      return rows;
    });
  }

  /** Replaces the front's text and saves; "Saved." tells it took. */
  async saveFront(front: string): Promise<void> {
    await this.intent("Edit the front and save", async () => {
      await this.front.fill(front);
      await this.page
        .getByRole("main")
        .getByRole("button", { name: this.t("card.saveButton"), exact: true })
        .click();
      await expect(
        this.page.getByRole("status").filter({ hasText: this.t("card.saved") }),
      ).toBeVisible();
    });
  }
}
