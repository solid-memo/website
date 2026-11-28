// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Deck } from "./deck";
import { isOfStudyDayRange } from "./answer";
import { sha256Hex } from "./sha256";
import { documentUrlOf } from "./subjectUrl";

/**
 * Where an instance keeps its documents (see docs/data-model.md): the
 * meta, preferences, palettes and catalog documents at fixed names in
 * the container, and one cards and one reviews document per deck, named
 * in the deck's catalog entry.
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

/** The palettes the user designed (domain/customPalette.ts), one subject each, with their color sets. */
export function palettesUrlOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}palettes.ttl`;
}

/** A palette the user designed, `#palette-<id>` in the instance's palettes document. */
export function paletteUrlOf(instanceUrl: string, id: string): string {
  return `${palettesUrlOf(instanceUrl)}#palette-${id}`;
}

/**
 * Whether `iri` is a subject of the instance's palettes document, as a
 * request would send both (isSameUrl): the only place a palette the
 * preferences name is read from. Any other IRI is a palette this version
 * does not know, and is never fetched.
 */
export function isPaletteOf(instanceUrl: string, iri: string): boolean {
  const hash = iri.indexOf("#");
  return (
    hash > 0 && hash < iri.length - 1 && isSameUrl(iri.slice(0, hash), palettesUrlOf(instanceUrl))
  );
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

/**
 * Whether a request would send `text` to an http(s) address
 * (canonicalUrlOf) with no query or fragment, and no user name or
 * password, which a browser refuses to send at all, failing the request
 * before it reaches the server.
 */
export function isPlainHttpUrl(text: string): boolean {
  const url = URL.parse(text);
  return (
    url !== null &&
    /^https?:\/\/[^?#]*$/.test(url.href) &&
    url.username === "" &&
    url.password === ""
  );
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
 * Two dots in a row anywhere in a path, plain, encoded or mixed, in any
 * case (`span..ish`, `a%2e%2Eb`, `.%2e`). Some servers (JavaScript Solid
 * Server) strip every `..` inside a segment, so `span..ish.ttl` is
 * `spanish.ttl` there: such an address is another spelling of another
 * document, which no comparison of addresses would see.
 */
const DOUBLE_DOT = /(?:\.|%2e){2}/i;

/**
 * A path segment that ends in a dot or a space, plain or encoded, in
 * any case (`deck.ttl.`, `deck.ttl%20`). A file system that drops them
 * (Windows) stores `deck.ttl.` as `deck.ttl`: such an address is another
 * spelling of another document, which no comparison of addresses would
 * see.
 */
const TRAILING_DOT_OR_SPACE = /(?:\.|%2e|%20)(?:\/|$)/i;

/**
 * Another name a Windows file system (NTFS) may give a file: a `:`,
 * plain or encoded, which names a stream of it (`deck.ttl::$DATA` is
 * `deck.ttl`), or a `~` and a digit, plain or encoded, as in a short
 * name (`SPANIS~1.TTL` for `spanish-verbs.ttl`).
 */
const WINDOWS_ALIAS = /:|%3a|(?:~|%7e)\d/i;

/**
 * Whether the path of the absolute URL `url` has an empty segment (`//`)
 * as a request sends it, however it is written (a backslash, a tab, `/.//`):
 * a client may merge it into one slash, or read what follows it as a host.
 */
export function hasEmptySegment(url: string): boolean {
  return new URL(url).pathname.includes("//");
}

/**
 * Whether a registration's address may be taken as an instance's as it
 * is written: an http(s) address with no query or fragment
 * (isPlainHttpUrl), no dot segment (hasDotSegment), no empty segment
 * (hasEmptySegment) and no two dots anywhere in its path (DOUBLE_DOT),
 * as a request sends it. Another spelling of the same folder (its host's
 * case, a character outside ASCII) is that folder, as every address made
 * from it is compared as a request sends it.
 */
export function isInstanceAddress(text: string): boolean {
  return (
    isPlainHttpUrl(text) &&
    !hasDotSegment(text) &&
    !hasEmptySegment(text) &&
    !DOUBLE_DOT.test(new URL(canonicalUrlOf(text)!).pathname)
  );
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
 * (OUT_OF_PLACE), in a folder with no empty segment (isInFolder). A
 * catalog, a type index or a link is data anyone may have written
 * (docs/data-model.md, "Where an instance's documents are"), so an
 * address it names is held to this before Solid Memo reads, writes or
 * deletes there.
 */
export function isDocumentIn(url: string, container: string): boolean {
  return isInFolder(url, container) && !canonicalUrlOf(url)!.endsWith("/");
}

/**
 * Whether `url` is the folder `container` itself, or a document or a
 * folder in it, as a request would resolve both (canonicalUrlOf), with
 * nothing after the folder a server might read as a step out of it
 * (OUT_OF_PLACE): isDocumentIn, folders included. A folder whose own
 * address has an empty segment (hasEmptySegment) holds nothing.
 */
export function isInFolder(url: string, container: string): boolean {
  const resolved = canonicalUrlOf(url);
  const root = canonicalUrlOf(ensureTrailingSlash(container));
  return (
    resolved !== null &&
    root !== null &&
    !hasEmptySegment(root) &&
    resolved.startsWith(root) &&
    !OUT_OF_PLACE.test(resolved.slice(root.length))
  );
}

/**
 * Whether `url` is in one of the user's storages (isInFolder), which
 * only then makes what is there theirs to delete.
 */
export function isInStorages(url: string, storages: readonly { url: string }[]): boolean {
  return storages.some((storage) => isInFolder(url, storage.url));
}

/** Whether two addresses are one as a request would send them (canonicalUrlOf). */
export function isSameUrl(a: string, b: string): boolean {
  const resolved = canonicalUrlOf(a);
  return resolved !== null && resolved === canonicalUrlOf(b);
}

/**
 * A percent-encoded character a document key keeps as it is
 * (documentKeyOf): a slash, a backslash or a percent sign, which decoded
 * would end the segment, start another or merge with what follows.
 */
const KEPT_ESCAPE = /(%(?:2f|5c|25))/i;

/**
 * An escape decoded where it needs no encoding (a letter, a digit, `-`,
 * `.`, `_`, `~`), as a server may decode it, and in upper case otherwise.
 */
function foldUnreserved(text: string): string {
  return text.replace(/%[0-9a-f]{2}/gi, (encoded) => {
    const char = String.fromCharCode(Number.parseInt(encoded.slice(1), 16));
    return /[\w.~-]/.test(char) ? char : encoded.toUpperCase();
  });
}

/**
 * A path segment as a server that decodes it and encodes it again
 * (`encodeURIComponent`) reads it, every escape but a kept one
 * (KEPT_ESCAPE) decoded first, and as a file system that ignores case
 * and Unicode normalization and drops a trailing dot or space stores it:
 * composed (NFC, so `é` and `e` with a combining accent are one), every
 * letter in one case, with no trailing dots or spaces. Letters are
 * brought to lower case, then upper, then lower again, so that `ẞ`, `ß`
 * and `ss` are one, as a file system that folds case fully reads them;
 * this takes some letters as one that a given file system keeps apart,
 * and where the key is used, that only refuses or keeps more. A part that does not decode (a stray `%`, a
 * broken UTF-8 sequence) has only its unreserved escapes decoded and
 * only its ASCII letters in one case: a server keeps such a name as it
 * is written, if at all.
 */
function segmentKeyOf(segment: string): string {
  const key = segment
    .split(KEPT_ESCAPE)
    .map((part, index) => {
      if (index % 2 === 1) return part.toUpperCase();
      try {
        return encodeURIComponent(
          decodeURIComponent(part)
            .normalize("NFC")
            .toLowerCase()
            .toUpperCase()
            .toLowerCase()
            .normalize("NFC"),
        );
      } catch {
        return foldUnreserved(foldUnreserved(part).toLowerCase());
      }
    })
    .join("");
  return withoutTrailingDotsOrSpaces(key);
}

/**
 * `key` without its trailing dots and spaces (`%20`), dropped from the
 * end one at a time and cut once: in time that grows with the text, where
 * a pattern for a trailing run tried at each start inside a run that
 * stops before the end takes time that grows with its square.
 */
function withoutTrailingDotsOrSpaces(key: string): string {
  let end = key.length;
  for (;;) {
    if (key.endsWith(".", end)) end -= 1;
    else if (key.endsWith("%20", end)) end -= 3;
    else return key.slice(0, end);
  }
}

/**
 * A document's address as a server may read it, to tell whether two
 * addresses name one document: as a request sends it (canonicalUrlOf),
 * its host without a trailing dot, which names the same host, and
 * without a user name or password, which a request does not send in the
 * address and which name no other document. An http(s) path is taken
 * segment by segment as a server that decodes each and encodes it again
 * reads it, on a file system that ignores case and drops a trailing dot
 * or space (segmentKeyOf), so `x(y).ttl` and `x%28y%29.ttl`, `a+b` and
 * `a%2Bb`, or `A.ttl`, `a.ttl.` and `a.ttl` are one; an encoded slash,
 * backslash or percent sign stays encoded, so `a%2Fb` and `a/b` are not.
 * Elsewhere an escape of a character that needs no encoding is decoded,
 * and any other is in upper case. Text that is no URL is taken as it is
 * written. Where two addresses being one document keeps data safe (a
 * card transfer, a document another deck still names, an unclaimed
 * document, one of the instance's own), they are compared by this key;
 * reads stay keyed by the address a request sends, so two documents one
 * server keeps apart are each read.
 */
export function documentKeyOf(url: string): string {
  const canonical = canonicalUrlOf(url);
  if (canonical === null) return url;
  const parsed = new URL(canonical);
  parsed.hostname = parsed.hostname.replace(/\.$/, "");
  parsed.username = "";
  parsed.password = "";
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    return foldUnreserved(parsed.href);
  const path = parsed.pathname.split("/").map(segmentKeyOf).join("/");
  return `${parsed.protocol}//${parsed.host}${path}${foldUnreserved(parsed.search + parsed.hash)}`;
}

/**
 * Whether two lists name the same documents, in any order and any
 * spelling a server may read as one (documentKeyOf): as the documents a
 * deck's claim writes to are those the user confirmed.
 */
export function isSameDocuments(one: readonly string[], other: readonly string[]): boolean {
  const keys = new Set(one.map(documentKeyOf));
  const otherKeys = new Set(other.map(documentKeyOf));
  return keys.size === otherKeys.size && [...otherKeys].every((key) => keys.has(key));
}

/**
 * Whether a subject is one of the document at `documentUrl`, and not a
 * subject of another document that this one merely states things of: a
 * fragment is an id only in its own document, so another document's
 * `#card-1` is never this one's. Its document is spelled exactly as
 * `documentUrl` is, as the app writes its subjects, or exactly as the
 * document is fetched (canonicalUrlOf), as a relative IRI is read. Any
 * other spelling of the same address (another host case, the default
 * port, a dot segment) is another subject of the dataset, which would
 * share a fragment with one of the document's own.
 */
export function subjectOfDocument(documentUrl: string): (subjectUrl: string) => boolean {
  const fetched = canonicalUrlOf(documentUrl);
  return (subjectUrl) => {
    const document = documentUrlOf(subjectUrl);
    return document === documentUrl || document === fetched;
  };
}

/**
 * What no deck's document has in its path, as a request sends it: a
 * `;` (a path parameter to some servers), an encoded slash, backslash or
 * percent sign, a NUL, an overlong UTF-8 byte, an IIS `%u` escape, a
 * segment that begins with a dot, an empty one (`//`), two dots
 * anywhere in a segment (DOUBLE_DOT), a segment that ends in a dot or
 * a space (TRAILING_DOT_OR_SPACE), or another name Windows may give a
 * file (WINDOWS_ALIAS); see OUT_OF_PLACE.
 */
const UNSAFE_PATH = new RegExp(
  String.raw`;|%(?:2f|5c|25|00|c0|c1|u)|\/(?:\.|%2e|\/)|${DOUBLE_DOT.source}|${TRAILING_DOT_OR_SPACE.source}|${WINDOWS_ALIAS.source}`,
  "i",
);

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
 * A percent-encoded character that needs no encoding (a letter, a digit,
 * `-`, `.`, `_`, `~`), which a request leaves as it is and a server may
 * decode: `x.ac%6C` is another spelling of `x.acl`.
 */
const ENCODED_UNRESERVED = /%(?:3[0-9]|4[1-9a-f]|5[0-9a]|6[1-9a-f]|7[0-9a]|2d|2e|5f|7e)/i;

/**
 * Whether the pod fence lets a request that writes (any method but GET,
 * HEAD and OPTIONS) go to `url` (docs/boundaries.md, "The pod fence"):
 * an http(s) address with no query or fragment, written as a request
 * sends it (isCanonicalUrl), with no dot segment (hasDotSegment),
 * nothing in its path a server might read as a step elsewhere
 * (UNSAFE_PATH), no character encoded that needs no encoding, and not
 * another resource's access control or metadata (`.acl`, `.acr`,
 * `.meta`, in any case). A folder may be written; which documents may
 * be is the adapters' to say.
 */
export function isSafeWriteUrl(url: string): boolean {
  if (!isCanonicalUrl(url) || !isPlainHttpUrl(url) || hasDotSegment(url)) return false;
  const path = new URL(url).pathname;
  return !UNSAFE_PATH.test(path) && !ENCODED_UNRESERVED.test(path) && !AUXILIARY.test(path);
}

/**
 * Whether `url` is one of the instance's own documents, which no deck's
 * may be: its meta, preferences, palettes, catalog and digest documents,
 * and its `history/`, `drafts/` and `releases/` folders and any document
 * in them, compared as a file system that ignores case may store them
 * (documentKeyOf): `Catalog.ttl` is the catalog there.
 */
export function isInstanceOwnDocument(instanceUrl: string, url: string): boolean {
  const base = ensureTrailingSlash(instanceUrl);
  const key = documentKeyOf(url);
  return (
    [
      metaUrlOf(base),
      preferencesUrlOf(base),
      palettesUrlOf(base),
      catalogUrlOf(base),
      digestUrlOf(base),
    ].some((own) => key === documentKeyOf(own)) ||
    ["history/", "drafts/", "releases/"].some((folder) =>
      key.startsWith(documentKeyOf(`${base}${folder}`)),
    )
  );
}

/**
 * Whether a deck's document says it is the deck's: the document itself
 * (`<>`) is dcterms:isPartOf the deck's catalog entry (`partOf`, the
 * values it states), compared as a request sends the address. Anyone
 * who may append to the document can state it, not only someone who may
 * write it, so it lets Solid Memo write to the document or delete it
 * (docs/data-model.md, "Where an instance's documents are") only in the
 * instance's folder or in the storage the instance is in (deckPlace.ts),
 * and even there it never makes what others wrote in it the deck's: a
 * removal takes out only the cards, distractors and review states of
 * Solid Memo's whose every class is one of theirs and every property
 * one of their shapes', at any version, or the format stamp, the
 * release a card came from or a distractor's schema:suggestedAnswer,
 * and the document's own statement, when that is all it says
 * (ownership.ts deckDocumentSubjects).
 * Solid Memo copies what others wrote into one document only, a draft
 * made from a release, and leaves this out of it; a release or a draft
 * is still no deck's document, whatever it says.
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

/**
 * The study month a document of the answer log is for; null for any
 * other resource, and for a name that is no month of the days
 * shiftStudyDay keeps in order (isOfStudyDayRange): "2027-00" or
 * "2027-13" is none, and no answer is of it.
 */
export function monthOfHistoryUrl(instanceUrl: string, url: string): string | null {
  const container = historyContainerOf(instanceUrl);
  if (!url.startsWith(container)) return null;
  const month = /^(\d{4}-\d{2})\.ttl$/.exec(url.slice(container.length))?.[1];
  // Its 28th is a day of every month, and only of a month 01 to 12.
  return month !== undefined && isOfStudyDayRange(`${month}-28`) ? month : null;
}

/** The longest `where` a digest subject spells out (digestSubjectOf). */
const MAX_DIGEST_WHERE = 256;

/**
 * The digest subject about a document, a deck or a month of the answer
 * log (by its document), `#<kind>-<where>`: where
 * it is under the instance, else its whole URL, with every character
 * but letters, digits, ".", "_" and "-" made a "-". Past
 * MAX_DIGEST_WHERE characters it is `#<kind>~sha256-<hash>`, a hash of
 * `where`: a subject has to stay shorter than the term limit however
 * long the deck's or document's IRI is, and no `where` spelled out can
 * be spelled with a "~". What an entry is about is read from the entry;
 * its subject only has to be its own (toDigest).
 */
export function digestSubjectOf(
  instanceUrl: string,
  kind: "receipt" | "schedule" | "month",
  target: string,
): string {
  const container = ensureTrailingSlash(instanceUrl);
  const where = target.startsWith(container) ? target.slice(container.length) : target;
  const digest = digestUrlOf(instanceUrl);
  if (where.length > MAX_DIGEST_WHERE) {
    return `${digest}#${kind}~sha256-${sha256Hex(codeUnitsOf(where))}`;
  }
  return `${digest}#${kind}-${where.replace(/[^A-Za-z0-9._-]/g, "-")}`;
}

/** `text`'s UTF-16 code units as bytes, low byte first: no two strings give the same, unlike UTF-8, which has no bytes for a lone surrogate. */
function codeUnitsOf(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    bytes[2 * i] = unit & 0xff;
    bytes[2 * i + 1] = unit >>> 8;
  }
  return bytes;
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

/** Every document an instance may hold, given its decks, each address once: fixed ones first, then the decks' documents, by their own address, those a deck's may be (isSafeDocumentUrl). Many decks may name one document. */
export function instanceDocumentUrls(instanceUrl: string, decks: readonly Deck[]): string[] {
  return [
    ...new Set([
      metaUrlOf(instanceUrl),
      preferencesUrlOf(instanceUrl),
      palettesUrlOf(instanceUrl),
      catalogUrlOf(instanceUrl),
      ...decks
        .flatMap((deck) => [deck.cardsDocumentUrl, deck.reviewsDocumentUrl])
        .map(documentUrlOf)
        .filter(isSafeDocumentUrl),
    ]),
  ];
}
