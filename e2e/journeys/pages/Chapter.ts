// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import type { Answers } from "./CourseQuestion.ts";
import { Screen } from "./Screen.ts";

/**
 * One chapter of a course, a step at a time (docs/courses.md, "The
 * learner's flow"): the step's theory, a chunk at a time, then its
 * questions without it; after the last step, on to the final review.
 */
export class Chapter extends Screen {
  get title(): Locator {
    return this.page.getByRole("main").getByRole("heading", { level: 2 });
  }

  /** "Step 2 of 3". */
  get step(): Locator {
    return this.page.getByRole("heading", { level: 3, name: this.tp("chapterPlayer.step") });
  }

  /** Below the theory's last chunk: "On to the question(s)". */
  get toQuestions(): Locator {
    const forms = [1, 2].map((count) => this.t("chapterPlayer.toQuestions", { count }));
    return this.page.getByRole("button", { name: new RegExp(`^(${forms.join("|")})$`) });
  }

  get continue(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("button", { name: this.t("chapterPlayer.continue"), exact: true });
  }

  /** The chapter's title, once it is open at a step's theory. */
  async expectOpen(): Promise<string> {
    await expect(this.step).toBeVisible();
    await expect(this.continue.or(this.toQuestions)).toBeVisible();
    return (await this.title.innerText()).trim();
  }

  /**
   * The chapter's own text, its title and its step's theory, is shown in
   * its course's language `tag`, marked with it, and so is its crumb in
   * the trail, while the page and the app's own words ("Step 1 of 3")
   * stay in the app's language.
   */
  async expectCourseLanguage(tag: string): Promise<void> {
    await expect(this.page.locator("html")).toHaveAttribute("lang", this.app.locale);
    await expect(this.title.locator(`[lang="${tag}"]`)).toHaveCount(1);
    await expect(this.page.getByRole("main").locator(".course-theory")).toHaveAttribute(
      "lang",
      tag,
    );
    await expect(this.app.chrome.breadcrumbs.locator('[aria-current="page"]')).toHaveAttribute(
      "lang",
      tag,
    );
    await expect(this.step).toBeVisible();
    await expect(this.continue.or(this.toQuestions)).toBeVisible();
  }

  /**
   * Reads the step's theory chunk by chunk ("Part 2 of 3", Continue),
   * then goes on to its questions, which the theory is not shown with.
   * The step's number and how many chunks it has.
   */
  async readTheory(): Promise<{ step: number; chunks: number }> {
    return this.intent("Read the step's theory", async () => {
      const step = Number(
        this.tp("chapterPlayer.step").exec(await this.step.innerText())!.groups!.number,
      );
      let chunks = 1;
      while (await this.continue.isVisible()) {
        await this.continue.click();
        chunks += 1;
        // The part moved to takes the focus, so it is read from its start.
        await expect(
          this.page.getByText(this.tp("chapterPlayer.part", { number: chunks })),
        ).toBeFocused();
      }
      await expect(
        this.page.getByText(this.t("chapterPlayer.theoryHidden"), { exact: true }),
      ).toBeVisible();
      await this.toQuestions.click();
      await expect(this.toQuestions).toBeHidden();
      await expect(
        this.page.getByRole("heading", { level: 3, name: this.tp("chapterPlayer.check") }).or(
          this.page.getByRole("heading", {
            level: 3,
            name: this.tp("chapterPlayer.checkNumbered"),
          }),
        ),
      ).toBeFocused();
      return { step, chunks };
    });
  }

  /** The button after the last step's last question: on to the final review. */
  get toReview(): Locator {
    return this.page.getByRole("button", { name: this.t("chapterPlayer.toReview"), exact: true });
  }

  /**
   * Works through the step shown alone: its theory, then each of its
   * questions, answered once, until the next step's theory (or the word
   * before the final review, after the last step). How many questions
   * it had.
   */
  async workThroughStep(known: Answers): Promise<number> {
    return this.intent("Work through the step", async () => {
      await this.readTheory();
      return (await this.answerStep(known)).questions;
    });
  }

  /** The step's theory, a chunk of it with Continue or On to the question(s) below. */
  private get theory(): Locator {
    return this.continue.or(this.toQuestions);
  }

  private get next(): Locator {
    return this.page
      .getByRole("main")
      .getByRole("button", { name: this.t("chapterPlayer.next"), exact: true });
  }

  /**
   * Works through every step from where the chapter is: a step's theory,
   * or one of its questions, answered or not; each question answered
   * once, until on to the final review. The steps whose theory it read.
   */
  async workThrough(known: Answers): Promise<{ step: number; chunks: number }[]> {
    const steps: { step: number; chunks: number }[] = [];
    for (;;) {
      await expect(this.theory.or(this.app.question.options)).toBeVisible();
      if (await this.theory.isVisible()) steps.push(await this.readTheory());
      if ((await this.answerStep(known)).last) {
        await this.toReview.click();
        return steps;
      }
    }
  }

  /**
   * Answers the step's questions, each once, from the one shown (one
   * answered already is not answered again), until the next step's
   * theory, or, after the last step's, the button on to the final
   * review: how many, and whether it was the last step.
   */
  private async answerStep(known: Answers): Promise<{ questions: number; last: boolean }> {
    for (let questions = 1; ; questions++) {
      // Unanswered, or answered: Check, or the way on.
      await expect(this.app.question.check.or(this.next).or(this.toReview)).toBeVisible();
      if (await this.app.question.check.isVisible()) await this.app.question.answer(known);
      if (await this.toReview.isVisible()) return { questions, last: true };
      await this.next.click();
      // The step's next question, or the next step's theory.
      await expect(this.app.question.check.or(this.theory)).toBeVisible();
      if (!(await this.app.question.check.isVisible())) return { questions, last: false };
    }
  }
}
