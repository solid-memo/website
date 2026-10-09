/**
 * Errors the user may see, each named by a code, so the app can show it in
 * the reader's language: the message catalogues hold every code under
 * `errors.<code>` (packages/ui/src/i18n), the English one exactly as here, which
 * a test holds them to. A text says what went wrong in plain words and
 * what to do about it; the values it leaves out — addresses, statuses, a
 * check's findings — are the error's technical `detail`, for whoever looks
 * into it. An error's `message` is the English text with its values filled
 * in, then its detail, for logs and tests. Errors only a programming
 * mistake can cause stay plain Errors.
 */

import { shown, type LangText } from "./langText";

/** An error's text, or one per plural category, chosen by its `count`. */
export type ErrorTemplate = string | { one: string; other: string };

/**
 * Values for an error text's `{name}` placeholders: a deck's title is its
 * text in every language it has, for the reader to see it in theirs.
 */
export type ErrorVars = Readonly<Record<string, string | number | LangText>>;

export const ERROR_TEMPLATES = {
  cardFrontImageNotWebUrl: "The front image must be an http(s) URL.",
  cardBackImageNotWebUrl: "The back image must be an http(s) URL.",
  cardFrontEmpty: "The front needs text or an image.",
  cardBackEmpty: "The back needs text or an image.",
  deckNeedsDescription: "A deck needs a description.",
  textNeedsLanguage: "Choose the language of {field}.",
  textLanguageInvalid: "“{tag}” is not a language code.",
  textLanguageTaken: "There is already text in {language}. Edit or remove it first.",
  textMixesUnstated: "This text does not say which language it is in, so it cannot have translations. Choose its language first.",
  distractorEmpty: "A wrong option needs text.",
  distractorPublished: "This wrong option is in the release the deck came from, so it cannot be deleted. Retire it instead.",
  dailyLimitInvalid: "A daily limit is a whole number, 0 or more.",
  webIdEmpty: "Enter your WebID.",
  webIdInvalidUrl: "That is not a valid URL. A WebID looks like https://you.example/profile/card#me.",
  webIdNotHttps: "A WebID must start with https://.",
  webIdWithCredentials: "A WebID must not contain a username or password.",
  providerNotHttps: "An identity provider must be an https:// URL.",
  webIdNoSubject:
    "Your WebID profile does not describe you. Check that you entered your WebID exactly, with the part after #, or pick your provider instead.",
  webIdNoIssuer:
    "Your WebID profile does not say where you log in. Pick your provider instead of entering your WebID.",
  webIdIssuerNotHttps:
    "Your WebID profile names a place to log in that is not a secure https:// address. Pick your provider instead of entering your WebID.",
  profileNoSubject:
    "Your profile does not describe you, so Solid Memo cannot note in it where your data is. Check your profile with your Pod provider, then try again.",
  privateTypeIndexNotLinked:
    "Solid Memo could not link its private list of your data from your profile. Check that Solid Memo may edit your profile, then try again.",
  publicTypeIndexNotLinked:
    "Solid Memo could not link its public list of your data from your profile. Check that Solid Memo may edit your profile, then try again.",
  storageInaccessible:
    "Solid Memo cannot open that storage. Check the address, and that you are logged in with the account that owns it.",
  notAnInstanceNoMeta:
    "That address is not a Solid Memo instance. Check that you pasted the address of an instance's folder, ending in /.",
  notAnInstanceNoSubject:
    "That folder is not a Solid Memo instance: its description cannot be read. Check that you pasted the right address.",
  movedCopyInvalid: {
    one: "The copy in your Pod is not in the format Solid Memo expects ({count} problem), so your study is left as it was. Try again later.",
    other: "The copy in your Pod is not in the format Solid Memo expects ({count} problems), so your study is left as it was. Try again later.",
  },
  guestUrlsLeft:
    "The copy in your Pod still points to the guest's study, so your study is left as it was. Try again.",
  guestStudyInvalid: {
    one: "Part of your study in this browser is not in the format Solid Memo expects ({count} problem), so none of it was added to your Pod. It is still here.",
    other: "Part of your study in this browser is not in the format Solid Memo expects ({count} problems), so none of it was added to your Pod. It is still here.",
  },
  guestStudyTooNew:
    "A newer version of Solid Memo saved part of your study in this browser, so this version does not add it to your Pod. Reload the page to get the latest version.",
  guestStudyChanged:
    "Your study in this browser changed while it was being added, perhaps in another tab, so it is kept here. Try again to add what changed.",
  instanceChangedDuringCopy:
    "Your study in this browser changed while it was being copied, perhaps in another tab, so it is kept here. Try again.",
  resourceChangedDuringCopy:
    "Part of your study in this browser changed while it was being copied, perhaps in another tab, so it is kept here. Try again.",
  guestStudyBeingMoved:
    "Solid Memo is moving your study in this browser into your Pod and saves nothing to it until that is done. Wait for it to finish, then try again.",
  deckChangedSinceOffer:
    "The deck changed since the update was offered, perhaps in another tab or app, so nothing was changed. Look at the offer again.",
  deckChangedDuringUpgrade: "The deck changed while it was being updated, perhaps in another tab or app. Try again.",
  changedElsewhere:
    "This was changed elsewhere, perhaps in another tab or app, since Solid Memo read it, so nothing was saved. Reload the page and try again.",
  deckTreeChanged:
    "Your decks were rearranged elsewhere, perhaps in another tab or app, so this change was not made. The list now shows them as they are.",
  writtenByNewerApp:
    "A newer version of Solid Memo has updated this data, so this version does not save over it. Reload the page to get the latest version.",
  deckTreeTooNew:
    "A newer version of Solid Memo arranged these decks, so this one cannot rearrange them. Reload the page to get the latest version.",
  createdElsewhere:
    "This was created elsewhere, perhaps in another tab or app, just as Solid Memo was about to create it, so nothing was saved. Reload the page and try again.",
  alreadyExists: "Something is already kept at that place in your Pod. Choose another place.",
  cannotCheck: "Solid Memo could not check your Pod. Check your connection and try again.",
  dataNotConforming:
    "Solid Memo did not save this: it is not in the format Solid Memo expects. Nothing was changed. Reload the page and try again.",
  deckGone: "The deck “{deck}” no longer exists. Perhaps it was removed in another tab or app.",
  cardsDocumentGone: "The cards of “{deck}” can no longer be found. Reload the page and try again.",
  cardGone: "That card no longer exists. Perhaps it was removed in another tab or app. Reload the page.",
  notADeck: "That is not a Solid Memo deck, so it cannot be added. Choose another deck.",
  libraryDeckTooNew:
    "This deck is in a newer format than this version of Solid Memo can read. Reload the page to get the latest version.",
  libraryCardTooNew:
    "A card in this deck is in a newer format than this version of Solid Memo can read. Reload the page to get the latest version.",
  noGuestPod: "There is no guest study on this device.",
  guestPodStartFailed: "The guest study on this device could not be opened. Reload the page and try again.",
  guestStorageAborted:
    "This browser refused to save a change to the guest study. Check that it has room to keep data, then try again.",
  addFailed: "Solid Memo could not save to your Pod. Check your connection and try again.",
} as const satisfies Record<string, ErrorTemplate>;

export type ErrorCode = keyof typeof ERROR_TEMPLATES;

const PLACEHOLDER = /\{(\w+)\}/g;

/** A value as an English text shows it: text in several languages as its English, else its first. */
function englishValue(value: ErrorVars[string]): string {
  return typeof value === "object" ? shown(value) : String(value);
}

/** An error text with its values filled in, in English (plural by `count`, 1 being singular). */
export function fillTemplate(template: ErrorTemplate, vars: ErrorVars): string {
  const text = typeof template === "string" ? template : vars.count === 1 ? template.one : template.other;
  return text.replace(PLACEHOLDER, (whole, name: string) => (name in vars ? englishValue(vars[name]!) : whole));
}

/** The placeholders an error text names, in any of its plural forms. */
function placeholders(template: ErrorTemplate): Set<string> {
  const texts = typeof template === "string" ? [template] : [template.one, template.other];
  return new Set(texts.flatMap((text) => [...text.matchAll(PLACEHOLDER)].map((match) => match[1]!)));
}

/** The values an error text leaves out, one "name: value" a line; "" when it says them all. */
export function technicalDetail(template: ErrorTemplate, vars: ErrorVars): string {
  const named = placeholders(template);
  return Object.entries(vars)
    .filter(([name]) => !named.has(name))
    .map(([name, value]) => `${name}: ${englishValue(value)}`)
    .join("\n");
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly vars: ErrorVars;
  /** The values the text leaves out, for whoever looks into the error; "" when there are none. */
  readonly detail: string;

  constructor(code: ErrorCode, vars: ErrorVars = {}) {
    const text = fillTemplate(ERROR_TEMPLATES[code], vars);
    const detail = technicalDetail(ERROR_TEMPLATES[code], vars);
    super(detail === "" ? text : `${text}\n${detail}`);
    this.name = "AppError";
    this.code = code;
    this.vars = vars;
    this.detail = detail;
  }
}
