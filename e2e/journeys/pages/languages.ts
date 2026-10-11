// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, type Locator } from "@playwright/test";
import { escapeRegExp } from "../harness/strings.ts";
import type { App } from "./App.ts";

/** A language's name as the app shows it in its current locale ("English", "svenska"). */
export function languageName(app: App, tag: string): string {
  return new Intl.DisplayNames(app.locale, { type: "language" }).of(tag) ?? tag;
}

/**
 * Says which language a text is in with its language picker (the button
 * "Language: …" beside the text): left as it is when it already says
 * `tag` (the app pre-fills the last language used), else opened, the
 * language chosen and closed with Done.
 */
export async function chooseLanguage(app: App, picker: Locator, tag: string): Promise<void> {
  const name = languageName(app, tag);
  const chosen = app.t("language.button", { language: name });
  if ((await picker.textContent())?.trim() === chosen) return;
  await picker.click();
  const panel = app.page.locator(`#${await picker.getAttribute("id")}-panel`);
  await panel.getByRole("radio", { name: new RegExp(`^${escapeRegExp(name)}\\b`) }).check();
  await panel.getByRole("button", { name: app.t("language.done"), exact: true }).click();
  await expect(picker).toHaveText(chosen);
}

/**
 * Says which language a field's text is in (`field`, found by its role
 * and label), with the picker that states it: the button whose text the
 * field is described by, first among what describes it (LangTextField).
 */
export async function chooseLanguageOf(app: App, field: Locator, tag: string): Promise<void> {
  const [said] = (await field.getAttribute("aria-describedby"))!.split(" ");
  await chooseLanguage(
    app,
    app.page.getByRole("button").filter({ has: app.page.locator(`[id="${said}"]`) }),
    tag,
  );
}
