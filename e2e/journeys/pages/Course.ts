import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/**
 * A course as the learner has it: its title, how many chapters are done,
 * "Start the course" (or "Continue") and its chapters, under its deck in
 * the breadcrumbs; played with Solid Memo's course screens, in the app or
 * in a Studio trial. Back from a chapter just completed, it cheers it.
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

  /**
   * Plays the course's first chapter from its page: its step's theory,
   * then each question answered right (`answers`, the right answer by
   * the question), then the word before its final review and the review,
   * answered right too, back to the course's page, which cheers the
   * course completed.
   */
  async playChapter(chapter: string, theory: string, answers: Record<string, string>): Promise<void> {
    await this.intent(`Play ${chapter} to the end of the course`, async () => {
      await this.page.getByRole("link", { name: this.t("course.start") }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: chapter, exact: true })).toBeVisible();
      await expect(this.page.getByText(theory, { exact: true })).toBeVisible();
      const count = Object.keys(answers).length;
      await this.page.getByRole("button", { name: this.tp("chapterPlayer.toQuestions", { count }) }).click();
      for (let asked = 1; asked <= count; asked++) {
        await this.answerRight(answers);
        const onwards = asked === count ? this.t("chapterPlayer.toReview") : this.t("chapterPlayer.next");
        await this.page.getByRole("button", { name: onwards, exact: true }).click();
      }
      // The word before the review; in a trial, the Studio's heading of the trial has the focus, not the review's.
      await expect(this.app.chapterReview.heading(chapter)).toBeVisible();
      await expect(this.page.getByText(this.t("chapterReview.cheer"), { exact: true })).toBeVisible();
      await this.app.chapterReview.start();
      for (let asked = 1; asked <= count; asked++) {
        await this.answerRight(answers);
        await this.page.getByRole("main").getByRole("button", { name: this.t("chapterReview.next"), exact: true }).click();
      }
      // Back on the course's page, which cheers the course completed.
      await expect(this.page.getByText(this.t("course.courseCompleted"), { exact: true })).toBeVisible();
    });
  }

  /** Answers the question shown with its right answer, which the course says is right. */
  private async answerRight(answers: Record<string, string>): Promise<void> {
    const question = this.page.locator(".course-question .card-question p");
    await expect(question).toBeVisible();
    const front = (await question.innerText()).trim();
    const right = answers[front];
    expect(right, `The right answer to ${front}`).toBeDefined();
    await this.page.getByRole("radio", { name: right, exact: true }).check();
    await this.page.getByRole("button", { name: this.t("multipleChoice.check"), exact: true }).click();
    await expect(this.page.locator(".course-question")).toContainText(this.t("courseQuestion.right"));
  }
}
