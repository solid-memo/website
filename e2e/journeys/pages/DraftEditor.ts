import { expect, type Locator } from "@playwright/test";
import { chooseLanguage } from "./languages.ts";
import { Screen } from "./Screen.ts";

/**
 * A draft of a release in Solid Memo Studio (docs/studio.md, Writing a
 * draft): its overview and outline, a chapter's editor, a step's editor
 * (its theory and its questions) and a question's editor (its wrong
 * options and its preview). Every edit is saved as it is made, and the
 * status line says when all of them are. Its release check lists the
 * problems of the release it will be, each a link to what it is about;
 * its listing preview shows it as the library will. A next version is
 * compared with the release it follows.
 */
export class DraftEditor extends Screen {
  /** The draft's outline, as the overview shows it. */
  private get outline(): Locator {
    return this.page.locator(".draft-outline");
  }

  /** Waits until every change made is written. */
  async expectSaved(): Promise<void> {
    await expect(this.page.getByRole("status").filter({ hasText: this.t("studio.draftEdit.saved") })).toHaveCount(1);
  }

  /** Opens a draft from the drafts screen's table, by its name: its overview, with a course's outline. */
  async openDraft(name: string, { course = true } = {}): Promise<void> {
    await this.intent(`Open the draft ${name}`, async () => {
      await this.page.getByRole("table").getByRole("link", { name, exact: true }).click();
      await expect(this.page.getByRole("heading", { level: 2, name })).toBeVisible();
      if (course) await expect(this.page.getByRole("heading", { name: this.t("studio.draft.outline") })).toBeVisible();
      else await expect(this.page.getByRole("heading", { name: this.t("studio.draft.cards") })).toBeVisible();
    });
  }

  /** Retires a card of the draft open, from its table of cards: it is saved, and the table says it is retired. */
  async retireCard(front: string): Promise<void> {
    await this.intent(`Retire the card ${front}`, async () => {
      await this.page.getByRole("link", { name: this.t("studio.draft.allCards") }).click();
      await this.page.getByRole("rowheader").getByRole("link", { name: front, exact: true }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: front })).toBeVisible();
      await this.page.getByRole("button", { name: this.t("studio.draftEdit.retire"), exact: true }).click();
      await this.expectSaved();
      await expect(this.page.getByRole("button", { name: this.t("studio.draftEdit.restore"), exact: true })).toBeVisible();
    });
  }

  /** Opens the comparison with the release the draft follows, from its overview, reached by the trail. */
  async openDiff(draft: string): Promise<void> {
    await this.intent("Compare the draft with the previous version", async () => {
      await this.app.chrome.breadcrumbs.getByRole("link", { name: draft, exact: true }).click();
      await this.page.getByRole("link", { name: this.t("studio.draft.diffLink") }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: this.t("studio.diff.heading") })).toBeVisible();
      await this.app.chrome.expectBreadcrumbHere("studio.diff.crumb");
      await expect(this.page.getByText(this.t("studio.diff.comparing"))).toHaveCount(0);
    });
  }

  /**
   * The comparison keeps the series' rules, lists each subject changed
   * with how (a link to its editor), and says what a learner's copy of
   * the release would get (`upgrade`), losing nothing.
   */
  async expectDiff(changes: Record<string, string>, upgrade: string): Promise<void> {
    await this.intent("See what the draft changes, and what learners get", async () => {
      await expect(this.page.getByText(this.t("studio.diff.rulesKept"))).toBeVisible();
      const content = this.page.getByRole("region", { name: this.t("studio.diff.subjects") });
      for (const [name, status] of Object.entries(changes)) {
        await expect(content.getByRole("listitem").filter({ has: this.page.getByRole("link", { name, exact: true }) })).toHaveText(`${name}: ${status}`);
      }
      const learners = this.page.getByRole("region", { name: this.t("studio.diff.learners") });
      await expect(learners).toContainText(upgrade);
      await expect(learners).toContainText(this.t("studio.diff.nothingLost"));
    });
  }

  /** Adds a chapter by its title, in English, under the id the assistant suggests: the outline shows it. */
  async addChapter(title: string): Promise<void> {
    await this.intent(`Add the chapter ${title}`, async () => {
      await this.page.locator("#new-chapter-title").fill(title);
      await chooseLanguage(this.app, this.page.locator("#new-chapter-title-language-0"), "en");
      await this.page.getByRole("button", { name: this.t("studio.draft.addChapter") }).click();
      await expect(this.outline.getByRole("link", { name: title, exact: true })).toBeVisible();
      await this.expectSaved();
    });
  }

  /** Opens a chapter from the outline. */
  async openChapter(title: string): Promise<void> {
    await this.intent(`Open the chapter ${title}`, async () => {
      await this.outline.getByRole("link", { name: title, exact: true }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    });
  }

  /** Adds a step to the chapter open, under the id the assistant suggests, and opens it. */
  async addStep(): Promise<void> {
    await this.intent("Add a step to the chapter", async () => {
      await this.page.getByRole("button", { name: this.t("studio.chapter.addStep") }).click();
      const step = this.t("studio.chapter.step", { number: 1 });
      await this.page.getByRole("link", { name: step, exact: true }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: step })).toBeVisible();
    });
  }

  /** Writes the step's theory, in English: the preview shows it as the course player will, and it is saved. */
  async writeTheory(theory: string): Promise<void> {
    await this.intent("Write the step's theory", async () => {
      await this.page.locator("#step-theory").fill(theory);
      await chooseLanguage(this.app, this.page.locator("#step-theory-language-0"), "en");
      await expect(this.page.locator(".prose-preview .course-theory")).toHaveText(theory);
      await this.expectSaved();
    });
  }

  /** Adds a question to the step open, its front and back in English: the step lists it. */
  async addQuestion(front: string, back: string): Promise<void> {
    await this.intent(`Add the question ${front}`, async () => {
      await this.page.locator("#step-new-question-front").fill(front);
      await chooseLanguage(this.app, this.page.locator("#step-new-question-front-language-0"), "en");
      await this.page.locator("#step-new-question-back").fill(back);
      await chooseLanguage(this.app, this.page.locator("#step-new-question-back-language-0"), "en");
      await this.page.getByRole("button", { name: this.t("studio.draftEdit.addQuestion") }).click();
      await expect(this.page.getByRole("link", { name: front, exact: true })).toBeVisible();
      await this.expectSaved();
    });
  }

  /** Opens a question from the step open: its editor, with its preview as the course asks it. */
  async openQuestion(front: string): Promise<void> {
    await this.intent(`Open the question ${front}`, async () => {
      await this.page.getByRole("link", { name: front, exact: true }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: front })).toBeVisible();
      await expect(this.page.getByRole("heading", { name: this.t("studio.question.preview") })).toBeVisible();
    });
  }

  /** Adds a wrong option to the question open: it is saved, and the preview offers it. */
  async addWrongOption(text: string, note: string): Promise<void> {
    await this.intent(`Add the wrong option ${text}`, async () => {
      const options = this.page.getByRole("group", { name: this.t("distractorFields.legend") });
      await options.getByRole("button", { name: this.t("distractorFields.add") }).click();
      await options.getByLabel(this.t("distractorFields.text"), { exact: true }).fill(text);
      await chooseLanguage(this.app, this.page.locator("#distractor-text-language-0"), "en");
      await options.getByLabel(this.t("distractorFields.note"), { exact: true }).fill(note);
      await chooseLanguage(this.app, this.page.locator("#distractor-note-language-0"), "en");
      await options.getByRole("button", { name: this.t("distractorFields.addDone"), exact: true }).click();
      await expect(options.getByRole("listitem").filter({ hasText: text })).toContainText(note);
      await expect(this.page.locator(".course-player").getByRole("radio", { name: text })).toBeVisible();
      await this.expectSaved();
    });
  }

  /** Answers the preview of the question open with a wrong option: it says why that is wrong. */
  async answerPreviewWrong(option: string, why: string): Promise<void> {
    await this.intent(`Answer the preview with ${option}`, async () => {
      const preview = this.page.locator(".course-player");
      await preview.getByRole("radio", { name: option }).check();
      await preview.getByRole("button", { name: this.t("multipleChoice.check") }).click();
      await expect(preview.getByRole("status").filter({ hasText: this.t("courseQuestion.wrong") })).toBeVisible();
      await expect(preview).toContainText(why);
    });
  }

  /** Goes back to the draft's overview by the trail, and opens a step from its outline. */
  async backToStep(draft: string, step: string): Promise<void> {
    await this.intent(`Go back to ${step}`, async () => {
      await this.app.chrome.breadcrumbs.getByRole("link", { name: draft, exact: true }).click();
      await this.outline.getByRole("link", { name: step, exact: true }).click();
      await expect(this.page.getByRole("heading", { level: 2 })).toBeVisible();
    });
  }

  /** The outline lists the chapter, its one step, and the step's questions in order. */
  async expectOutline(draft: string, chapter: string, step: string, questions: string[]): Promise<void> {
    await this.intent("See the outline", async () => {
      await this.app.chrome.breadcrumbs.getByRole("link", { name: draft, exact: true }).click();
      await expect(this.outline.getByRole("link", { name: chapter, exact: true })).toBeVisible();
      const row = this.outline.locator(".outline-step").filter({ has: this.page.getByRole("link", { name: step, exact: true }) });
      // Each question's own link, not the badge counting its problems.
      await expect(row.locator(".outline-questions > li > a:first-child")).toHaveText(questions);
      await expect(this.page.getByText(this.t("studio.draft.cardCount", { count: questions.length }))).toBeVisible();
    });
  }

  /** The release check's list item of what a problem is in, by its name. */
  private problemsOf(subject: string): Locator {
    return this.page
      .locator(".release-problems > li")
      .filter({ has: this.page.getByRole("link", { name: subject, exact: true }) });
  }

  /** The overview's outline counts the problems of what it lists, a badge beside it. */
  async expectBadge(name: string, count: number): Promise<void> {
    await this.intent(`See ${count} problems counted in ${name}`, async () => {
      const badge = `${this.t("studio.check.badge", { count })} ${this.t("studio.check.badgeOf", { name })}`;
      await expect(this.outline.getByRole("link", { name: badge, exact: true })).toBeVisible();
    });
  }

  /** Opens the draft's release check from its overview, reached by the trail. */
  async openCheck(draft: string): Promise<void> {
    await this.intent("Open the release check", async () => {
      await this.app.chrome.breadcrumbs.getByRole("link", { name: draft, exact: true }).click();
      await this.page.getByRole("link", { name: this.t("studio.draft.problemsLink") }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: this.t("studio.check.heading") })).toBeVisible();
      await expect(this.page.getByRole("status").filter({ hasText: this.t("studio.check.checking") })).toHaveCount(0);
    });
  }

  /** The release check lists the problem in what it names. */
  async expectProblem(subject: string, problem: string): Promise<void> {
    await this.intent(`See the problem of ${subject}: ${problem}`, async () => {
      await expect(this.problemsOf(subject).getByRole("link", { name: problem, exact: true })).toBeVisible();
    });
  }

  /** The release check no longer lists the problem in what it names. */
  async expectNoProblem(subject: string, problem: string): Promise<void> {
    await this.intent(`See the problem of ${subject} gone: ${problem}`, async () => {
      await expect(this.page.getByRole("heading", { level: 2, name: this.t("studio.check.heading") })).toBeVisible();
      await expect(this.problemsOf(subject).getByRole("link", { name: problem, exact: true })).toHaveCount(0);
    });
  }

  /** Follows a problem to where it is fixed: its editor, at its field, where the focus is. */
  async followProblem(subject: string, problem: string): Promise<void> {
    await this.intent(`Follow the problem of ${subject} to its field`, async () => {
      await this.problemsOf(subject).getByRole("link", { name: problem, exact: true }).click();
      await expect(this.page.locator("[data-arrival]")).toBeFocused();
    });
  }

  /** Writes the release's description, in English, where the overview was opened at it. */
  async writeDescription(description: string): Promise<void> {
    await this.intent("Write the release's description", async () => {
      await this.page.locator("#draft-description").fill(description);
      await chooseLanguage(this.app, this.page.locator("#draft-description-language-0"), "en");
      await this.expectSaved();
    });
  }

  /** Checks the draft against the shapes too: they find what a release still lacks. */
  async checkShapes(): Promise<void> {
    await this.intent("Check against the shapes", async () => {
      const shapes = this.page.getByRole("region", { name: this.t("studio.check.shapesHeading") });
      await shapes.getByRole("button", { name: this.t("studio.check.shapesRun") }).click();
      const found = this.t("studio.check.shapesCount", { count: 7 }).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("7", "\\d+");
      await expect(shapes.getByText(new RegExp(found))).toBeVisible({ timeout: 60_000 });
    });
  }

  /** Opens the listing preview from the release check: the draft's row and page in the library, a picture of them. */
  async openPreview(draft: string): Promise<void> {
    await this.intent("Preview the listing", async () => {
      await this.page.getByRole("link", { name: this.t("studio.check.previewLink") }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: this.t("studio.preview.heading") })).toBeVisible();
      const previews = this.page.locator(".listing-preview");
      await expect(previews.first().locator(".library-deck-name")).toHaveText(draft);
      await expect(previews.last().locator("h2")).toHaveText(draft);
    });
  }
}
