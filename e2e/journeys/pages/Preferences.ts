import { expect, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";

/**
 * The answer buttons on offer (preferences.answerScale.<scale> in the
 * i18n files): "0 to 5 scale" (the default) or "Again · Hard · Good · Easy".
 */
export type AnswerScale = "sm2" | "minimal";

/**
 * "Study preferences": how many new cards a day, the answer buttons,
 * developer mode. Nothing is kept until save(), which goes back to Decks;
 * reopening (open()) reads what the pod has, for the expect* readbacks.
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

  private get developerMode(): Locator {
    return this.form.getByRole("checkbox", { name: this.t("preferences.developer.mode") });
  }

  /** Opens Preferences from the instance's links, and waits for the saved preferences to be read. */
  async open(): Promise<void> {
    await this.intent("Open the study preferences", async () => {
      await this.app.chrome.openPreferences();
      await expect(this.page.getByRole("heading", { name: this.t("preferences.heading") })).toBeVisible();
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
    await this.intent(`Choose the answer buttons ${this.t(`preferences.answerScale.${scale}.label`)}`, async () => {
      await this.answerButtons(scale).check();
    });
  }

  /** Ticks or clears Developer mode; leaves it be when it already is so. */
  async setDeveloperMode(on: boolean): Promise<void> {
    await this.intent(`Turn developer mode ${on ? "on" : "off"}`, async () => {
      await this.developerMode.setChecked(on);
    });
  }

  /** Saves; the app goes back to Decks once the pod has the preferences. */
  async save(): Promise<void> {
    await this.intent("Save the preferences", async () => {
      await this.form.getByRole("button", { name: this.t("preferences.save"), exact: true }).click();
      await this.app.decks.expectShown();
      await this.app.chrome.expectBreadcrumbHere("breadcrumbs.decks");
    });
  }

  async expectNewCardsPerDay(count: number): Promise<void> {
    await this.intent(`Check that new cards per day is ${count}`, () => expect(this.newCardsPerDay).toHaveValue(String(count)));
  }

  async expectAnswerButtons(scale: AnswerScale): Promise<void> {
    await this.intent(`Check that the answer buttons are ${this.t(`preferences.answerScale.${scale}.label`)}`, () =>
      expect(this.answerButtons(scale)).toBeChecked(),
    );
  }

  async expectDeveloperMode(on: boolean): Promise<void> {
    await this.intent(`Check that developer mode is ${on ? "on" : "off"}`, () => expect(this.developerMode).toBeChecked({ checked: on }));
  }
}
