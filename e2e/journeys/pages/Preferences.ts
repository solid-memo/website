// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import type { Theme } from "./Chrome.ts";
import { Screen } from "./Screen.ts";

/**
 * The answer buttons on offer (preferences.answerScale.<scale> in the
 * i18n files): "0 to 5 scale" (the default) or "Again · Hard · Good · Easy".
 */
export type AnswerScale = "sm2" | "minimal";

/** The schedulers on offer (preferences.scheduler.<scheduler> in the i18n files): SM-2 (the default) or FSRS-6. */
export type Scheduler = "sm2" | "fsrs6";

/**
 * "Study preferences": the appearance (the theme), how many new cards a
 * day, the scheduler and its desired retention, the answer buttons,
 * developer mode. Nothing is kept until save(), which goes back to
 * Decks, or saveSwitching(), for a switch to FSRS-6, which says how it
 * went first; reopening (open()) reads what the pod has, for the
 * expect* readbacks.
 */
export class Preferences extends Screen {
  private get form(): Locator {
    return this.page.getByRole("main");
  }

  private get newCardsPerDay(): Locator {
    return this.page.locator("#pref-new");
  }

  private answerButtons(scale: AnswerScale): Locator {
    // A radio's name is its label and its hint: the label is the start of it.
    return this.form
      .getByRole("group", { name: this.t("preferences.answerScale.legend") })
      .getByRole("radio", { name: this.t(`preferences.answerScale.${scale}.label`) });
  }

  private scheduler(scheduler: Scheduler): Locator {
    return this.form
      .getByRole("group", { name: this.t("preferences.scheduler.legend") })
      .getByRole("radio", { name: this.t(`preferences.scheduler.${scheduler}.label`) });
  }

  private get desiredRetention(): Locator {
    return this.page.locator("#pref-retention");
  }

  private get developerMode(): Locator {
    return this.form.getByRole("checkbox", { name: this.t("preferences.developer.mode") });
  }

  /** Opens Preferences from the instance's links, and waits for the saved preferences to be read. */
  async open(): Promise<void> {
    await this.intent("Open the study preferences", async () => {
      await this.app.chrome.openPreferences();
      await expect(
        this.page.getByRole("heading", { name: this.t("preferences.heading") }),
      ).toBeVisible();
      await expect(this.newCardsPerDay).toBeEditable();
    });
  }

  async setNewCardsPerDay(count: number): Promise<void> {
    await this.intent(`Set new cards per day to ${count}`, async () => {
      await this.newCardsPerDay.fill(String(count));
      await expect(this.newCardsPerDay).toHaveValue(String(count));
    });
  }

  async setAnswerButtons(scale: AnswerScale): Promise<void> {
    await this.intent(
      `Choose the answer buttons ${this.t(`preferences.answerScale.${scale}.label`)}`,
      async () => {
        await this.answerButtons(scale).check();
      },
    );
  }

  async setScheduler(scheduler: Scheduler): Promise<void> {
    await this.intent(
      `Choose the scheduler ${this.t(`preferences.scheduler.${scheduler}.label`)}`,
      async () => {
        await this.scheduler(scheduler).check();
        // The retention is FSRS-6's alone, and the answer buttons SM-2's.
        await expect(this.desiredRetention).toBeEnabled({ enabled: scheduler === "fsrs6" });
        await expect(this.answerButtons("minimal")).toBeEnabled({ enabled: scheduler === "sm2" });
      },
    );
  }

  /** Sets FSRS-6's desired retention, a percent; FSRS-6 must be chosen. */
  async setDesiredRetention(percent: number): Promise<void> {
    await this.intent(`Set the desired retention to ${percent}%`, async () => {
      await this.desiredRetention.fill(String(percent));
      await expect(this.desiredRetention).toHaveValue(String(percent));
    });
  }

  /**
   * Saves a switch to FSRS-6: its progress, then how it went, the cards
   * worked out from their answers (`replayed`) and estimated from SM-2
   * (`estimated`), each said only when there are some; Done goes back to
   * Decks.
   */
  async saveSwitching({
    replayed,
    estimated,
  }: {
    replayed: number;
    estimated: number;
  }): Promise<void> {
    await this.intent("Save the preferences, switching to FSRS-6", async () => {
      await this.form
        .getByRole("button", { name: this.t("preferences.save"), exact: true })
        .click();
      const result = this.page.getByRole("region", {
        name: this.t("schedulerSwitch.doneRegion"),
      });
      await expect(result).toBeVisible();
      await expect(result).toBeFocused();
      await expect(result).toContainText(this.t("schedulerSwitch.done"));
      for (const [key, count] of [
        ["schedulerSwitch.replayed", replayed],
        ["schedulerSwitch.estimated", estimated],
      ] as const) {
        if (count > 0) await expect(result).toContainText(this.t(key, { count }));
      }
      await expect(result).toContainText(this.t("schedulerSwitch.dueKept"));
      await result.getByRole("button", { name: this.t("schedulerSwitch.continue") }).click();
      await this.app.decks.expectShown();
    });
  }

  async expectScheduler(scheduler: Scheduler): Promise<void> {
    await this.intent(
      `Check that the scheduler is ${this.t(`preferences.scheduler.${scheduler}.label`)}`,
      () => expect(this.scheduler(scheduler)).toBeChecked(),
    );
  }

  async expectDesiredRetention(percent: number): Promise<void> {
    await this.intent(`Check that the desired retention is ${percent}%`, () =>
      expect(this.desiredRetention).toHaveValue(String(percent)),
    );
  }

  /** Checks or clears Developer mode; leaves it be when it already is so. */
  async setDeveloperMode(on: boolean): Promise<void> {
    await this.intent(`Turn developer mode ${on ? "on" : "off"}`, async () => {
      await this.developerMode.setChecked(on);
    });
  }

  /** Saves; the app goes back to Decks once the pod has the preferences. */
  async save(): Promise<void> {
    await this.intent("Save the preferences", async () => {
      await this.form
        .getByRole("button", { name: this.t("preferences.save"), exact: true })
        .click();
      await this.app.decks.expectShown();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
    });
  }

  async expectNewCardsPerDay(count: number): Promise<void> {
    await this.intent(`Check that new cards per day is ${count}`, () =>
      expect(this.newCardsPerDay).toHaveValue(String(count)),
    );
  }

  async expectAnswerButtons(scale: AnswerScale): Promise<void> {
    await this.intent(
      `Check that the answer buttons are ${this.t(`preferences.answerScale.${scale}.label`)}`,
      () => expect(this.answerButtons(scale)).toBeChecked(),
    );
  }

  /** Expects the choice under Appearance: theme.<choice> ("As my browser" is "system"). */
  async expectTheme(choice: "system" | Theme): Promise<void> {
    await this.intent(`Check that the appearance is ${this.t(`theme.${choice}`)}`, () =>
      expect(
        this.form
          .getByRole("group", { name: this.t("preferences.theme.legend") })
          .getByRole("radio", { name: this.t(`theme.${choice}`), exact: true }),
      ).toBeChecked(),
    );
  }

  async expectDeveloperMode(on: boolean): Promise<void> {
    await this.intent(`Check that developer mode is ${on ? "on" : "off"}`, () =>
      expect(this.developerMode).toBeChecked({ checked: on }),
    );
  }
}
