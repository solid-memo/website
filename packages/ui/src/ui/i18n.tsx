// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createContext, Fragment, type ComponentChildren, type VNode } from "preact";
import { useContext } from "preact/hooks";
import type { DeckDirection } from "@solid-memo/domain/deck";
import type { Violation } from "@solid-memo/domain/validation";
import { AppError, type ErrorVars } from "@solid-memo/domain/appError";
import { isolated, shown, shownTag, type LangText } from "@solid-memo/domain/langText";
import { NO_LANGUAGE } from "@solid-memo/domain/languageTag";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@solid-memo/domain/locale";
import { ExternalIcon } from "./icons";
import en from "../i18n/en.json";

/**
 * A message with a form per plural category its language's plural rules
 * name: "one" and "other" in English, Swedish and German, "one", "many"
 * and "other" in Spanish and French, only "other" in Korean.
 * Every language has "other", the form a message without a count takes.
 */
type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
type Message = string | Plural;
interface Messages {
  [key: string]: Message | Messages;
}

/** Values for a message's `{name}` placeholders. */
export type Vars = Record<string, string | number>;

/**
 * What went wrong, for the user: plain text in this language, or markup
 * when part of it is in another (an English detail marked as such).
 */
export type ErrorText = string | VNode;

/** A browser's own words for a request that never reached the server. */
const NETWORK_FAILURE = /fetch|network|load failed/i;

/**
 * The key of every message in an English catalog, the language every
 * other is checked against: "deckList.heading", a plural message's
 * included.
 */
type KeysOf<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | { other: string }
    ? `${Prefix}${K}`
    : KeysOf<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/**
 * The English catalogs whose keys `t` takes, by who holds them: `ui`'s
 * own here, and the Studio's, which apps/studio adds to this interface,
 * so its keys are typed wherever the Studio's code is.
 */
export interface EnglishCatalogs {
  ui: typeof en;
}

/** The key of every message: `ui`'s, and the Studio's where its code is. */
export type MessageKey = {
  [Holder in keyof EnglishCatalogs]: KeysOf<EnglishCatalogs[Holder]>;
}[keyof EnglishCatalogs];

/**
 * A set of messages in each of the app's languages: English at hand, the
 * others each fetched the first time the page speaks it, an `import()`,
 * so a chunk of its own, and a visitor fetches only the language they
 * read (docs/i18n.md). `ui`'s own, and the Studio's, which come with its
 * chunk (addCatalogs).
 */
export interface Catalogs {
  en: Messages;
  others: Record<Exclude<Locale, "en">, () => Promise<{ default: Messages }>>;
}

/** A set of catalogs, and its messages in each language fetched so far. */
interface Source {
  catalogs: Catalogs;
  fetched: Partial<Record<Locale, Messages>>;
}

/** `ui`'s own messages. */
const UI_CATALOGS: Catalogs = {
  en,
  others: {
    sv: () => import("../i18n/sv.json"),
    ko: () => import("../i18n/ko.json"),
    de: () => import("../i18n/de.json"),
    es: () => import("../i18n/es.json"),
    fr: () => import("../i18n/fr.json"),
  },
};

/** Where a message is looked for, first to last: `ui`'s, then those added. */
const sources: Source[] = [{ catalogs: UI_CATALOGS, fetched: { en } }];

async function fetchInto(source: Source, locale: Locale): Promise<void> {
  if (source.fetched[locale] !== undefined) return;
  // English is there from the start, so this is another language.
  source.fetched[locale] = (
    await source.catalogs.others[locale as Exclude<Locale, "en">]()
  ).default;
}

/**
 * Fetch the messages of `locale`, from every set, so that
 * `createI18n(locale)` speaks it; rejects when they cannot be fetched.
 * Until then, a set whose messages in it are not here speaks English.
 */
export async function loadLocale(locale: Locale): Promise<void> {
  // A set added meanwhile (the Studio's) is fetched in it too.
  while (!sources.every((source) => source.fetched[locale] !== undefined))
    await Promise.all(sources.map((source) => fetchInto(source, locale)));
}

/**
 * Add a set of catalogs (the Studio's, once its chunk is here), and fetch
 * its messages in each language the page has fetched `ui`'s in; rejects
 * when they cannot be fetched.
 */
export async function addCatalogs(catalogs: Catalogs): Promise<void> {
  const source: Source = { catalogs, fetched: { en: catalogs.en } };
  sources.push(source);
  const fetched = LOCALES.filter((locale) => sources[0]!.fetched[locale] !== undefined);
  await Promise.all(fetched.map((locale) => fetchInto(source, locale)));
}

/** The message at a dotted key in `locale`, from the first set that has it; undefined when none does. */
function find(locale: Locale, key: string): Message | undefined {
  for (const { catalogs, fetched } of sources) {
    const message = lookup(fetched[locale] ?? catalogs.en, key);
    if (message !== undefined) return message;
  }
  return undefined;
}

function isPlural(node: Message | Messages): node is Plural {
  return typeof node === "object" && typeof node.other === "string";
}

/** The message at a dotted key; undefined when there is none. */
function lookup(messages: Messages, key: string): Message | undefined {
  let node: Message | Messages | undefined = messages;
  for (const part of key.split(".")) {
    if (node === undefined || typeof node === "string" || isPlural(node)) return undefined;
    node = node[part];
  }
  return node === undefined || typeof node === "string" || isPlural(node) ? node : undefined;
}

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * How a deck's card text is shown: as `readerText` and `readerLang`, but
 * in the deck's card language first when it has one (cardReader).
 */
export interface CardReader {
  /** Card text in the deck's card language when the card has it, else as `readerText`. */
  cardText(text: LangText): string;
  /** The language to mark `cardText(text)` with, as `readerLang`. */
  cardLang(text: LangText): string | undefined;
  /** The languages card text is shown in, first to last: what a card's editor starts each text in. */
  cardLanguages(): string[];
}

/** The app's own text in one language, and the language-dependent formatting. */
export interface I18n {
  locale: Locale;
  /**
   * The message at `key`, its `{name}` placeholders filled from `vars`.
   * A plural message picks its form by `vars.count`. Every language has
   * every message (a test holds them to English); a key that names none
   * is shown as itself.
   */
  t(key: MessageKey, vars?: Vars): string;
  /** As `t`, with placeholders filled by markup (a link, emphasis). */
  tx(key: MessageKey, vars: Record<string, ComponentChildren>): ComponentChildren;
  /** Deck text in this language when the deck has it, else in the browser's, else English. */
  readerText(text: LangText): string;
  /**
   * The language to mark `readerText(text)` with, for a screen reader to
   * speak it in its own voice; undefined when it is this page's language
   * or unknown (untagged card text).
   */
  readerLang(text: LangText): string | undefined;
  /**
   * How the card text of a deck whose card language is `language` is
   * shown: in that language first, then as `readerText` (this language,
   * the browser's, English, the first the text has). A card's text
   * follows it (its sides, notes, labels, picture descriptions and
   * wrong options), never a deck's keywords; a deck's title and
   * description only on a course's screens, where all of the course's
   * own text follows it (its chapters' titles and descriptions, its
   * steps' theory). With no language, the same as `readerText` and
   * `readerLang`. A component under a deck's CardLanguage takes it with
   * useCardText; one under a course's CourseLanguage, with useCourseText.
   */
  cardReader(language: string | undefined): CardReader;
  /**
   * The language to mark text tagged `tag` with: as `readerLang`, for a
   * tag already known; undefined, too, for text in no language ("zxx"),
   * which a screen reader speaks in the page's voice.
   */
  partLang(tag: string | undefined): string | undefined;
  /**
   * How a language tag is named: its name in this language ("Swedish"),
   * its name in itself when that differs ("svenska"), and the tag as
   * written ("sv", "pt-BR"). A tag Intl cannot name is its own name, with
   * no code beside it; text in no language ("zxx") is named as such.
   */
  languageParts(tag: string): LanguageParts;
  /** A language tag named in full: "Swedish — svenska (sv)", as `languageParts`. */
  languageLabel(tag: string): string;
  /** A day, written out ("September 22, 2026" / "22 september 2026"). */
  formatDate(iso: string): string;
  /** A month, "YYYY-MM", written out ("March 2025" / "mars 2025"). */
  formatMonth(month: string): string;
  /** A share, 0 to 1, as a whole percentage the way this language writes one ("75%" / "75 %"). */
  formatPercent(share: number): string;
  /** A change, as a share of what it changed from, a whole percentage with its sign ("+20%", "−5 %", "0%"). */
  formatChange(change: number): string;
  /** How a study direction is named. */
  directionLabel(direction: DeckDirection): string;
  /**
   * What went wrong, for the user: an AppError in this language
   * (`errors.<code>`, its values filled in), its technical detail folded
   * away behind "Technical details", after a link to the security
   * advisory that explains it when one does (a login stopped for safety),
   * unless `detail` is false (where only a sentence fits, as a status
   * line); a request that never got through as a network failure; any
   * other error as its own message (marked English, and said to be, in
   * another language); null when there is no error.
   */
  errorText(error: unknown, options?: { detail?: boolean }): ErrorText | null;
  /**
   * What a shape check found, for the user: the shape's message in this
   * language; else, for the validator's own English, a word on the
   * constraint in this language; else the message in English.
   */
  violationText(violation: Violation): string;
  /** The language to mark `violationText(violation)` with, as `partLang`. */
  violationLang(violation: Violation): string | undefined;
  /** A result's severity: "violation", "warning", "info". */
  severityLabel(severity: Violation["severity"]): string;
}

/** A language tag's names: see `I18n.languageParts`. */
export interface LanguageParts {
  name: string;
  autonym?: string;
  code?: string;
}

/*
 * For a tag Intl named (so a well-formed one, which neither of these
 * refuses): a language's name in itself ("svenska"), undefined when Intl
 * has no data in that language; and the tag as BCP 47 writes it
 * ("pt-BR"), where the app keeps it lower case.
 */
function autonymOf(tag: string): string | undefined {
  if (Intl.DisplayNames.supportedLocalesOf([tag]).length === 0) return undefined;
  return new Intl.DisplayNames([tag], { type: "language" }).of(tag);
}

function writtenTag(tag: string): string {
  return Intl.getCanonicalLocales(tag)[0]!;
}

/** The message that is the app's name: Solid Memo in every language, unless the site is given another (`appName`). */
const APP_NAME_KEY: MessageKey = "app.documentTitle";

/**
 * The app's text in `locale`. `appName`, when given, is the site's own
 * name (an app's setting, docs/configuration.md), said in place of
 * Solid Memo's wherever the name stands alone in every language.
 */
export function createI18n(locale: Locale, appName?: string): I18n {
  const plurals = new Intl.PluralRules(locale);
  const numbers = new Intl.NumberFormat(locale);
  const percent = new Intl.NumberFormat(locale, { style: "percent" });
  const change = new Intl.NumberFormat(locale, { style: "percent", signDisplay: "exceptZero" });
  const languageNames = new Intl.DisplayNames(locale, { type: "language" });

  /** A language's name in this language ("engelska"); a tag Intl cannot read, as itself. */
  function languageName(tag: string): string {
    try {
      return languageNames.of(tag)!;
    } catch {
      return tag;
    }
  }

  function template(key: string, count: unknown): string {
    if (key === APP_NAME_KEY && appName !== undefined) return appName;
    const message = find(locale, key) ?? key;
    if (typeof message === "string") return message;
    // The message files' tests give each plural message every form its language names.
    return typeof count === "number" ? message[plurals.select(count)]! : message.other;
  }

  /**
   * A placeholder's value as the message shows it: a number as this
   * language writes one ("1,000", "1 000"), and text written right to left
   * (a card's name in Arabic) isolated from the sentence around it.
   */
  function filled<T>(value: T): T | string {
    if (typeof value === "number") return numbers.format(value);
    return typeof value === "string" ? isolated(value) : value;
  }

  const t: I18n["t"] = (key, vars = {}) =>
    template(key, vars.count).replace(PLACEHOLDER, (whole, name: string) =>
      name in vars ? String(filled(vars[name])) : whole,
    );

  const tx: I18n["tx"] = (key, vars) => {
    const pieces = template(key, vars.count).split(PLACEHOLDER);
    // split() puts each placeholder's name at the odd indexes.
    return pieces.map((piece, index) =>
      index % 2 === 0 ? (
        piece
      ) : (
        <Fragment key={index}>{piece in vars ? filled(vars[piece]) : `{${piece}}`}</Fragment>
      ),
    );
  };

  // A regional tag ("en-gb") on an English page is in the page's language.
  const partLang: I18n["partLang"] = (tag) =>
    tag === undefined || tag === "" || tag === NO_LANGUAGE || tag.split("-")[0] === locale
      ? undefined
      : tag;

  const languageParts: I18n["languageParts"] = (tag) => {
    if (tag === NO_LANGUAGE) return { name: t("language.none") };
    const name = languageName(tag);
    if (name.toLowerCase() === tag.toLowerCase()) return { name };
    const autonym = autonymOf(tag);
    const same =
      autonym === undefined || autonym.toLocaleLowerCase(tag) === name.toLocaleLowerCase(locale);
    return same ? { name, code: writtenTag(tag) } : { name, autonym, code: writtenTag(tag) };
  };

  /** A message whose values are English text, each in its own span, marked as English on another page. */
  function markedEnglish(key: MessageKey, vars: Vars): ErrorText {
    const lang = partLang("en");
    const marked = Object.fromEntries(
      Object.entries(vars).map(([name, value]) => [name, <span lang={lang}>{value}</span>]),
    );
    return <>{tx(key, marked)}</>;
  }

  /**
   * An error's text with its values filled in: a deck's title (text in
   * several languages) in the reader's language, marked when that is not
   * this page's.
   */
  function errorSentence(key: MessageKey, vars: ErrorVars): ErrorText {
    if (!Object.values(vars).some((value) => typeof value === "object"))
      return t(key, vars as Vars);
    const marked = Object.fromEntries(
      Object.entries(vars).map(([name, value]) => {
        if (typeof value !== "object") return [name, value];
        const lang = partLang(shownTag(value, [locale, ...navigator.languages]));
        const text = shown(value, [locale, ...navigator.languages]);
        return [name, lang === undefined ? text : <span lang={lang}>{text}</span>];
      }),
    );
    return <>{tx(key, marked)}</>;
  }

  /** Whether a violation is the validator's own, its constraint worded in this language. */
  function translatedConstraint(violation: Violation): boolean {
    return (
      violation.builtIn === true &&
      find(locale, `validation.constraint.${violation.constraint}`) !== undefined
    );
  }

  return {
    locale,
    t,
    tx,
    readerText(text) {
      return shown(text, [locale, ...navigator.languages]);
    },
    readerLang(text) {
      return partLang(shownTag(text, [locale, ...navigator.languages]));
    },
    cardReader(language) {
      const order = () =>
        language === undefined
          ? [locale, ...navigator.languages]
          : [language, locale, ...navigator.languages];
      return {
        cardText: (text) => shown(text, order()),
        cardLang: (text) => partLang(shownTag(text, order())),
        cardLanguages: order,
      };
    },
    partLang,
    languageParts,
    languageLabel(tag) {
      const { name, autonym, code } = languageParts(tag);
      return `${name}${autonym === undefined ? "" : ` — ${autonym}`}${code === undefined ? "" : ` (${code})`}`;
    },
    formatDate(iso) {
      return new Date(iso).toLocaleDateString(locale, { dateStyle: "long", timeZone: "UTC" });
    },
    formatMonth(month) {
      return new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString(locale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    },
    formatPercent(share) {
      return percent.format(share);
    },
    formatChange(share) {
      return change.format(share);
    },
    violationText(violation) {
      if (locale in violation.message) return violation.message[locale];
      if (translatedConstraint(violation))
        return t(`validation.constraint.${violation.constraint}` as MessageKey);
      return shown(violation.message, [locale]);
    },
    violationLang(violation) {
      if (locale in violation.message || translatedConstraint(violation)) return undefined;
      return partLang(shownTag(violation.message, [locale]));
    },
    severityLabel(severity) {
      return t(`validation.severityLevel.${severity}`);
    },
    errorText(error, { detail = true } = {}) {
      if (error === null || error === undefined) return null;
      if (error instanceof AppError) {
        const text = errorSentence(`errors.${error.code}`, error.vars);
        if (!detail || (error.detail === "" && error.advisory === null)) return text;
        const { advisory } = error;
        // Addresses and statuses are for whoever looks into it: folded away, so the sentence reads plainly.
        return (
          <>
            {text}
            {advisory !== null && (
              <>
                {" "}
                {tx("common.advisory", {
                  // ExternalLink's markup, written out: ExternalLink imports useI18n from here.
                  link: (
                    <a href={advisory.url} hreflang="en" target="_blank" rel="noopener noreferrer">
                      {t("common.advisoryLink", { id: advisory.id })}
                      <ExternalIcon />
                      <span class="visually-hidden"> {t("common.opensInNewTab")}</span>
                    </a>
                  ),
                })}
              </>
            )}
            {error.detail !== "" && (
              <details class="error-detail">
                <summary>{t("common.technicalDetails")}</summary>
                <code lang={partLang("en")}>{error.detail}</code>
              </details>
            )}
          </>
        );
      }
      if (error instanceof TypeError && NETWORK_FAILURE.test(error.message))
        return t("common.networkError");
      return markedEnglish("common.unexpectedError", {
        detail: error instanceof Error ? error.message : String(error),
      });
    },
    directionLabel(direction) {
      switch (direction) {
        case "front-to-back":
          return t("common.direction.frontToBack");
        case "back-to-front":
          return t("common.direction.backToFront");
        case "bidirectional":
          return t("common.direction.bidirectional");
      }
    },
  };
}

interface I18nState extends I18n {
  /**
   * Speak another language from now on, once its messages are here;
   * rejects, the language unchanged, when they cannot be fetched.
   */
  chooseLocale(locale: Locale): Promise<void>;
}

/** Where no language can be chosen: outside a provider, or under one with no `onChoose`. */
const keepLocale = async () => undefined;

const I18nContext = createContext<I18nState>({
  ...createI18n(DEFAULT_LOCALE),
  chooseLocale: keepLocale,
});

/** The language the screens below speak, and how to choose another (none, without `onChoose`). */
export function I18nProvider({
  locale,
  appName,
  onChoose,
  children,
}: {
  locale: Locale;
  /** The site's own name, in place of Solid Memo's (see createI18n). */
  appName?: string;
  /** Speak `locale` (once its messages are fetched: AppShell); a promise that rejects when it cannot. */
  onChoose?: (locale: Locale) => void | Promise<void>;
  children: ComponentChildren;
}) {
  const chooseLocale =
    onChoose === undefined ? keepLocale : async (chosen: Locale) => onChoose(chosen);
  return (
    <I18nContext.Provider value={{ ...createI18n(locale, appName), chooseLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

/** The app's text in the language the user reads; English outside a provider. */
export function useI18n(): I18nState {
  return useContext(I18nContext);
}
