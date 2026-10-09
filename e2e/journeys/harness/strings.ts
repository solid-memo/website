import en from "@solid-memo/ui/i18n/en.json" with { type: "json" };
import sv from "@solid-memo/ui/i18n/sv.json" with { type: "json" };
import ko from "@solid-memo/ui/i18n/ko.json" with { type: "json" };

/**
 * The app's own text, as its i18n files have it (packages/ui/src/i18n), so
 * a journey finds buttons and messages by what the user reads, in any of its
 * languages, and a change of wording changes the journeys with it.
 */
export type Locale = "en" | "sv" | "ko";

type Plural = { one: string; other: string };
interface Messages {
  [key: string]: string | Plural | Messages;
}

const CATALOGS: Record<Locale, Messages> = { en, sv, ko };

const isPlural = (node: unknown): node is Plural =>
  typeof node === "object" && node !== null && typeof (node as Plural).other === "string";

/**
 * The message at the dotted `key` in `locale`, its `{name}` placeholders
 * filled from `vars`; a plural message picks its form by `vars.count`,
 * by the language's own plural rules, as the app does.
 * Throws for a key with no message, so a renamed key fails loudly.
 */
export function text(locale: Locale, key: string, vars: Record<string, string | number> = {}): string {
  let node: unknown = CATALOGS[locale];
  for (const part of key.split(".")) node = (node as Messages | undefined)?.[part];
  const form = isPlural(node) ? new Intl.PluralRules(locale).select(Number(vars.count)) : undefined;
  const message = isPlural(node) ? (form === "one" ? node.one : node.other) : node;
  if (typeof message !== "string") throw new Error(`packages/ui/src/i18n/${locale}.json has no message ${key}.`);
  return message.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
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
export function textPattern(locale: Locale, key: string, vars: Record<string, string | number> = {}): RegExp {
  const parts = text(locale, key, vars).split(/\{(\w+)\}/);
  const pattern = parts.map((part, at) => (at % 2 === 0 ? escapeRegExp(part) : `(?<${part}>.+)`)).join("");
  return new RegExp(`^${pattern}$`);
}
