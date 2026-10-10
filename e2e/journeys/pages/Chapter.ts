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
    return this.page.getByRole("main").getByRole("button", { name: this.t("chapterPlayer.continue"), exact: true });
  }

  /** The chapter's title, once it is open at a step's theory. */
  async expectOpen(): Promise<string> {
    await expect(this.step).toBeVisible();
    await expect(this.continue.or(this.toQuestions)).toBeVisible();
    return (await this.title.innerText()).trim();
  }

  /**
   * Reads the step's theory chunk by chunk ("Part 2 of 3", Continue),
   * then goes on to its questions, which the theory is not shown with.
   * The step's number and how many chunks it has.
   */
  async readTheory(): Promise<{ step: number; chunks: number }> {
    return this.intent("Read the step's theory", async () => {
      const step = Number(this.tp("chapterPlayer.step").exec(await this.step.innerText())!.groups!.number);
      let chunks = 1;
      while (await this.continue.isVisible()) {
        await this.continue.click();
        chunks += 1;
        // The part moved to takes the focus, so it is read from its start.
        await expect(this.page.getByText(this.tp("chapterPlayer.part", { number: chunks }))).toBeFocused();
      }
      await expect(this.page.getByText(this.t("chapterPlayer.theoryHidden"), { exact: true })).toBeVisible();
      await this.toQuestions.click();
      await expect(this.toQuestions).toBeHidden();
      await expect(this.page.getByRole("heading", { level: 3, name: this.tp("chapterPlayer.check") }).or(
        this.page.getByRole("heading", { level: 3, name: this.tp("chapterPlayer.checkNumbered") }),
      )).toBeFocused();
      return { step, chunks };
    });
  }

  /**
   * Works through every step from the one shown: its theory, then each of
   * its questions, each answered once, until on to the final review.
   * The steps worked through.
   */
  async workThrough(known: Answers): Promise<{ step: number; chunks: number }[]> {
    const steps = [await this.readTheory()];
    for (;;) {
      await this.app.question.answer(known);
      const toReview = this.page.getByRole("button", { name: this.t("chapterPlayer.toReview"), exact: true });
      if (await toReview.isVisible()) {
        await toReview.click();
        return steps;
      }
      await this.page.getByRole("main").getByRole("button", { name: this.t("chapterPlayer.next"), exact: true }).click();
      // The step's next question, or the next step's theory.
      await expect(this.app.question.check.or(this.continue).or(this.toQuestions)).toBeVisible();
      if (!(await this.app.question.check.isVisible())) steps.push(await this.readTheory());
    }
  }
}
