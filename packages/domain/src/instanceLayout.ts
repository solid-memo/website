// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Deck } from "./deck";
import { documentUrlOf } from "./subjectUrl";

/**
 * Where an instance keeps its documents (see docs/data-model.md): the
 * meta, preferences and catalog documents at fixed names in the
 * container, and one cards and one reviews document per deck, named in
 * the deck's catalog entry.
 */

export function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

export function metaUrlOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}meta.ttl`;
}

export function preferencesUrlOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}preferences.ttl`;
}

export function catalogUrlOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}catalog.ttl`;
}

/** The instance a deck is in: the container of its catalog entry's document. */
export function instanceUrlOfDeck(deckUrl: string): string {
  const catalog = deckUrl.split("#")[0];
  return catalog.slice(0, catalog.lastIndexOf("/") + 1);
}

/**
 * Whether `url` is written as a request sends it: an absolute URL that
 * parsing leaves as it is, with no dot segment (`..`, `%2e%2e`), no
 * default port, no upper case in its scheme or host, and nothing else a
 * request would change.
 */
export function isCanonicalUrl(url: string): boolean {
  return canonicalUrlOf(url) === url;
}

/**
 * An absolute URL as a request would send it (`new URL(text).href`):
 * dot segments resolved, its host in lower case and punycode, a
 * character outside ASCII percent-encoded; null for text that is none.
 * What a pod states may be spelled any way, so an address is compared
 * with another in this form, which is the one fetched.
 */
export function canonicalUrlOf(text: string): string | null {
  try {
    return new URL(text).href;
  } catch {
    return null;
  }
}

/**
 * The address of an instance's folder as the user types or a link
 * names it, as a request sends it (canonicalUrlOf) and ending in a
 * slash; text that is no URL, ending in a slash, for the caller to
 * refuse.
 */
export function instanceAddressOf(text: string): string {
  return ensureTrailingSlash(canonicalUrlOf(text) ?? text);
}

/** Whether a request would send `text` to an http(s) address (canonicalUrlOf) with no query or fragment. */
export function isPlainHttpUrl(text: string): boolean {
  const url = canonicalUrlOf(text);
  return url !== null && /^https?:\/\/[^?#]*$/.test(url);
}

/**
 * Whether the path of `text` has a dot segment (`.`, `..`, `%2e%2e` in
 * any case, with tabs and line breaks a request drops), which a request
 * resolves away: the text then seems to name another folder than the one
 * it leads to.
 */
export function hasDotSegment(text: string): boolean {
  return /[/\\](?:\.|%2e){1,2}(?:[/\\?#]|$)/i.test(text.replace(/[\t\n\r]/g, ""));
}

/**
 * Whether a registration's address may be taken as an instance's as it
 * is written: an http(s) address with no query or fragment
 * (isPlainHttpUrl) and no dot segment (hasDotSegment). Another spelling
 * of the same folder (its host's case, a character outside ASCII) is
 * that folder, as every address made from it is compared as a request
 * sends it.
 */
export function isInstanceAddress(text: string): boolean {
  return isPlainHttpUrl(text) && !hasDotSegment(text);
}

/**
 * What no document Solid Memo keeps in a folder has after the folder's
 * address: a query or fragment, a `;` (a path parameter to some servers),
 * an encoded slash, backslash or percent sign, a NUL, an overlong UTF-8
 * byte (`%c0`, `%c1`), an IIS `%u` escape, a segment that begins with
 * a dot (`.`, `%2e`), or an empty one (`//`, which a client may merge
 * into one slash before it sends the request). A request leaves each as
 * it is, and a server or client may still read one as a step out of the
 * folder or to another document; every document the app names there
 * (`decks/<id>.ttl`, `drafts/<name>/v<N>/…`) has none.
 */
const OUT_OF_PLACE = /[?#;]|%(?:2f|5c|25|00|c0|c1|u)|(?:^|\/)(?:\.|%2e|\/)/i;

/**
 * Whether `url` is the address of a document in the folder `container`,
 * or in one of its folders, as a request would resolve both
 * (canonicalUrlOf): below the folder, not a folder itself, and with
 * nothing after the folder a server might read as a step out of it
 * (OUT_OF_PLACE). A catalog, a type index or a link is data anyone may
 * have written (docs/data-model.md, "Where an instance's documents
 * are"), so an address it names is held to this before Solid Memo reads,
 * writes or deletes there.
 */
export function isDocumentIn(url: string, container: string): boolean {
  const resolved = canonicalUrlOf(url);
  const root = canonicalUrlOf(ensureTrailingSlash(container));
  return (
    resolved !== null &&
    root !== null &&
    resolved.startsWith(root) &&
    !resolved.endsWith("/") &&
    !OUT_OF_PLACE.test(resolved.slice(root.length))
  );
}

/** Whether two addresses are one as a request would send them (canonicalUrlOf). */
export function isSameUrl(a: string, b: string): boolean {
  const resolved = canonicalUrlOf(a);
  return resolved !== null && resolved === canonicalUrlOf(b);
}

/**
 * What no deck's document has in its path, as a request sends it: a
 * `;` (a path parameter to some servers), an encoded slash, backslash or
 * percent sign, a NUL, an overlong UTF-8 byte, an IIS `%u` escape, a
 * segment that begins with a dot, or an empty one (`//`); see
 * OUT_OF_PLACE.
 */
const UNSAFE_PATH = /;|%(?:2f|5c|25|00|c0|c1|u)|\/(?:\.|%2e|\/)/i;

/** A name a server keeps for another resource's access control or metadata. */
const AUXILIARY = /\.(?:acl|acr|meta)$/i;

/**
 * Whether a deck's document may be read at `url`, wherever it is
 * (docs/data-model.md, "Where an instance's documents are"): an http(s)
 * address with no query or fragment (isPlainHttpUrl), no dot segment
 * (hasDotSegment), and, as a request sends it, nothing in its path a
 * server might read as a step elsewhere (UNSAFE_PATH), not a folder,
 * and not another resource's access control or metadata (`.acl`,
 * `.acr`, `.meta`). Its folder and name are free: a pod may be laid out
 * any way, flat at its root too.
 */
export function isSafeDocumentUrl(url: string): boolean {
  if (!isPlainHttpUrl(url) || hasDotSegment(url)) return false;
  const path = new URL(canonicalUrlOf(url)!).pathname;
  return !path.endsWith("/") && !UNSAFE_PATH.test(path) && !AUXILIARY.test(path);
}

/**
 * Whether `url` is one of the instance's own documents, which no deck's
 * may be: its meta, preferences, catalog and digest documents, and any
 * in its `history/`, `drafts/` or `releases/`.
 */
function isInstanceOwnDocument(instanceUrl: string, url: string): boolean {
  const base = ensureTrailingSlash(instanceUrl);
  return (
    [metaUrlOf(base), preferencesUrlOf(base), catalogUrlOf(base), digestUrlOf(base)].some((own) =>
      isSameUrl(url, own),
    ) ||
    ["history/", "drafts/", "releases/"].some((folder) => isDocumentIn(url, `${base}${folder}`))
  );
}

/**
 * Whether `url` may be a deck's document of the instance at
 * `instanceUrl`: one a deck's may be read at (isSafeDocumentUrl), and
 * not one of the instance's own documents.
 */
export function isDeckDocumentAddress(instanceUrl: string, url: string): boolean {
  return isSafeDocumentUrl(url) && !isInstanceOwnDocument(instanceUrl, url);
}

/**
 * Whether a deck can be used: its entry a subject of an instance's
 * catalog (`<instance>catalog.ttl#…`), and its cards and reviews
 * documents where a deck's document may be read (isSafeDocumentUrl), none
 * of them one of the instance's own documents. Where they are is free;
 * whether one may be written to is what it says (ownsDocument). A deck
 * the catalog names otherwise is not read, written or deleted through
 * (docs/data-model.md, "Where an instance's documents are").
 */
export function isDeckInPlace(
  deck: Pick<Deck, "url" | "cardsDocumentUrl" | "reviewsDocumentUrl">,
): boolean {
  const catalog = canonicalUrlOf(documentUrlOf(deck.url));
  if (catalog === null) return false;
  const instance = instanceUrlOfDeck(catalog);
  return (
    catalog === catalogUrlOf(instance) &&
    [deck.cardsDocumentUrl, deck.reviewsDocumentUrl].every((url) =>
      isDeckDocumentAddress(instance, url),
    )
  );
}

/**
 * Whether a deck's document says it is the deck's: the document itself
 * (`<>`) is dcterms:isPartOf the deck's catalog entry (`partOf`, the
 * values it states), compared as a request sends the address. Only
 * someone who may write the document can state it, so it is what lets
 * Solid Memo write to the document or delete it (docs/data-model.md,
 * "Where an instance's documents are"), wherever it is.
 */
export function ownsDocument(partOf: readonly string[], deckUrl: string): boolean {
  return partOf.some((url) => isSameUrl(url, deckUrl));
}

/** Every document the decks use: their cards and reviews documents. */
export function documentsInUse(decks: readonly Deck[]): Set<string> {
  return new Set(decks.flatMap((deck) => [deck.cardsDocumentUrl, deck.reviewsDocumentUrl]));
}

/**
 * The instance's digest document: derived data (domain/studyDigest.ts),
 * not one of the documents an instance is checked by.
 */
export function digestUrlOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}digest.ttl`;
}

/** The container where a new deck's cards document is made, `decks/`; an existing deck's may be anywhere its entry names. */
export function cardsContainerOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}decks/`;
}

/** The container where a new deck's reviews document is made, `reviews/`; an existing deck's may be anywhere its entry names. */
export function reviewsContainerOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}reviews/`;
}

/**
 * The instance's answer log (domain/answer.ts): one document per study
 * month in this container, `history/<YYYY-MM>.ttl`. Source data the
 * statistics are computed from, checked in the full check only.
 */
export function historyContainerOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}history/`;
}

/**
 * The answer log's document for a study month, "YYYY-MM". Any other
 * text throws: a study day may come from a pod, and the document must
 * be one in `history/`.
 */
export function historyUrlOf(instanceUrl: string, month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Not a study month: ${JSON.stringify(month)}`);
  return `${historyContainerOf(instanceUrl)}${month}.ttl`;
}

/** The study month a document of the answer log is for; null for any other resource. */
export function monthOfHistoryUrl(instanceUrl: string, url: string): string | null {
  const container = historyContainerOf(instanceUrl);
  if (!url.startsWith(container)) return null;
  return /^(\d{4}-\d{2})\.ttl$/.exec(url.slice(container.length))?.[1] ?? null;
}

/**
 * The digest subject about a document or deck, `#<kind>-<where>`: where
 * it is under the instance, else its whole URL, with every character
 * but letters, digits, ".", "_" and "-" made a "-".
 */
export function digestSubjectOf(
  instanceUrl: string,
  kind: "receipt" | "schedule",
  target: string,
): string {
  const container = ensureTrailingSlash(instanceUrl);
  const where = target.startsWith(container) ? target.slice(container.length) : target;
  return `${digestUrlOf(instanceUrl)}#${kind}-${where.replace(/[^A-Za-z0-9._-]/g, "-")}`;
}

/** The instance's catalog: the dcat:Catalog subject of its catalog document. */
export function catalogNodeUrlOf(instanceUrl: string): string {
  return `${catalogUrlOf(instanceUrl)}#catalog`;
}

/**
 * A deck group of the instance (domain/deckTree.ts): a subject of its
 * catalog document beside the decks, `#group-<id>`.
 */
export function deckGroupUrlOf(instanceUrl: string, id: string): string {
  return `${catalogUrlOf(instanceUrl)}#group-${id}`;
}

/** Every document an instance may hold, given its decks: fixed ones first, then the decks' documents, by their own address, those a deck's may be (isSafeDocumentUrl). */
export function instanceDocumentUrls(instanceUrl: string, decks: readonly Deck[]): string[] {
  return [
    metaUrlOf(instanceUrl),
    preferencesUrlOf(instanceUrl),
    catalogUrlOf(instanceUrl),
    ...decks
      .flatMap((deck) => [deck.cardsDocumentUrl, deck.reviewsDocumentUrl])
      .map(documentUrlOf)
      .filter(isSafeDocumentUrl),
  ];
}
