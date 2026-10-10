import { expect, type Locator } from "@playwright/test";
import { ariaNames } from "../harness/ariaNames.ts";
import { escapeRegExp } from "../harness/strings.ts";
import { Screen } from "./Screen.ts";

/** What the learner knows of a course: each question's right option, by the question as it is read out. */
export type Answers = Map<string, string>;

/**
 * A course's multiple-choice question, in a step or a final review: a
 * group of options named by the question, Check, a verdict, and, once
 * checked, the right option marked and Next. The options are shuffled,
 * so they are told apart by name; the right one is learned from its mark
 * once checked, whichever course it is.
 */
export class CourseQuestion extends Screen {
  get options(): Locator {
    return this.page.getByRole("main").getByRole("radiogroup");
  }

  get check(): Locator {
    return this.page.getByRole("main").getByRole("button", { name: this.t("multipleChoice.check"), exact: true });
  }

  /** The question's name and its options' names, as a screen reader reads them. */
  async read(): Promise<{ question: string; options: string[] }> {
    const snapshot = await this.options.ariaSnapshot();
    return { question: ariaNames(snapshot, "radiogroup")[0]!, options: ariaNames(snapshot, "radio") };
  }

  /**
   * Answers the question: the right option when `known` has it, else the
   * first; or, `wrongly`, another than the right one `known` has. Learns the right one from its mark, and says which question
   * it was and whether the answer was right; the verdict says so too, and, for a question met
   * for the first time (none of a fresh learner's), that its card joined
   * the deck.
   */
  async answer(known: Answers, { wrongly = false }: { wrongly?: boolean } = {}): Promise<{ question: string; correct: boolean }> {
    return this.intent("Answer the question", async () => {
      const { question, options } = await this.read();
      const remembered = known.get(question);
      const added = !known.has(question);
      const chosen = wrongly
        ? options.find((option) => option !== remembered)!
        : remembered !== undefined && options.includes(remembered)
          ? remembered
          : options[0]!;
      await this.options.getByRole("radio", { name: chosen, exact: true }).check();
      await this.check.click();

      const mark = this.t("multipleChoice.right");
      const marked = this.options.getByRole("radio", { name: new RegExp(`${escapeRegExp(mark)}$`) });
      await expect(marked).toBeVisible();
      const rightName = ariaNames(await marked.ariaSnapshot(), "radio")[0]!.slice(0, -mark.length).trim();
      known.set(question, rightName);

      const correct = rightName === chosen;
      const verdict = [this.t(correct ? "courseQuestion.right" : "courseQuestion.wrong"), ...(added ? [this.t("courseQuestion.added")] : [])];
      await expect(this.page.getByRole("status").filter({ hasText: verdict[0] })).toHaveText(verdict.join(" "));
      // Answered, it can be checked no more.
      await expect(this.check).toBeHidden();
      return { question, correct };
    });
  }
}
