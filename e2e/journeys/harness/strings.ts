// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import en from "@solid-memo/ui/i18n/en.json" with { type: "json" };
import sv from "@solid-memo/ui/i18n/sv.json" with { type: "json" };
import ko from "@solid-memo/ui/i18n/ko.json" with { type: "json" };
import de from "@solid-memo/ui/i18n/de.json" with { type: "json" };
import es from "@solid-memo/ui/i18n/es.json" with { type: "json" };
import fr from "@solid-memo/ui/i18n/fr.json" with { type: "json" };
import studioEn from "@solid-memo/studio/i18n/en.json" with { type: "json" };
import studioSv from "@solid-memo/studio/i18n/sv.json" with { type: "json" };
import studioKo from "@solid-memo/studio/i18n/ko.json" with { type: "json" };
import studioDe from "@solid-memo/studio/i18n/de.json" with { type: "json" };
import studioEs from "@solid-memo/studio/i18n/es.json" with { type: "json" };
import studioFr from "@solid-memo/studio/i18n/fr.json" with { type: "json" };

/**
 * The app's own text, as its i18n files have it (packages/ui/src/i18n,
 * and the Studio's, apps/studio/src/i18n), so
 * a journey finds buttons and messages by what the user reads, in any of its
 * languages, and a change of wording changes the journeys with it.
 */
export type Locale = "en" | "sv" | "ko" | "de" | "es" | "fr";

type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
interface Messages {
  [key: string]: string | Plural | Messages;
}

const isPlural = (node: unknown): node is Plural =>
  typeof node === "object" && node !== null && typeof (node as Plural).other === "string";

/** `ui`'s messages and the Studio's in one, as the page has them once the Studio is open. */
function merged(ui: Messages, studio: Messages): Messages {
  const both: Messages = { ...ui };
  for (const [key, value] of Object.entries(studio)) {
    const mine = both[key];
    both[key] =
      typeof mine === "object" && typeof value === "object" && !isPlural(mine)
        ? merged(mine as Messages, value as Messages)
        : value;
  }
  return both;
}

const CATALOGS: Record<Locale, Messages> = {
  en: merged(en, studioEn),
  sv: merged(sv, studioSv),
  ko: merged(ko, studioKo),
  de: merged(de, studioDe),
  es: merged(es, studioEs),
  fr: merged(fr, studioFr),
};

/**
 * The message at the dotted `key` in `locale`, its `{name}` placeholders
 * filled from `vars`; a plural message picks its form by `vars.count`,
 * by the language's own plural rules, as the app does.
 * Throws for a key with no message, so a renamed key fails loudly.
 */
export function text(
  locale: Locale,
  key: string,
  vars: Record<string, string | number> = {},
): string {
  let node: unknown = CATALOGS[locale];
  for (const part of key.split(".")) node = (node as Messages | undefined)?.[part];
  const message = isPlural(node)
    ? node[new Intl.PluralRules(locale).select(Number(vars.count))]
    : node;
  if (typeof message !== "string")
    throw new Error(
      `${locale}.json has no message ${key}, in packages/ui/src/i18n nor in apps/studio/src/i18n.`,
    );
  // A number is written as the language writes one ("1,000", "1 000"), as the app does.
  const filled = (value: string | number) =>
    typeof value === "number" ? new Intl.NumberFormat(locale).format(value) : value;
  return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? filled(vars[name]) : whole,
  );
}

/** `text` with every character a pattern would read as syntax escaped, to match it literally. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `text` as a pattern matching the whole message, any placeholder left
 * unfilled matching anything and captured by its name: `exec(…).groups`
 * reads "Card 2 of 3" back as `{ position: "2", total: "3" }`.
 */
export function textPattern(
  locale: Locale,
  key: string,
  vars: Record<string, string | number> = {},
): RegExp {
  const parts = text(locale, key, vars).split(/\{(\w+)\}/);
  const pattern = parts
    .map((part, at) => (at % 2 === 0 ? escapeRegExp(part) : `(?<${part}>.+)`))
    .join("");
  return new RegExp(`^${pattern}$`);
}
