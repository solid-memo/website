// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import uiEnglish from "@solid-memo/ui/i18n/en.json";
import { createI18n } from "@solid-memo/ui/i18n";
import { keysUsed, pluralForms, shape } from "@solid-memo/ui/test/catalogs";
import en from "../i18n/en.json";
import sv from "../i18n/sv.json";
import ko from "../i18n/ko.json";
import de from "../i18n/de.json";
import es from "../i18n/es.json";
import fr from "../i18n/fr.json";
import { STUDIO_CATALOGS } from "./catalogs";

describe("the Studio's message files", () => {
  it.each([
    ["sv", sv],
    ["ko", ko],
    ["de", de],
    ["es", es],
    ["fr", fr],
  ])("say the same things in %s as in English, with the same placeholders", (_locale, messages) => {
    expect(shape(messages)).toEqual(shape(en));
  });

  it.each([
    ["en", en],
    ["sv", sv],
    ["ko", ko],
    ["de", de],
    ["es", es],
    ["fr", fr],
  ])(
    "give each plural message in %s exactly the forms its plural rules name",
    (locale, messages) => {
      const categories = [
        ...new Intl.PluralRules(locale).resolvedOptions().pluralCategories,
      ].sort();
      const forms = pluralForms(messages);
      expect(Object.keys(forms)).not.toEqual([]);
      expect(forms).toEqual(Object.fromEntries(Object.keys(forms).map((key) => [key, categories])));
    },
  );

  it("share no key with ui's, whose message would be said instead", () => {
    const ui = new Set(Object.keys(shape(uiEnglish)));
    expect(Object.keys(shape(en)).filter((key) => ui.has(key))).toEqual([]);
  });

  it("are the catalogs the page adds, in each language", async () => {
    expect(STUDIO_CATALOGS.en).toBe(en);
    expect((await STUDIO_CATALOGS.others.ko()).default).toEqual(ko);
    expect(createI18n("sv").t("studio.shell.nav")).toBe(sv.studio.shell.nav);
  });
});

describe("the Studio's source", () => {
  it("asks only for messages English has, in ui's catalogs or the Studio's", () => {
    const known = new Set([...Object.keys(shape(uiEnglish)), ...Object.keys(shape(en))]);
    const missing = [...keysUsed(join(import.meta.dirname, ".."))].filter((key) => !known.has(key));
    expect(missing).toEqual([]);
  });
});
