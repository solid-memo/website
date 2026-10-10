import { expect, type Locator } from "@playwright/test";
import type { Answers } from "./CourseQuestion.ts";
import { Screen } from "./Screen.ts";

/**
 * A chapter's final review: a word before it (every step done, what the
 * review is), then every question of the chapter, shuffled, a wrong one
 * coming back until it is answered right; then the chapter is completed
 * and the course's page opens.
 */
export class ChapterReview extends Screen {
  heading(chapter: string): Locator {
    return this.page.getByRole("heading", { level: 2, name: this.t("chapterReview.heading", { chapter }), exact: true });
  }

  /** The word before the review, its heading focused, with the way back to the chapters. */
  async expectWord(chapter: string): Promise<void> {
    await expect(this.heading(chapter)).toBeFocused();
    await expect(this.page.getByText(this.t("chapterReview.cheer"), { exact: true })).toBeVisible();
    await expect(this.page.getByRole("link", { name: this.t("chapterReview.backToCourse"), exact: true })).toBeVisible();
  }

  async start(): Promise<void> {
    await this.intent("Start the final review", async () => {
      await this.page.getByRole("button", { name: this.t("chapterReview.start"), exact: true }).click();
      await expect(this.app.question.options).toBeVisible();
    });
  }

  /**
   * Answers every question the review asks, by what `known` holds, until
   * the chapter is completed and the course's page opens; the first one
   * whose answer `known` holds is answered wrongly once, so that it comes
   * back. How many times
   * a question was asked, those that came back included, how many
   * questions there were, and how many answers were wrong.
   */
  async answerAll(known: Answers): Promise<{ asked: number; questions: number; wrong: number }> {
    let asked = 0;
    let wrong = 0;
    const questions = new Set<string>();
    let missed = false;
    for (;;) {
      asked += 1;
      const wrongly: boolean = !missed && known.has((await this.app.question.read()).question);
      missed ||= wrongly;
      const { question, correct } = await this.app.question.answer(known, { wrongly });
      questions.add(question);
      if (!correct) wrong += 1;
      await this.page.getByRole("main").getByRole("button", { name: this.t("chapterReview.next"), exact: true }).click();
      await expect(this.app.question.options.or(this.app.course.cheer)).toBeVisible();
      if (await this.app.course.cheer.isVisible()) return { asked, questions: questions.size, wrong };
    }
  }
}
