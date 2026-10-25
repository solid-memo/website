// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/**
 * A course as the learner has it: its title, how many chapters are done,
 * "Start the course" (or "Continue") with Deck library after it in the
 * app, and its chapters, under its deck in the breadcrumbs; played with
 * Solid Memo's course screens, in the app or in a Studio trial. Back
 * from a chapter just completed, it cheers it.
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
    return this.page.getByRole("listitem").filter({
      has: this.page.getByRole("heading", {
        level: 3,
        name: new RegExp(`${escapeRegExp(title)}$`),
      }),
    });
  }

  /** The chapter's line in the course's list says `done` of its steps are done ("1 of 3 steps done"). */
  async expectStepsDone(chapter: string, done: number): Promise<void> {
    await expect(
      this.chapter(chapter).getByText(this.tp("course.stepsDone", { done })),
    ).toBeVisible();
  }

  async expectShown(title: string): Promise<void> {
    await expect(this.heading(title)).toBeVisible();
    await this.app.chrome.expectBreadcrumbHere("breadcrumbs.course");
  }

  /** The button beside the course's title: its preferences open, with its course language. */
  async openPreferences(): Promise<void> {
    await this.intent("Open the course's preferences", async () => {
      await this.page
        .getByRole("main")
        .getByRole("link", { name: this.t("course.preferencesLabel"), exact: true })
        .click();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.preferences");
    });
  }

  /**
   * The course's own text, its title, description and chapters' titles,
   * is shown in its course language `tag` (null: the app's, as the page
   * is), marked with it, while the page and the app's own words stay in
   * the app's language.
   */
  async expectCourseLanguage(tag: string | null): Promise<void> {
    const course = this.page.getByRole("main").locator(".course");
    const title = course.locator("header h2");
    const chapters = course.locator(".course-chapter h3");
    await expect(this.page.locator("html")).toHaveAttribute("lang", this.app.locale);
    if (tag === null) {
      await expect(title.locator("[lang]")).toHaveCount(0);
      await expect(chapters.locator("[lang]")).toHaveCount(0);
    } else {
      await expect(title.locator(`[lang="${tag}"]`)).toHaveCount(1);
      await expect(course.locator(".deck-description")).toHaveAttribute("lang", tag);
      await expect(chapters.first()).toBeVisible();
      // Every chapter's title, and only its title: its number is the app's.
      await expect(chapters.locator(`[lang="${tag}"]`)).toHaveCount(await chapters.count());
      await expect(chapters.first()).toContainText(this.t("course.chapterNumber", { number: 1 }));
    }
    await expect(
      course.getByRole("link", { name: this.t("course.start"), exact: true }),
    ).toBeVisible();
  }

  /** "Start the course": its first chapter opens at its first step. */
  async start(): Promise<void> {
    await this.intent("Start the course", async () => {
      await this.page
        .getByRole("main")
        .getByRole("link", { name: this.t("course.start"), exact: true })
        .click();
      await this.app.chapter.expectOpen();
    });
  }

  /**
   * The page cheers the chapter just completed: the word takes the focus,
   * the chapter is done, and Continue goes on to the next, Deck library
   * after it.
   */
  async expectCheered(chapter: string): Promise<void> {
    const word = this.page.getByText(this.t("course.chapterCompleted", { chapter }), {
      exact: true,
    });
    // The word is in the part of the page that takes the focus, with what follows it.
    await expect(word.locator("xpath=..")).toBeFocused();
    await expect(
      this.chapter(chapter).getByText(this.t("course.done"), { exact: true }),
    ).toBeVisible();
    await expect(
      this.page
        .getByRole("main")
        .getByRole("link", { name: this.t("course.continue"), exact: true }),
    ).toBeVisible();
    await this.expectLibraryAfter("course.continue");
  }

  /**
   * The page's secondary Deck library button comes right after its way on
   * or back (`after`, "Continue", "Start the course" or "Back to decks").
   */
  async expectLibraryAfter(after: string): Promise<void> {
    const main = this.page.getByRole("main");
    const way = main.getByRole("link", { name: this.t(after), exact: true });
    const library = main.getByRole("link", { name: this.t("deckList.libraryLink"), exact: true });
    await expect(library).toBeVisible();
    // The next link after the way on, in reading and Tab order.
    await expect(way.locator("xpath=following-sibling::a[1]")).toHaveText(
      this.t("deckList.libraryLink"),
    );
  }

  /**
   * Plays the course's first chapter from its page: its step's theory,
   * then each question answered right (`answers`, the right answer by
   * the question), then the word before its final review and the review,
   * answered right too, back to the course's page, which cheers the
   * course completed.
   */
  async playChapter(
    chapter: string,
    theory: string,
    answers: Record<string, string>,
  ): Promise<void> {
    await this.intent(`Play ${chapter} to the end of the course`, async () => {
      await this.page.getByRole("link", { name: this.t("course.start") }).click();
      await expect(
        this.page.getByRole("heading", { level: 2, name: chapter, exact: true }),
      ).toBeVisible();
      // The main content's: in a trial, the Studio's outline beside it shows the theory too.
      await expect(this.page.getByRole("main").getByText(theory, { exact: true })).toBeVisible();
      const count = Object.keys(answers).length;
      await this.page
        .getByRole("button", { name: this.tp("chapterPlayer.toQuestions", { count }) })
        .click();
      for (let asked = 1; asked <= count; asked++) {
        await this.answerRight(answers);
        const onwards =
          asked === count ? this.t("chapterPlayer.toReview") : this.t("chapterPlayer.next");
        await this.page.getByRole("button", { name: onwards, exact: true }).click();
      }
      // The word before the review; in a trial, the Studio's heading of the trial has the focus, not the review's.
      await expect(this.app.chapterReview.heading(chapter)).toBeVisible();
      await expect(
        this.page.getByText(this.t("chapterReview.cheer"), { exact: true }),
      ).toBeVisible();
      await this.app.chapterReview.start();
      for (let asked = 1; asked <= count; asked++) {
        await this.answerRight(answers);
        await this.page
          .getByRole("main")
          .getByRole("button", { name: this.t("chapterReview.next"), exact: true })
          .click();
      }
      // Back on the course's page, which cheers the course completed.
      await expect(
        this.page.getByText(this.t("course.courseCompleted"), { exact: true }),
      ).toBeVisible();
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
    await this.page
      .getByRole("button", { name: this.t("multipleChoice.check"), exact: true })
      .click();
    await expect(this.page.locator(".course-question")).toContainText(
      this.t("courseQuestion.right"),
    );
  }
}
