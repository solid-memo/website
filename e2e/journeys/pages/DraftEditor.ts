// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import { chooseLanguageOf } from "./languages.ts";
import { Screen } from "./Screen.ts";

/**
 * A draft of a release in Solid Memo Studio (docs/studio.md, Writing a
 * draft): its overview and outline, a chapter's editor, a step's editor
 * (its theory and its questions) and a question's editor (its wrong
 * options and its preview). Every edit is saved as it is made, and the
 * status line says when all of them are. Its release check lists the
 * problems of the release it will be, each a link to what it is about;
 * its listing preview shows it as the library will. A next version is
 * compared with the release it follows. Its release screen says who
 * compiled it and how, under what license, and from what sources, and
 * publishes it in the pod, public, or says when the pod did not make it
 * public. A draft Solid Memo does not open says why.
 */
export class DraftEditor extends Screen {
  /** The draft's outline, as the overview shows it: its chapters, each a list of its steps. */
  private get outline(): Locator {
    return this.page.getByRole("list", { name: this.t("studio.draft.outline"), exact: true });
  }

  /** The preview of the question open, as the course asks it. */
  private get preview(): Locator {
    return this.page.getByRole("region", { name: this.t("studio.question.preview"), exact: true });
  }

  /** Waits until every change made is written. */
  async expectSaved(): Promise<void> {
    await expect(
      this.page.getByRole("status").filter({ hasText: this.t("studio.draftEdit.saved") }),
    ).toHaveCount(1);
  }

  /** Opens a draft from the drafts screen's table, by its name: its overview, with a course's outline. */
  async openDraft(name: string, { course = true } = {}): Promise<void> {
    await this.intent(`Open the draft ${name}`, async () => {
      await this.page.getByRole("table").getByRole("link", { name, exact: true }).click();
      await expect(this.page.getByRole("heading", { level: 2, name })).toBeVisible();
      if (course)
        await expect(
          this.page.getByRole("heading", { name: this.t("studio.draft.outline") }),
        ).toBeVisible();
      else
        await expect(
          this.page.getByRole("heading", { name: this.t("studio.draft.cards") }),
        ).toBeVisible();
    });
  }

  /** Retires a card of the draft open, from its table of cards: it is saved, and the table says it is retired. */
  async retireCard(front: string): Promise<void> {
    await this.intent(`Retire the card ${front}`, async () => {
      await this.page.getByRole("link", { name: this.t("studio.draft.allCards") }).click();
      await this.page
        .getByRole("rowheader")
        .getByRole("link", { name: front, exact: true })
        .click();
      await expect(this.page.getByRole("heading", { level: 2, name: front })).toBeVisible();
      await this.page
        .getByRole("button", { name: this.t("studio.draftEdit.retire"), exact: true })
        .click();
      await this.expectSaved();
      await expect(
        this.page.getByRole("button", { name: this.t("studio.draftEdit.restore"), exact: true }),
      ).toBeVisible();
    });
  }

  /** Opens the release's metadata and provenance from the draft's tabs. */
  async openRelease(): Promise<void> {
    await this.intent("Open the release's metadata and provenance", async () => {
      await this.app.chrome.studioTab("draft", "release");
      await expect(
        this.page.getByRole("heading", { level: 2, name: this.t("studio.release.heading") }),
      ).toBeVisible();
      await this.app.chrome.expectBreadcrumbHere("studio.release.crumb");
    });
  }

  /** Names the release's publisher, one of its authors, on the release screen. */
  async choosePublisher(name: string): Promise<void> {
    await this.intent(`Name ${name} the release's publisher`, async () => {
      await this.page
        .getByRole("combobox", { name: this.t("studio.release.publisher"), exact: true })
        .selectOption({ label: name });
      await this.expectSaved();
    });
  }

  /** The release screen's part that publishes it. */
  private get publishPart(): Locator {
    return this.page.getByRole("region", { name: this.t("studio.publish.heading"), exact: true });
  }

  /**
   * Publishes the draft from its release screen, in the instance's
   * releases folder, once the user says it will be public: the screen
   * then shows it released, at the address it said. Its address.
   */
  private async release(): Promise<string> {
    const part = this.publishPart;
    await expect(part.getByText(this.t("studio.publish.noErrors"))).toBeVisible({
      timeout: 30_000,
    });
    const [before, after] = this.t("studio.publish.address", { url: "\u0000" }).split("\u0000") as [
      string,
      string,
    ];
    const said = (await part.getByText(new RegExp(`^${escapeRegExp(before)}`)).textContent())!;
    const url = said.slice(before.length, said.length - after.length);
    const publish = part.getByRole("button", { name: this.t("studio.publish.publish") });
    await expect(publish).toBeDisabled();
    await part.getByRole("checkbox", { name: this.t("studio.publish.confirm") }).check();
    await publish.click();
    await expect(part.getByRole("link", { name: url, exact: true })).toHaveAttribute("href", url, {
      timeout: 60_000,
    });
    return url;
  }

  /**
   * Publishes the draft from its release screen, in the instance's
   * releases folder, once the user says it will be public: the screen
   * then shows it released, at the address it said, readable by
   * everyone. Its address.
   */
  async publish(): Promise<string> {
    return this.intent("Publish the release to the pod, saying it will be public", async () => {
      const url = await this.release();
      await expect(this.publishPart.getByText(this.t("studio.publish.public"))).toBeVisible();
      // Frozen: the metadata above it changes no more.
      await expect(
        this.page.getByRole("combobox", { name: this.t("studio.license.label") }),
      ).toBeDisabled();
      return url;
    });
  }

  /**
   * Publishes the draft as `publish` does, but the pod does not make it
   * public: the screen says only the user can read it, and offers to
   * make it public. Its address.
   */
  async publishNotPublic(): Promise<string> {
    return this.intent("Publish the release to the pod; it is not made public", async () => {
      const url = await this.release();
      await expect(this.publishPart.getByText(this.t("studio.publish.private"))).toBeVisible();
      return url;
    });
  }

  /** Asks again to make the release at `url` public, from its release screen: the pod does not, and the screen says so. */
  async makePublicRefused(url: string): Promise<void> {
    await this.intent("Make the release public; the pod does not", async () => {
      await this.publishPart
        .getByRole("button", { name: this.t("studio.publish.makePublic"), exact: true })
        .click();
      await expect(
        this.publishPart
          .getByRole("alert")
          .filter({ hasText: this.t("errors.publicAccessRefused", { url }) }),
      ).toBeVisible();
      await expect(this.publishPart.getByText(this.t("studio.publish.private"))).toBeVisible();
    });
  }

  /** Follows a draft's link in the drafts screen's table: it is not opened, and the screen says why. */
  async openRefused(name: string, message: string): Promise<void> {
    await this.intent(`Open the draft ${name}, which is refused`, async () => {
      await this.page.getByRole("table").getByRole("link", { name, exact: true }).click();
      await expect(this.page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    });
  }

  /** Adds an author on the release screen: its form is named after it. */
  async addAuthor(name: string): Promise<void> {
    await this.intent(`Add the author ${name}`, async () => {
      const form = this.page.getByRole("group", { name: this.t("studio.release.newAuthor") });
      await form.getByRole("textbox", { name: this.t("studio.release.authorName") }).fill(name);
      await form.getByRole("button", { name: this.t("studio.release.addAuthor") }).click();
      await this.expectSaved();
      await expect(this.page.getByRole("group", { name, exact: true })).toBeVisible();
    });
  }

  /** Chooses the attribution that names the authors, with the help of AI: it says who compiled the release, and no more. */
  async attributeWithAi(names: string): Promise<void> {
    await this.intent("Attribute the release to its authors, with the help of AI", async () => {
      const attribution = this.page.getByRole("radio", {
        name: `Compiled by ${names} with the help of AI.`,
        exact: true,
      });
      await attribution.check();
      await this.expectSaved();
      await expect(attribution).toBeChecked();
    });
  }

  /** Chooses the release's license, by its name. */
  async chooseReleaseLicense(license: string): Promise<void> {
    await this.intent(`License the release ${license}`, async () => {
      await this.page
        .getByRole("combobox", { name: this.t("studio.license.label") })
        .selectOption({ label: license });
      await this.expectSaved();
    });
  }

  /** Adds a source by its address, title and the evidence for its license, its creator left out. */
  async addSource(address: string, title: string, evidence: string): Promise<void> {
    await this.intent(`Add the source ${title}`, async () => {
      const form = this.page.getByRole("group", { name: this.t("studio.release.newSource") });
      await form.getByLabel(this.t("studio.release.sourceIri"), { exact: true }).fill(address);
      await form
        .getByRole("textbox", { name: this.t("studio.release.sourceTitle"), exact: true })
        .fill(title);
      await form
        .getByRole("textbox", { name: this.t("studio.release.sourceEvidence") })
        .fill(evidence);
      await form.getByRole("button", { name: this.t("studio.release.addSource") }).click();
      await this.expectSaved();
      await expect(
        this.page.getByRole("button", { name: this.t("studio.release.editOf", { name: title }) }),
      ).toBeVisible();
    });
  }

  /** Names a source's creator (the source by its address and title), where the release check's warning led. */
  async describeSource(address: string, title: string, creator: string): Promise<void> {
    await this.intent(`Name the creator of ${title}`, async () => {
      await this.page
        .getByRole("button", { name: this.t("studio.release.editOf", { name: title }) })
        .click();
      const form = this.page.getByRole("group", { name: address, exact: true });
      await form
        .getByRole("textbox", { name: this.t("studio.release.sourceCreator") })
        .fill(creator);
      await form.getByRole("button", { name: this.t("studio.release.saveSource") }).click();
      await this.expectSaved();
      await expect(this.page.getByText(creator, { exact: false })).toBeVisible();
    });
  }

  /** Records a check made by AI: the release says it was no human review. */
  async recordAiCheck(label: string, scope: string, outcome: string): Promise<void> {
    await this.intent(`Record the AI check ${label}`, async () => {
      const form = this.page.getByRole("group", { name: this.t("studio.release.newCheck") });
      await form.getByRole("radio", { name: this.t("studio.release.checkAi") }).check();
      await form.getByRole("textbox", { name: this.t("studio.release.checkLabel") }).fill(label);
      await form.getByRole("textbox", { name: this.t("studio.release.checkScope") }).fill(scope);
      await form
        .getByRole("textbox", { name: this.t("studio.release.checkOutcome") })
        .fill(outcome);
      await form.getByRole("button", { name: this.t("studio.release.addCheck") }).click();
      await this.expectSaved();
      await expect(
        this.page.getByText(`Scope: ${scope}; an AI check, not a human review.`),
      ).toBeVisible();
    });
  }

  /** Opens the comparison with the release the draft follows, from its tabs. */
  async openDiff(): Promise<void> {
    await this.intent("Compare the draft with the previous version", async () => {
      await this.app.chrome.studioTab("draft", "diff");
      await expect(
        this.page.getByRole("heading", { level: 2, name: this.t("studio.diff.heading") }),
      ).toBeVisible();
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
        await expect(
          content
            .getByRole("listitem")
            .filter({ has: this.page.getByRole("link", { name, exact: true }) }),
        ).toHaveText(`${name}: ${status}`);
      }
      const learners = this.page.getByRole("region", { name: this.t("studio.diff.learners") });
      await expect(learners).toContainText(upgrade);
      await expect(learners).toContainText(this.t("studio.diff.nothingLost"));
    });
  }

  /** Adds a chapter by its title, in English, under the id the assistant suggests: the outline shows it. */
  async addChapter(title: string): Promise<void> {
    await this.intent(`Add the chapter ${title}`, async () => {
      const field = this.page.getByRole("textbox", {
        name: this.t("studio.draft.chapterTitle"),
        exact: true,
      });
      await field.fill(title);
      await chooseLanguageOf(this.app, field, "en");
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
      const label = this.t("studio.step.theory");
      const field = this.page.getByRole("textbox", { name: label, exact: true });
      await field.fill(theory);
      await chooseLanguageOf(this.app, field, "en");
      await expect(
        this.page.getByRole("region", {
          name: this.t("proseField.preview", { field: label }),
          exact: true,
        }),
      ).toHaveText(theory);
      await this.expectSaved();
    });
  }

  /** Adds a question to the step open, its front and back in English: the step lists it. */
  async addQuestion(front: string, back: string): Promise<void> {
    await this.intent(`Add the question ${front}`, async () => {
      const form = this.page.getByRole("group", {
        name: this.t("studio.step.newQuestion"),
        exact: true,
      });
      const [frontField, backField] = [
        this.t("cardContentFields.front"),
        this.t("cardContentFields.back"),
      ].map((name) => form.getByRole("textbox", { name, exact: true })) as [Locator, Locator];
      await frontField.fill(front);
      await chooseLanguageOf(this.app, frontField, "en");
      await backField.fill(back);
      await chooseLanguageOf(this.app, backField, "en");
      await this.page.getByRole("button", { name: this.t("studio.draftEdit.addQuestion") }).click();
      // The step's own link: the outline beside it lists the question too.
      await expect(
        this.page.getByRole("main").getByRole("link", { name: front, exact: true }),
      ).toBeVisible();
      await this.expectSaved();
    });
  }

  /** Opens a question from the step open: its editor, with its preview as the course asks it. */
  async openQuestion(front: string): Promise<void> {
    await this.intent(`Open the question ${front}`, async () => {
      await this.page.getByRole("main").getByRole("link", { name: front, exact: true }).click();
      await expect(this.page.getByRole("heading", { level: 2, name: front })).toBeVisible();
      await expect(
        this.page.getByRole("heading", { name: this.t("studio.question.preview") }),
      ).toBeVisible();
    });
  }

  /** Adds a wrong option to the question open: it is saved, and the preview offers it. */
  async addWrongOption(text: string, note: string): Promise<void> {
    await this.intent(`Add the wrong option ${text}`, async () => {
      const options = this.page.getByRole("group", { name: this.t("distractorFields.legend") });
      await options.getByRole("button", { name: this.t("distractorFields.add") }).click();
      const textField = options.getByLabel(this.t("distractorFields.text"), { exact: true });
      await textField.fill(text);
      await chooseLanguageOf(this.app, textField, "en");
      const noteField = options.getByLabel(this.t("distractorFields.note"), { exact: true });
      await noteField.fill(note);
      await chooseLanguageOf(this.app, noteField, "en");
      await options
        .getByRole("button", { name: this.t("distractorFields.addDone"), exact: true })
        .click();
      await expect(options.getByRole("listitem").filter({ hasText: text })).toContainText(note);
      await expect(this.preview.getByRole("radio", { name: text })).toBeVisible();
      await this.expectSaved();
    });
  }

  /** Answers the preview of the question open with a wrong option: it says why that is wrong. */
  async answerPreviewWrong(option: string, why: string): Promise<void> {
    await this.intent(`Answer the preview with ${option}`, async () => {
      const preview = this.preview;
      await preview.getByRole("radio", { name: option }).check();
      await preview.getByRole("button", { name: this.t("multipleChoice.check") }).click();
      await expect(
        preview.getByRole("status").filter({ hasText: this.t("courseQuestion.wrong") }),
      ).toBeVisible();
      await expect(preview).toContainText(why);
    });
  }

  /** The outline lists the chapter, its one step, and the step's questions in order. */
  async expectOutline(
    draft: string,
    chapter: string,
    step: string,
    questions: string[],
  ): Promise<void> {
    await this.intent("See the outline", async () => {
      await this.app.chrome.breadcrumbs.getByRole("link", { name: draft, exact: true }).click();
      await expect(this.outline.getByRole("link", { name: chapter, exact: true })).toBeVisible();
      const item = (within: Locator, name: string) =>
        within
          .getByRole("listitem")
          .filter({ has: this.page.getByRole("link", { name, exact: true }) });
      const listed = item(item(this.outline, chapter), step).getByRole("listitem");
      await expect(listed).toHaveCount(questions.length);
      // Each question's own link, in order; a badge beside it counts its problems.
      for (const [i, question] of questions.entries()) {
        await expect(
          listed.nth(i).getByRole("link", { name: question, exact: true }),
        ).toBeVisible();
      }
      await expect(
        this.page.getByText(this.t("studio.draft.cardCount", { count: questions.length })),
      ).toBeVisible();
    });
  }

  /** The release check's list item of what a problem is in, by its name: among the errors or the warnings. */
  private problemsOf(subject: string): Locator {
    const list = (severity: string) =>
      this.page.getByRole("list", { name: this.t(`studio.check.${severity}`), exact: true });
    return list("errors")
      .or(list("warnings"))
      .getByRole("listitem")
      .filter({ has: this.page.getByRole("link", { name: subject, exact: true }) });
  }

  /** The overview's outline counts the problems of what it lists, a badge beside it. */
  async expectBadge(name: string, count: number): Promise<void> {
    await this.intent(`See ${count} problems counted in ${name}`, async () => {
      const badge = `${this.t("studio.check.badge", { count })} ${this.t("studio.check.badgeOf", { name })}`;
      await expect(this.outline.getByRole("link", { name: badge, exact: true })).toBeVisible();
    });
  }

  /** Opens the draft's release check from its tabs. */
  async openCheck(): Promise<void> {
    await this.intent("Open the release check", async () => {
      await this.app.chrome.studioTab("draft", "check");
      await expect(
        this.page.getByRole("heading", { level: 2, name: this.t("studio.check.heading") }),
      ).toBeVisible();
      await expect(
        this.page.getByRole("status").filter({ hasText: this.t("studio.check.checking") }),
      ).toHaveCount(0);
    });
  }

  /** The release check lists the problem in what it names. */
  async expectProblem(subject: string, problem: string): Promise<void> {
    await this.intent(`See the problem of ${subject}: ${problem}`, async () => {
      await expect(
        this.problemsOf(subject).getByRole("link", { name: problem, exact: true }),
      ).toBeVisible();
    });
  }

  /** The release check no longer lists the problem in what it names. */
  async expectNoProblem(subject: string, problem: string): Promise<void> {
    await this.intent(`See the problem of ${subject} gone: ${problem}`, async () => {
      await expect(
        this.page.getByRole("heading", { level: 2, name: this.t("studio.check.heading") }),
      ).toBeVisible();
      await expect(
        this.problemsOf(subject).getByRole("link", { name: problem, exact: true }),
      ).toHaveCount(0);
    });
  }

  /** Follows a problem to where it is fixed: its editor, at its field, where the focus is. */
  async followProblem(subject: string, problem: string): Promise<void> {
    await this.intent(`Follow the problem of ${subject} to its field`, async () => {
      await this.problemsOf(subject).getByRole("link", { name: problem, exact: true }).click();
      // The app's own mark of where a screen opened at a field is arrived at (useScreenFocus).
      await expect(this.page.locator("[data-arrival]")).toBeFocused();
    });
  }

  /** Writes the release's description, in English, where the overview was opened at it. */
  async writeDescription(description: string): Promise<void> {
    await this.intent("Write the release's description", async () => {
      const field = this.page.getByRole("textbox", {
        name: this.t("studio.draft.description"),
        exact: true,
      });
      await field.fill(description);
      await chooseLanguageOf(this.app, field, "en");
      await this.expectSaved();
    });
  }

  /** Checks the draft against the shapes too: they find what a release still lacks. */
  async checkShapes(): Promise<void> {
    await this.intent("Check against the shapes", async () => {
      const shapes = this.page.getByRole("region", { name: this.t("studio.check.shapesHeading") });
      await shapes.getByRole("button", { name: this.t("studio.check.shapesRun") }).click();
      const found = this.t("studio.check.shapesCount", { count: 7 })
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace("7", "\\d+");
      await expect(shapes.getByText(new RegExp(found))).toBeVisible({ timeout: 60_000 });
    });
  }

  /** Opens the listing preview from the draft's tabs: the draft's row and page in the library, a picture of them. */
  async openPreview(draft: string): Promise<void> {
    await this.intent("Preview the listing", async () => {
      await this.app.chrome.studioTab("draft", "preview");
      await expect(
        this.page.getByRole("heading", { level: 2, name: this.t("studio.preview.heading") }),
      ).toBeVisible();
      const row = this.page.getByRole("region", {
        name: this.t("studio.preview.row"),
        exact: true,
      });
      const page = this.page.getByRole("region", {
        name: this.t("studio.preview.page"),
        exact: true,
      });
      await expect(row.getByRole("link", { name: draft, exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: draft, exact: true })).toBeVisible();
    });
  }
}
