// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * A try of a library deck: a random card, Reveal, then Next card, with
 * nothing recorded. Which card comes up is random, so a journey only
 * counts them. A course's lists its chapters instead, each played as the
 * course plays it (Chapter, CourseQuestion).
 */
export class LibraryPreview extends Screen {
  private get reveal(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("button", { name: this.t("libraryPreview.reveal"), exact: true });
  }

  private get nextCard(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("button", { name: this.t("libraryPreview.nextCard"), exact: true });
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

  private get chapters(): Locator {
    return this.page.getByRole("main").locator(".course-chapters").getByRole("listitem");
  }

  /**
   * Opens a course's chapter `number` (from 1) from the list: its title
   * takes the focus, above its first step's theory. Its title.
   */
  async openChapter(number: number): Promise<string> {
    return this.intent(`Open chapter ${number}`, async () => {
      const link = this.chapters
        .nth(number - 1)
        .getByRole("heading", { level: 3 })
        .getByRole("link");
      const title = (await link.innerText()).trim();
      await link.click();
      await expect(
        this.page.getByRole("heading", { level: 2, name: title, exact: true }),
      ).toBeFocused();
      await expect(this.app.chapter.step).toHaveText(this.tp("chapterPlayer.step", { number: 1 }));
      return title;
    });
  }

  /** "All chapters": the course's chapters again. */
  async allChapters(): Promise<void> {
    await this.intent("Go back to the chapters", async () => {
      await this.page
        .getByRole("main")
        .getByRole("link", { name: this.t("coursePreview.allChapters"), exact: true })
        .click();
      await expect(this.chapters.first()).toBeVisible();
    });
  }

  /** "Back to library": the library's list again. */
  async backToLibrary(): Promise<void> {
    await this.intent("Go back to the library", async () => {
      await this.page
        .getByRole("main")
        .getByRole("button", { name: this.t("libraryPreview.back"), exact: true })
        .click();
      await this.app.library.expectOpen();
    });
  }
}
