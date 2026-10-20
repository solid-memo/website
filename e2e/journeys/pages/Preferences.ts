// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import type { Palette } from "../harness/accessibility.ts";
import type { Theme } from "./Chrome.ts";
import { Screen } from "./Screen.ts";

/**
 * The answer buttons on offer (preferences.answerScale.<scale> in the
 * i18n files): "0 to 5 scale" (the default) or "Again · Hard · Good · Easy".
 */
export type AnswerScale = "sm2" | "minimal";

/**
 * The schedulers on offer (preferences.scheduler.<scheduler> in the i18n
 * files): FSRS-6, listed first and recommended, a new instance's, or SM-2.
 */
export type Scheduler = "sm2" | "fsrs6";

/** Each palette's messages (palette.<key> in the i18n files), by its id. */
const PALETTE_MESSAGES: Record<Palette, string> = {
  standard: "standard",
  "high-contrast": "highContrast",
  "color-vision": "colorVision",
  parchment: "parchment",
};

/** The text sizes on offer (textSize.<size> in the i18n files). */
export type TextSize = "default" | "large" | "larger" | "largest";

/**
 * "Study preferences": the appearance (the theme, the colors and the
 * text size, which take effect as they are chosen), how many new cards a
 * day, the scheduler and its desired retention, the answer buttons,
 * developer mode. Nothing is kept until save(), which goes back to
 * Decks (a switch to FSRS-6 is made from the deck list's invitation,
 * DeckList.switchFromSchedulerInvitation); reopening (open()) reads what
 * the pod has, for the expect* readbacks.
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

  private palette(palette: Palette): Locator {
    // A radio's name is its label and its hint: the label is the start of it.
    return this.form
      .getByRole("group", { name: this.t("preferences.palette.legend") })
      .getByRole("radio", {
        name: new RegExp(`^${escapeRegExp(this.paletteName(palette))} `),
      });
  }

  private paletteName(palette: Palette): string {
    return this.t(`palette.${PALETTE_MESSAGES[palette]}.name`);
  }

  private textSize(size: TextSize): Locator {
    return this.form
      .getByRole("group", { name: this.t("preferences.textSize.legend") })
      .getByRole("radio", { name: this.t(`textSize.${size}`), exact: true });
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

  /** FSRS-6 is listed first and marked Recommended; SM-2 is not. */
  async expectFsrsRecommended(): Promise<void> {
    await this.intent("Check that FSRS-6 is listed first, recommended", async () => {
      const group = this.form.getByRole("group", { name: this.t("preferences.scheduler.legend") });
      await expect(group.getByRole("radio").first()).toHaveAccessibleName(
        new RegExp(
          `^${escapeRegExp(`${this.t("preferences.scheduler.fsrs6.label")} ${this.t("preferences.scheduler.recommended")}`)} `,
        ),
      );
      await expect(
        group.getByText(this.t("preferences.scheduler.recommended"), { exact: true }),
      ).toHaveCount(1);
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

  /** Chooses the colors, which the page takes on at once (its root's data-palette, docs/theme.md). */
  async setPalette(palette: Palette): Promise<void> {
    await this.intent(`Choose the colors ${this.paletteName(palette)}`, async () => {
      await this.palette(palette).check();
      await this.expectPalette(palette);
    });
  }

  /** Expects the colors chosen, and the page in them. */
  async expectPalette(palette: Palette): Promise<void> {
    await this.intent(`Check that the colors are ${this.paletteName(palette)}`, async () => {
      await expect(this.palette(palette)).toBeChecked();
      const root = this.page.locator("html");
      if (palette === "standard") await expect(root).not.toHaveAttribute("data-palette");
      else await expect(root).toHaveAttribute("data-palette", palette);
    });
  }

  /** Chooses the text size, which the page takes on at once (its root's data-text-size). */
  async setTextSize(size: TextSize): Promise<void> {
    await this.intent(`Choose the text size ${this.t(`textSize.${size}`)}`, async () => {
      await this.textSize(size).check();
      await this.expectTextSize(size);
    });
  }

  /** Expects the text size chosen, and the page at it. */
  async expectTextSize(size: TextSize): Promise<void> {
    await this.intent(`Check that the text size is ${this.t(`textSize.${size}`)}`, async () => {
      await expect(this.textSize(size)).toBeChecked();
      const root = this.page.locator("html");
      if (size === "default") await expect(root).not.toHaveAttribute("data-text-size");
      else await expect(root).toHaveAttribute("data-text-size", size);
    });
  }

  async expectDeveloperMode(on: boolean): Promise<void> {
    await this.intent(`Check that developer mode is ${on ? "on" : "off"}`, () =>
      expect(this.developerMode).toBeChecked({ checked: on }),
    );
  }
}
