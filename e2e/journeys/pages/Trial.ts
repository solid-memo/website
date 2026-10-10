import { expect } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * A draft's trial in Solid Memo Studio (docs/studio.md, The trial): the
 * draft played with Solid Memo's own course screens, in a sandbox kept
 * in the page, with the trial's controls above it.
 */
export class Trial extends Screen {
  /** Opens the trial from the draft's overview, reached by the trail: the course's page, ready to start. */
  async open(draft: string): Promise<void> {
    await this.intent(`Try out ${draft}`, async () => {
      await this.app.chrome.breadcrumbs.getByRole("link", { name: draft, exact: true }).click();
      await this.page.getByRole("link", { name: this.t("studio.draft.trialLink") }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: this.t("studio.trial.heading") })).toBeVisible();
      await expect(this.page.getByRole("heading", { level: 3, name: this.t("studio.trial.controls") })).toBeVisible();
      await expect(this.page.getByRole("heading", { level: 2, name: draft, exact: true })).toBeVisible();
      await this.app.chrome.expectBreadcrumbHere("studio.trial.crumb");
    });
  }

  /**
   * Plays the course's first chapter from its page: its step's theory,
   * then each question answered right (`answers`, the right answer by
   * the question), then its final review, answered right too, to the end
   * of the course.
   */
  async playToTheEnd(chapter: string, theory: string, answers: Record<string, string>): Promise<void> {
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
      await expect(this.page.getByRole("heading", { level: 2, name: this.t("chapterReview.heading", { chapter }) })).toBeVisible();
      for (let asked = 1; asked <= count; asked++) {
        await this.answerRight(answers);
        await this.page.getByRole("button", { name: this.t("chapterReview.next"), exact: true }).click();
      }
      await expect(this.page.getByText(this.t("chapterReview.courseDone"), { exact: true })).toBeVisible();
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
