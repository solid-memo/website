// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Errors the user may see, each named by a code, so the app can show it in
 * the reader's language: the message catalogs hold every code under
 * `errors.<code>` (packages/ui/src/i18n), the English one exactly as here, which
 * a test holds them to. A text says what went wrong in plain words and
 * what to do about it; the values it leaves out — addresses, statuses, a
 * check's findings — are the error's technical `detail`, for whoever looks
 * into it. An error Solid Memo raises to keep the user safe may name the
 * security advisory that explains it (`advisory`), which the app links
 * to after its text. An error's `message` is the English text with its
 * values filled in, then its detail, then its advisory's address, for
 * logs and tests. Errors only a programming mistake can cause stay plain
 * Errors.
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
  textMixesUnstated:
    "This text does not say which language it is in, so it cannot have translations. Choose its language first.",
  distractorEmpty: "A wrong option needs text.",
  distractorPublished:
    "This wrong option is in the release the deck came from, so it cannot be deleted. Retire it instead.",
  dailyLimitInvalid: "A daily limit is a whole number, 0 or more.",
  dueDayInvalid: "“{day}” is not a day. Choose the day the card is due.",
  cardTransferSameDeck: "The cards are in this deck already. Choose another deck.",
  licenseUnknown: "Choose one of the licenses offered.",
  authorEmpty: "An author needs a name.",
  authorTwice: "{author} is named twice. Name each author once.",
  instanceNameEmpty: "An instance needs a name.",
  paletteNameEmpty: "A palette needs a name.",
  paletteUnreadable:
    "The text is too faint to read on the background (less than 3:1). Choose colors further apart.",
  paletteContrastLow:
    "Some colors have less contrast than they need. Choose others, or use them anyway.",
  catalogNeedsDescription: "The catalog needs a description.",
  noCatalogToUpdate: "This instance has no catalog yet. Update the instance in Solid Memo first.",
  noMetaToUpdate: "This instance has no description to update. Reload the page and try again.",
  webIdEmpty: "Enter your WebID.",
  webIdInvalidUrl:
    "That is not a valid URL. A WebID looks like https://you.example/profile/card#me.",
  webIdNotHttps: "A WebID must start with https://.",
  webIdWithCredentials: "A WebID must not contain a username or password.",
  providerNotHttps: "An identity provider must be an https:// URL.",
  webIdNoSubject:
    "Your WebID profile does not describe you. Check that you entered your WebID exactly, with the part after #, or pick your provider instead.",
  webIdNoIssuer:
    "Your WebID profile does not say where you log in. Pick your provider instead of entering your WebID.",
  webIdIssuerNotHttps:
    "Your WebID profile names a place to log in that is not a secure https:// address. Pick your provider instead of entering your WebID.",
  loginIssuerMissing:
    "Your provider did not say which provider it is, so Solid Memo stopped the login for safety. Log in again, or pick another provider.",
  loginIssuerMismatch:
    "You came back from another provider than the one you logged in at, so Solid Memo stopped the login for safety. Log in again.",
  loginNotStarted:
    "Solid Memo did not start this login in this tab, so it stopped the login for safety. Log in again in this tab.",
  profileNoSubject:
    "Your profile does not describe you, so Solid Memo cannot note in it where your data is. Check your profile with your Pod provider, then try again.",
  privateTypeIndexNotLinked:
    "Solid Memo could not link its private list of your data from your profile. Check that Solid Memo may edit your profile, then try again.",
  publicTypeIndexNotLinked:
    "Solid Memo could not link its public list of your data from your profile. Check that Solid Memo may edit your profile, then try again.",
  typeIndexNoStorage:
    "Your profile names no storage of yours, so Solid Memo has nowhere to keep its list of your data. Ask your Pod provider to add your Pod's storage to your profile, then try again.",
  storageInaccessible:
    "Solid Memo cannot open that storage. Check the address, and that you are logged in with the account that owns it.",
  notAnInstanceNoMeta:
    "That address is not a Solid Memo instance. Check that you pasted the address of an instance's folder, ending in /.",
  notAnInstanceNoSubject:
    "That folder is not a Solid Memo instance: its description cannot be read. Check that you pasted the right address.",
  movedCopyInvalid: {
    one: "The copy in your Pod is not in the format Solid Memo expects ({count} problem), so your study is left as it was. Try again later.",
    other:
      "The copy in your Pod is not in the format Solid Memo expects ({count} problems), so your study is left as it was. Try again later.",
  },
  guestUrlsLeft:
    "The copy in your Pod still points to the guest's study, so your study is left as it was. Try again.",
  guestStudyInvalid: {
    one: "Part of your study in this browser is not in the format Solid Memo expects ({count} problem), so none of it was added to your Pod. It is still here.",
    other:
      "Part of your study in this browser is not in the format Solid Memo expects ({count} problems), so none of it was added to your Pod. It is still here.",
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
  writeRefused:
    "Solid Memo stopped a change to your Pod for safety: it would have been saved at an address Solid Memo never saves to. Nothing was changed.",
  writeOutsidePod:
    "Solid Memo did not save this: it is kept on {host}, outside your Pod, and Solid Memo saves only to your Pod. Nothing was changed.",
  redirectRefused:
    "Solid Memo stopped a change to your Pod for safety: your Pod sent it on to another address, and Solid Memo saves only at the address it asked for.",
  deckChangedSinceOffer:
    "The deck changed since the update was offered, perhaps in another tab or app, so nothing was changed. Look at the offer again.",
  deckChangedDuringUpgrade:
    "The deck changed while it was being updated, perhaps in another tab or app. Try again.",
  changedElsewhere:
    "This was changed elsewhere, perhaps in another tab or app, since Solid Memo read it, so nothing was saved. Reload the page and try again.",
  deckTreeChanged:
    "Your decks were rearranged elsewhere, perhaps in another tab or app, so this change was not made. The list now shows them as they are.",
  writtenByNewerApp:
    "A newer version of Solid Memo has updated this data, so this version does not save over it. Reload the page to get the latest version.",
  idTakenInDeck:
    "Solid Memo did not save this: it would have mixed up the cards and wrong options of this deck. Nothing was changed.",
  deckTreeTooNew:
    "A newer version of Solid Memo arranged these decks, so this one cannot rearrange them. Reload the page to get the latest version.",
  createdElsewhere:
    "This was created elsewhere, perhaps in another tab or app, just as Solid Memo was about to create it, so nothing was saved. Reload the page and try again.",
  alreadyExists: "Something is already kept at that place in your Pod. Choose another place.",
  cannotCheck: "Solid Memo could not check your Pod. Check your connection and try again.",
  podNoAnswer: "The server did not answer in time. Check your connection and try again.",
  dataNotConforming:
    "Solid Memo did not save this: it is not in the format Solid Memo expects. Nothing was changed. Reload the page and try again.",
  deckGone: "The deck “{deck}” no longer exists. Perhaps it was removed in another tab or app.",
  cardsDocumentGone: "The cards of “{deck}” can no longer be found. Reload the page and try again.",
  deckDocumentUnclaimed:
    "Solid Memo did not change “{deck}”: its documents do not say they belong to this deck. Nothing was changed. Where the data check lists the deck, confirm that they are its documents, then try again.",
  cardGone:
    "That card no longer exists. Perhaps it was removed in another tab or app. Reload the page.",
  notADeck: "That is not a Solid Memo deck, so it cannot be added. Choose another deck.",
  libraryIdsRepeat:
    "This deck gives two of its cards or wrong options the same id, so Solid Memo cannot read it. Ask its creator to check it.",
  libraryDeckTooNew:
    "This deck is in a newer format than this version of Solid Memo can read. Reload the page to get the latest version.",
  libraryCardTooNew:
    "A card in this deck is in a newer format than this version of Solid Memo can read. Reload the page to get the latest version.",
  deckFileUnreadable:
    "Solid Memo cannot read that file. Choose a Turtle or JSON-LD file exported from Solid Memo.",
  notADeckFile:
    "That file does not hold one Solid Memo deck. Choose a file exported from Solid Memo.",
  deckFileTooNew:
    "That file was written by a newer version of Solid Memo, so this one cannot import it. Reload the page to get the latest version.",
  deckFileTooLarge:
    "That file is larger than any deck Solid Memo reads, so it was not read. Choose a smaller file.",
  noGuestPod: "There is no guest study on this device.",
  guestPodStartFailed:
    "The guest study on this device could not be opened. Reload the page and try again.",
  guestStorageAborted:
    "This browser refused to save a change to the guest study. Check that it has room to keep data, then try again.",
  addFailed: "Solid Memo could not save to your Pod. Check your connection and try again.",
  unwritableTerm:
    "Solid Memo did not save this: it holds an address that cannot be written to a Pod as it is. Nothing was changed.",
  draftGone: "That draft no longer exists. Perhaps it was deleted in another tab or app.",
  releaseUnreadable:
    "Solid Memo cannot read a release at {url}. Check the address, and that the release is published there.",
  releaseTooLarge:
    "The release at {url} is larger than any release Solid Memo reads, so it was not read. Check the address, or ask the release's creator about it.",
  notAReleaseFile:
    "That file does not hold one deck or course release. Choose a release saved as Turtle or JSON-LD.",
  draftIdUnsupported:
    "This draft names a part of it “#{id}”, which a draft cannot keep: an id of a draft is letters A to Z, digits, “.”, “_” and “-”, starting with a letter or digit. Solid Memo does not open or change it.",
  releaseIdUnsupported:
    "This release names a part of it “#{id}”, which a draft cannot keep: an id of a draft is letters A to Z, digits, “.”, “_” and “-”, starting with a letter or digit. It cannot be made a draft.",
  releaseForeignPart:
    "This release holds a card, chapter, step or wrong option at {part}, outside the release itself. The Studio shows and checks only a release's own parts, so it cannot be made a draft.",
  releaseForeignStatement:
    "This draft states something of {subject}, the address of the release it would make or a part of it, which the Studio neither shows nor checks, so the release was not made. Publish it in another folder of your pod, or make a new draft that does not state it.",
  draftAliasedSubject:
    "A document of this draft states something of {subject}, one of the draft's own addresses, which the Studio neither shows nor checks, so the release was not made. Make the draft again from its release, or copy it: the copy leaves that out.",
  draftHiddenValue:
    "This draft states {predicate} of {subject} otherwise than the Studio reads it: a value it does not keep, such as a second one where it keeps one or a second text in one language, or a value of the wrong kind or not well formed. Nothing shows or checks that value, so Solid Memo neither opens nor publishes the draft. Correct the value with another app, or delete the draft.",
  releaseTaken:
    "A release is already published at {url}, and a release is never written over. Publish the next version, or choose another folder.",
  releaseHasErrors: {
    one: "The release check finds {count} error. Fix it before you publish the release.",
    other: "The release check finds {count} errors. Fix them before you publish the release.",
  },
  draftReleased:
    "This draft was released already, at {url}, and is no longer changed. Start its next version instead.",
  guestCannotPublish:
    "A guest's study is kept in this browser alone, where no one else can read a release. Move your study into a Pod to publish it, or download the release as a file.",
  publicAccessRefused:
    "Your Pod did not let Solid Memo make the release at {url} public, so only you can read it. Try again, or make it readable by everyone with your Pod provider's tools.",
  releaseUrlInvalid:
    "That is not the address of a release. Paste its whole address, starting with https:// or http://.",
  releaseNotConforming: {
    one: "The release on {host} breaks Solid Memo's rules in {count} place, so it cannot be added. Ask its creator to check it.",
    other:
      "The release on {host} breaks Solid Memo's rules in {count} places, so it cannot be added. Ask its creator to check it.",
  },
} as const satisfies Record<string, ErrorTemplate>;

export type ErrorCode = keyof typeof ERROR_TEMPLATES;

/** A security advisory: its id ("GHSA-…"), and the page that publishes it. */
export interface Advisory {
  id: string;
  url: string;
}

/**
 * Where upstream's security advisories are published. Not the site's
 * repository (VITE_REPO_URL): an advisory belongs to Solid Memo's own
 * repository, and a fork's has none of them.
 */
const ADVISORIES_URL = "https://github.com/solid-memo/website/security/advisories";

/** The security advisory that explains an error, by its code: the fix that made Solid Memo raise it. */
const ERROR_ADVISORIES: Partial<Record<ErrorCode, string>> = {
  // A provider's answer must name its issuer (RFC 9207), against an OIDC mix-up.
  loginIssuerMissing: "GHSA-vrcx-39mp-3746",
  loginIssuerMismatch: "GHSA-vrcx-39mp-3746",
  loginNotStarted: "GHSA-vrcx-39mp-3746",
};

/** The security advisory that explains an error; null when none does. */
function advisoryOf(code: ErrorCode): Advisory | null {
  const id = ERROR_ADVISORIES[code];
  return id === undefined ? null : { id, url: `${ADVISORIES_URL}/${id}` };
}

const PLACEHOLDER = /\{(\w+)\}/g;

/** A value as an English text shows it: text in several languages as its English, else its first. */
function englishValue(value: ErrorVars[string]): string {
  return typeof value === "object" ? shown(value) : String(value);
}

/** An error text with its values filled in, in English (plural by `count`, 1 being singular). */
export function fillTemplate(template: ErrorTemplate, vars: ErrorVars): string {
  const text =
    typeof template === "string" ? template : vars.count === 1 ? template.one : template.other;
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    name in vars ? englishValue(vars[name]!) : whole,
  );
}

/** The placeholders an error text names, in any of its plural forms. */
function placeholders(template: ErrorTemplate): Set<string> {
  const texts = typeof template === "string" ? [template] : [template.one, template.other];
  return new Set(
    texts.flatMap((text) => [...text.matchAll(PLACEHOLDER)].map((match) => match[1]!)),
  );
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
  /** The security advisory that explains the error, for the user to read more; null when none does. */
  readonly advisory: Advisory | null;

  constructor(code: ErrorCode, vars: ErrorVars = {}) {
    const text = fillTemplate(ERROR_TEMPLATES[code], vars);
    const detail = technicalDetail(ERROR_TEMPLATES[code], vars);
    const advisory = advisoryOf(code);
    const lines = [text, detail, advisory === null ? "" : `advisory: ${advisory.url}`];
    super(lines.filter((line) => line !== "").join("\n"));
    this.name = "AppError";
    this.code = code;
    this.vars = vars;
    this.detail = detail;
    this.advisory = advisory;
  }
}
