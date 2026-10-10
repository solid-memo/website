import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/**
 * A course as the learner has it: its title, how many chapters are done,
 * "Start the course" (or "Continue") and its chapters, under its deck in
 * the breadcrumbs. Back from a chapter just completed, it cheers it.
 */
export class Course extends Screen {
  heading(title: string): Locator {
    return this.page.getByRole("heading", { name: title, exact: true, level: 2 });
  }

  /** The word that a chapter, or the whole course, has just been completed. */
  get cheer(): Locator {
    return this.page
      .getByText(this.tp("course.chapterCompleted"))
      .or(this.page.getByText(this.t("course.courseCompleted"), { exact: true }));
  }

  /** A chapter in the course's list, by its title ("Chapter 1: Studying"). */
  chapter(title: string): Locator {
    return this.page
      .getByRole("listitem")
      .filter({ has: this.page.getByRole("heading", { level: 3, name: new RegExp(`${escapeRegExp(title)}$`) }) });
  }

  async expectShown(title: string): Promise<void> {
    await expect(this.heading(title)).toBeVisible();
    await this.app.chrome.expectBreadcrumbHere("breadcrumbs.course");
  }

  /** "Start the course": its first chapter opens at its first step. */
  async start(): Promise<void> {
    await this.intent("Start the course", async () => {
      await this.page.getByRole("main").getByRole("link", { name: this.t("course.start"), exact: true }).click();
      await this.app.chapter.expectOpen();
    });
  }

  /**
   * The page cheers the chapter just completed: the word takes the focus,
   * the chapter is done, and Continue goes on to the next.
   */
  async expectCheered(chapter: string): Promise<void> {
    const word = this.page.getByText(this.t("course.chapterCompleted", { chapter }), { exact: true });
    // The word is in the part of the page that takes the focus, with what follows it.
    await expect(word.locator("xpath=..")).toBeFocused();
    await expect(this.chapter(chapter).getByText(this.t("course.done"), { exact: true })).toBeVisible();
    await expect(this.page.getByRole("main").getByRole("link", { name: this.t("course.continue"), exact: true })).toBeVisible();
  }
}
