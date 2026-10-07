import { expect, type Locator } from "@playwright/test";
import type { AnswerScale } from "./Preferences.ts";
import { Screen } from "./Screen.ts";

/** A grade the journeys give: none that puts the card back in the session ("Again", 0–2). */
export type Grade = "hard" | "good" | "easy";

export interface StudyResult {
  /** How many cards were answered. */
  studied: number;
  /** The session's size as its status line first said it ("Card 1 of {total}"); 0 when there was nothing to study. */
  total: number;
}

/**
 * "Study: {deck}": one card at a time, "Card x of y" in the status line,
 * Reveal, then the answer buttons; at the end "Session finished" (or
 * "Nothing to study today"). "End session" goes back to Decks. Which
 * card comes first is shuffled, so nothing here says which it is.
 */
export class Study extends Screen {
  /** The status line while a card is shown: "Card {position} of {total}". */
  private get statusLine(): Locator {
    return this.page.getByRole("main").getByRole("status").filter({ hasText: this.tp("study.position") });
  }

  private get gradeGroup(): Locator {
    return this.page.getByRole("group", { name: this.t("study.gradePrompt") });
  }

  private get finishedMessage(): Locator {
    return this.page.getByRole("main").getByText(this.t("study.finished"), { exact: true });
  }

  private get nothingMessage(): Locator {
    return this.page.getByRole("main").getByText(this.t("study.nothingToday"), { exact: true });
  }

  async expectStudying(deck: string): Promise<void> {
    await expect(this.page.getByRole("heading", { name: this.t("study.heading", { deck }) })).toBeVisible();
  }

  /** The card shown and the session's size, read from "Card x of y". */
  async position(): Promise<{ position: number; total: number }> {
    await expect(this.statusLine).toBeVisible();
    const said = this.tp("study.position").exec((await this.statusLine.textContent()) ?? "")?.groups;
    if (said === undefined) throw new Error("The study status line says no position.");
    return { position: Number(said.position), total: Number(said.total) };
  }

  /** "Card {position} of {total}" is what the status line says. */
  async expectPosition(position: number, total: number): Promise<void> {
    await expect(this.statusLine).toHaveText(this.t("study.position", { position, total }));
  }

  async reveal(): Promise<void> {
    await this.intent("Reveal the answer", async () => {
      await this.page.getByRole("main").getByRole("button", { name: this.t("study.reveal"), exact: true }).click();
      await expect(this.gradeGroup).toBeVisible();
    });
  }

  /** The answer buttons shown are the `scale`'s (the answer must be revealed). */
  async expectScale(scale: AnswerScale): Promise<void> {
    const labels =
      scale === "minimal"
        ? (["again", "hard", "good", "easy"] as const).map((answer) => this.t(`study.minimal.${answer}`))
        : (["blackout", "wrong", "almost", "hard", "good", "easy"] as const).map((quality) => this.t(`study.quality.${quality}`));
    await expect(this.gradeGroup.getByRole("button")).toHaveText(labels);
  }

  /** The grade's button on whichever scale is shown: "Good" or "4 — Good". */
  private gradeButton(grade: Grade): Locator {
    return this.gradeGroup
      .getByRole("button", { name: this.t(`study.minimal.${grade}`), exact: true })
      .or(this.gradeGroup.getByRole("button", { name: this.t(`study.quality.${grade}`), exact: true }));
  }

  /** Answers the revealed card; then the next card is shown, or the session's end. */
  async grade(grade: Grade): Promise<void> {
    await this.intent(`Answer ${grade}`, async () => {
      const { position, total } = await this.position();
      await this.gradeButton(grade).click();
      if (position < total) await this.expectPosition(position + 1, total);
      else await expect(this.finishedMessage).toBeVisible();
    });
  }

  /** Reveals the card shown, whichever it is, and answers it. */
  async answer(grade: Grade): Promise<void> {
    await this.reveal();
    await this.grade(grade);
  }

  /**
   * Studies every card the session holds, answering each `grade` (and,
   * given a `scale`, checking each card offers its buttons); returns how
   * many and the size it said.
   */
  async studyAll({ grade = "good", scale }: { grade?: Grade; scale?: AnswerScale } = {}): Promise<StudyResult> {
    return this.intent(`Study every card, answering ${grade}`, async () => {
      await expect(this.statusLine.or(this.finishedMessage).or(this.nothingMessage)).toBeVisible();
      if ((await this.nothingMessage.isVisible()) || (await this.finishedMessage.isVisible())) return { studied: 0, total: 0 };
      const { total } = await this.position();
      let studied = 0;
      while (!(await this.finishedMessage.isVisible())) {
        await this.reveal();
        if (scale !== undefined) await this.expectScale(scale);
        await this.grade(grade);
        studied += 1;
        if (studied > total) throw new Error(`The session said ${total} cards but went on past them.`);
      }
      return { studied, total };
    });
  }

  async expectFinished(): Promise<void> {
    await expect(this.finishedMessage).toBeVisible();
  }

  async expectNothingToStudy(): Promise<void> {
    await expect(this.nothingMessage).toBeVisible();
  }

  /** "End session": back to Decks. */
  async endSession(): Promise<void> {
    await this.intent("End the session", async () => {
      await this.page.getByRole("main").getByRole("button", { name: this.t("study.endSession"), exact: true }).click();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
    });
  }
}
