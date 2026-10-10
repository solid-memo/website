import { createContext, Fragment, type ComponentChildren, type VNode } from "preact";
import { useContext } from "preact/hooks";
import type { DeckDirection } from "@solid-memo/domain/deck";
import type { Violation } from "@solid-memo/domain/validation";
import { AppError, type ErrorVars } from "@solid-memo/domain/appError";
import { shown, shownTag, type LangText } from "@solid-memo/domain/langText";
import { NO_LANGUAGE } from "@solid-memo/domain/languageTag";
import { DEFAULT_LOCALE, type Locale } from "@solid-memo/domain/locale";
import en from "../i18n/en.json";
import sv from "../i18n/sv.json";
import ko from "../i18n/ko.json";

/**
 * A message with a form per plural category its language's plural rules
 * name: "one" and "other" in English and Swedish, only "other" in Korean.
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
 * The key of every message in English, the language every other is
 * checked against: "deckList.heading", a plural message's included.
 */
type KeysOf<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | { other: string }
    ? `${Prefix}${K}`
    : KeysOf<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = KeysOf<typeof en>;

const CATALOGS: Record<Locale, Messages> = { en, sv, ko };

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
  /** How a study direction is named. */
  directionLabel(direction: DeckDirection): string;
  /**
   * What went wrong, for the user: an AppError in this language
   * (`errors.<code>`, its values filled in), its technical detail folded
   * away behind "Technical details" unless `detail` is false (where only
   * a sentence fits, as a status line); a request that never got through
   * as a network failure; any other error as its own message (marked
   * English, and said to be, in another language); null when there is no
   * error.
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

export function createI18n(locale: Locale): I18n {
  const plurals = new Intl.PluralRules(locale);
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
    const message = lookup(CATALOGS[locale], key) ?? key;
    if (typeof message === "string") return message;
    // The message files' tests give each plural message every form its language names.
    return typeof count === "number" ? message[plurals.select(count)]! : message.other;
  }

  const t: I18n["t"] = (key, vars = {}) =>
    template(key, vars.count).replace(PLACEHOLDER, (whole, name: string) =>
      name in vars ? String(vars[name]) : whole,
    );

  const tx: I18n["tx"] = (key, vars) => {
    const pieces = template(key, vars.count).split(PLACEHOLDER);
    // split() puts each placeholder's name at the odd indexes.
    return pieces.map((piece, index) =>
      index % 2 === 0 ? piece : <Fragment key={index}>{piece in vars ? vars[piece] : `{${piece}}`}</Fragment>,
    );
  };

  // A regional tag ("en-gb") on an English page is in the page's language.
  const partLang: I18n["partLang"] = (tag) =>
    tag === undefined || tag === "" || tag === NO_LANGUAGE || tag.split("-")[0] === locale ? undefined : tag;

  const languageParts: I18n["languageParts"] = (tag) => {
    if (tag === NO_LANGUAGE) return { name: t("language.none") };
    const name = languageName(tag);
    if (name.toLowerCase() === tag.toLowerCase()) return { name };
    const autonym = autonymOf(tag);
    const same = autonym === undefined || autonym.toLocaleLowerCase(tag) === name.toLocaleLowerCase(locale);
    return same ? { name, code: writtenTag(tag) } : { name, autonym, code: writtenTag(tag) };
  };

  /** A message whose values are English text, each in its own span, marked as English on another page. */
  function markedEnglish(key: MessageKey, vars: Vars): ErrorText {
    const lang = partLang("en");
    const marked = Object.fromEntries(Object.entries(vars).map(([name, value]) => [name, <span lang={lang}>{value}</span>]));
    return <>{tx(key, marked)}</>;
  }

  /**
   * An error's text with its values filled in: a deck's title (text in
   * several languages) in the reader's language, marked when that is not
   * this page's.
   */
  function errorSentence(key: MessageKey, vars: ErrorVars): ErrorText {
    if (!Object.values(vars).some((value) => typeof value === "object")) return t(key, vars as Vars);
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
    return violation.builtIn === true && lookup(CATALOGS[locale], `validation.constraint.${violation.constraint}`) !== undefined;
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
      return new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
    },
    violationText(violation) {
      if (locale in violation.message) return violation.message[locale];
      if (translatedConstraint(violation)) return t(`validation.constraint.${violation.constraint}` as MessageKey);
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
        if (!detail || error.detail === "") return text;
        // Addresses and statuses are for whoever looks into it: folded away, so the sentence reads plainly.
        return (
          <>
            {text}
            <details class="error-detail">
              <summary>{t("common.technicalDetails")}</summary>
              <code lang={partLang("en")}>{error.detail}</code>
            </details>
          </>
        );
      }
      if (error instanceof TypeError && NETWORK_FAILURE.test(error.message)) return t("common.networkError");
      return markedEnglish("common.unexpectedError", { detail: error instanceof Error ? error.message : String(error) });
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
  /** Speak another language from now on. */
  chooseLocale(locale: Locale): void;
}

const I18nContext = createContext<I18nState>({
  ...createI18n(DEFAULT_LOCALE),
  chooseLocale: () => undefined,
});

/** The language the screens below speak, and how to choose another. */
export function I18nProvider({
  locale,
  onChoose,
  children,
}: {
  locale: Locale;
  onChoose: (locale: Locale) => void;
  children: ComponentChildren;
}) {
  return (
    <I18nContext.Provider value={{ ...createI18n(locale), chooseLocale: onChoose }}>
      {children}
    </I18nContext.Provider>
  );
}

/** The app's text in the language the user reads; English outside a provider. */
export function useI18n(): I18nState {
  return useContext(I18nContext);
}
