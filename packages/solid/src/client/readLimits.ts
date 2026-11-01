// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad, Term } from "@rdfjs/types";
import { ReadLimitError, type ReadLimits } from "./interface";

/**
 * The most the app reads of a release: a wide margin over the largest
 * release in the library (decks/), about 2.4 MB, 40,000 triples and 8.5
 * million characters of terms. A release is anyone's to make, one added
 * from a link is read as soon as its link is opened, and the app keeps
 * every triple of what it reads, so one with no end would hold the tab
 * until it ran out of memory.
 */
export const RELEASE_LIMITS: ReadLimits = {
  bytes: 32 * 1024 * 1024,
  quads: 400_000,
  characters: 64 * 1024 * 1024,
};

/**
 * The most the app reads of an instance's document outside the user's
 * storages (ownPodGate.ts), read as no one or, in an instance they
 * registered on another server, as them, and of an instance's meta
 * document anywhere: as much as of a release (RELEASE_LIMITS), which
 * holds a deck's cards as an instance's largest documents do. An
 * instance anyone may make can be added by its address or registered by
 * another app, a catalog may name a deck's documents on any server, and
 * the app keeps every triple of what it reads. The user's storages are
 * read with no limits but on their declarations (writeTurtle).
 */
export const FOREIGN_LIMITS: ReadLimits = RELEASE_LIMITS;

/**
 * The most the app reads of a release's access control as it makes the
 * release public (solidReleasePublisher.ts), on a server that may be
 * anyone's: an ACL or ACR holds a few rules, so a wide margin over that
 * is far less than a release may be.
 */
export const ACCESS_CONTROL_LIMITS: ReadLimits = {
  bytes: 1024 * 1024,
  quads: 10_000,
  characters: 4 * 1024 * 1024,
};

/**
 * What a read with no limits is refused under, by the one bound every
 * read keeps: a Turtle text's base and prefix declarations
 * (writeTurtle). Its body, its triples and their terms are not bounded.
 */
export const NO_SIZE_LIMITS: ReadLimits = {
  bytes: Number.POSITIVE_INFINITY,
  quads: Number.POSITIVE_INFINITY,
  characters: Number.POSITIVE_INFINITY,
};

/** The statuses whose responses have no body (Fetch Standard, "null body status"). */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/** Each response limitedFetch gave: the limits it is read under, and how it went past them, once it did. */
const READS = new WeakMap<Response, { limits: ReadLimits; refused?: ReadLimitError }>();

/**
 * The fetch, its answers read under `limits`: a body larger than they
 * allow fails as it is read, once past the limit, or at once with a
 * ReadLimitError when its Content-Length says so, and the request is
 * canceled. A body read fails as the browser fails it, so the reason is
 * kept apart (refusalOf). The triples are counted where the body is
 * parsed (getSolidDatasetLinear), which asks limitsOf for the response's.
 */
export function limitedFetch(
  fetch: typeof globalThis.fetch,
  limits: ReadLimits,
): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    // A status with no body (a 304 to a conditional read) has nothing to limit, and no response with a body can be made of it.
    if (response.body === null || NULL_BODY_STATUSES.has(response.status)) return response;
    const { url } = response;
    if (Number(response.headers.get("Content-Length")) > limits.bytes) {
      await response.body.cancel();
      throw new ReadLimitError(url, limits);
    }
    const read: { limits: ReadLimits; refused?: ReadLimitError } = { limits };
    let bytes = 0;
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes <= limits.bytes) return controller.enqueue(chunk);
          read.refused = new ReadLimitError(url, limits);
          controller.error(read.refused);
        },
      }),
    );
    const limited = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    // A response made here has no URL of its own; the library names the document by it.
    Object.defineProperty(limited, "url", { value: url });
    READS.set(limited, read);
    return limited;
  };
}

/** The limits a response is read under: limitedFetch's, or none. */
export function limitsOf(response: Response): ReadLimits | undefined {
  return READS.get(response)?.limits;
}

/** Why the body of a response limitedFetch gave failed to be read: past its limit; undefined when it was not, or there was no response. */
export function refusalOf(response: Response | undefined): ReadLimitError | undefined {
  return response === undefined ? undefined : READS.get(response)?.refused;
}

/**
 * A tally of the triples parsed under `limits`, and of the characters of
 * their terms (subject, predicate, object with its datatype and
 * language, graph): a prefix lets a short line of Turtle, or a context
 * a short line of JSON-LD, stand for terms as long as it is, so a
 * document's bytes do not bound what its triples hold. Each call counts
 * one triple, and says whether the count is now past either limit; never
 * with no limits.
 */
export function quadTally(limits: ReadLimits | undefined): (quad: Quad) => boolean {
  if (limits === undefined) return () => false;
  let quads = 0;
  let characters = 0;
  return ({ subject, predicate, object, graph }) => {
    quads++;
    characters += length(subject) + length(predicate) + length(object) + length(graph);
    return quads > limits.quads || characters > limits.characters;
  };
}

/**
 * The most base declarations (`@base`, `BASE`) a Turtle text may make,
 * read under limits or with none. The parser resolves each against the one before it,
 * walking the whole base each time, and a declaration makes no triple
 * for quadTally to count. A document needs one at most; each release in
 * the library has one.
 */
const MAX_BASE_DECLARATIONS = 16;

/**
 * The most prefix declarations (`@prefix`, `PREFIX`) a Turtle text may
 * make, read under limits or with none. The parser resolves the IRI of each against
 * the base, walking the whole base, and a declaration makes no triple
 * for quadTally to count. A document needs a few; the bound leaves a
 * wide margin over that.
 */
const MAX_PREFIX_DECLARATIONS = 4096;

/**
 * The most characters the base of a Turtle text may reach, read under
 * limits or with none. The parser walks the whole base for each relative IRI it
 * resolves, and a triple's terms can be far shorter than the base (an
 * IRI that goes up a level), so the read limits on the triples bound
 * the time only with the base bounded too. A release names itself as
 * its base, so this is about the longest address it can have.
 */
export const MAX_BASE_CHARACTERS = 512;

const SPACE = 0x20;
const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
const HASH = 0x23;
const LESS_THAN = 0x3c;
const GREATER_THAN = 0x3e;
const AT_SIGN = 0x40;
const BACKSLASH = 0x5c;

/** An IRI with a scheme, which a base resolves to on its own, as the Turtle parser tells one. */
const ABSOLUTE_IRI = /^[a-z][a-z0-9+.-]*:/i;

/** A `.` or `..` segment of a path. */
const DOT_SEGMENT = /(?:^|\/)\.\.?(?:$|\/)/;

/**
 * Where the search of a Turtle text stops to look: a string, an IRI, an
 * escape, a comment, or what may start a directive.
 */
const NEXT = /["'<\\#@bBpP]/g;

/**
 * Where an IRI the parser reads stops: at its `>`, or at what no IRI
 * holds as it is written, where there is none. The parser refuses an
 * IRI with any other character an IRI can't hold, once it has read it.
 */
const IRI_STOP = /[ <>{}]|\\(?![uU])/g;

/** A directive with an at sign, as the parser reads one: a longer word is none. */
const AT_DIRECTIVE = /@(base|prefix)(?![a-z])/iy;

/** A directive in SPARQL's form, as the parser reads one, in any case. */
const DIRECTIVE = /(base|prefix)(?=[\s#<"'])/iy;

/** What a name goes on with: a directive in SPARQL's form starts no later than the name does. */
const IN_NAME = /[\w:-]/;

/**
 * Whether a declared base, the IRI as written, has a plain path: no
 * empty segment, no escape that could stand for a segment, and no `.`
 * or `..` segment but in a relative path with no colon. The parser
 * keeps an absolute base as it is written, and walks such segments of
 * it again for every IRI it resolves against it; no release the app
 * writes has one. A relative path it resolves against the base before,
 * which removes its dot segments, as a document written by hand may
 * have them (`@base <./>`). One that starts at the root it resolves on
 * its own, and there it takes a colon for the end of a scheme and
 * keeps the segment after it.
 */
export function plainBase(iri: string): boolean {
  if (iri.includes("\\")) return false;
  const scheme = ABSOLUTE_IRI.exec(iri)?.[0].length ?? 0;
  let path = iri.slice(scheme);
  if (scheme > 0 && path.startsWith("//")) {
    const authority = path.slice(2).search(/[/?#]/);
    path = authority < 0 ? "" : path.slice(2 + authority);
  }
  const query = path.search(/[?#]/);
  if (query >= 0) path = path.slice(0, query);
  const resolved = scheme === 0 && !path.startsWith("/") && !path.includes(":");
  return !path.includes("//") && (resolved || !DOT_SEGMENT.test(path));
}

/** Where the IRI that starts at `at` (its `<`) of a Turtle text ends, as the parser reads it: -1 when none does. */
function iriEnd(text: string, at: number): number {
  IRI_STOP.lastIndex = at + 1;
  const stop = IRI_STOP.exec(text)?.index ?? -1;
  return text.charCodeAt(stop) === GREATER_THAN ? stop + 1 : -1;
}

/**
 * Where the string that starts at `at` of a Turtle text ends, as the
 * parser ends it: at the first of its quotes (three of them for a long
 * string) that no escape takes, or at the end of the text. A string the
 * parser refuses, such as a short one over two lines, ends the parse
 * there, so what the search makes of the rest is the same.
 */
function stringEnd(text: string, at: number): number {
  const quote = text[at]!;
  const closing = text.startsWith(quote.repeat(3), at) ? quote.repeat(3) : quote;
  let from = at + closing.length;
  for (;;) {
    const found = text.indexOf(closing, from);
    if (found < 0) return text.length;
    let escapes = 0;
    while (text.charCodeAt(found - escapes - 1) === BACKSLASH) escapes++;
    if (escapes % 2 === 0) return found + closing.length;
    from = found + 1;
  }
}

/**
 * Whether the base and prefix declarations of a Turtle text read as
 * `url`, those that start before an offset of the text, are past what
 * any read takes in, under limits or with none: more than
 * MAX_BASE_DECLARATIONS bases, more than MAX_PREFIX_DECLARATIONS
 * prefixes, a base whose path is not plain (plainBase), or a base of
 * more than MAX_BASE_CHARACTERS. A document needs one base and a few
 * prefixes, and the parser takes time in the square of a chain of
 * relative bases, wherever the text is read from. Each call looks on
 * from where the last stopped, so a text is looked through once, as far
 * as it is written (writeTurtle), in time linear in it.
 *
 * The search reads the text as the parser does: past strings (with
 * their escapes), IRIs and comments, where a declaration is only text,
 * a directive (`@base`, `@prefix`, or `BASE`, `PREFIX` in any case) is
 * one where the parser could start one, and a base's IRI the first after
 * it, past white space and comments: a `<` there with no IRI of at most
 * MAX_BASE_CHARACTERS from it is past the limits. Where the two could
 * differ, the search errs toward a refusal, or the parser stops at an
 * error before it. The longest base the parser can reach is then the
 * longest of the URL and the absolute IRIs, with every relative IRI
 * added on.
 */
function declarationsPast(text: string, url: string): (end: number) => boolean {
  const lineEnd = /[\n\r]/g;
  let bases = 0;
  let prefixes = 0;
  let longest = url.length;
  let added = 0;

  /** Where the parser reads the next token from `from` on, past white space and comments. */
  const pastSeparators = (from: number): number => {
    let at = from;
    for (;;) {
      const code = text.charCodeAt(at);
      if (code === SPACE || code === TAB || code === LF || code === CR) at++;
      else if (code === HASH) {
        lineEnd.lastIndex = at;
        at = lineEnd.exec(text)?.index ?? text.length;
      } else return at;
    }
  };

  /** Whether the directive `word`, which ends at `from`, declares one past the limits. */
  const declarationPast = (word: string, from: number): boolean => {
    if (word.length !== 4) return ++prefixes > MAX_PREFIX_DECLARATIONS;
    const at = pastSeparators(from);
    // With no IRI next, the parser stops at an error.
    if (text.charCodeAt(at) !== LESS_THAN) return false;
    if (++bases > MAX_BASE_DECLARATIONS) return true;
    // An IRI no longer than a base may be, or one the parser stops at.
    const end = iriEnd(text.slice(at, at + MAX_BASE_CHARACTERS + 2), 0);
    if (end < 0) return true;
    const iri = text.slice(at + 1, at + end - 1);
    if (!plainBase(iri)) return true;
    if (ABSOLUTE_IRI.test(iri)) longest = Math.max(longest, iri.length);
    else added += iri.length;
    return longest + added > MAX_BASE_CHARACTERS;
  };

  // The document's own address is its first base: a Turtle text at a longer one is refused, with limits or with none.
  let refused = url.length > MAX_BASE_CHARACTERS;

  /** Where the search goes on after what starts at `at`, having checked a directive there. */
  const lookAt = (at: number): number => {
    const code = text.charCodeAt(at);
    if (code === HASH) {
      lineEnd.lastIndex = at;
      return lineEnd.exec(text)?.index ?? text.length;
    }
    if (code === BACKSLASH) return at + 2;
    if (code === LESS_THAN) {
      const end = iriEnd(text, at);
      return end < 0 ? at + 1 : end;
    }
    if (text[at] === '"' || text[at] === "'") return stringEnd(text, at);
    const directive =
      code === AT_SIGN ? AT_DIRECTIVE : IN_NAME.test(text[at - 1] ?? "") ? undefined : DIRECTIVE;
    if (directive === undefined) return at + 1;
    directive.lastIndex = at;
    const word = directive.exec(text)?.[1];
    if (word === undefined) return at + 1;
    refused = declarationPast(word, directive.lastIndex);
    return directive.lastIndex;
  };

  // Where the search goes on from: past all it looked at.
  let searched = 0;
  return (end) => {
    while (!refused && searched < end) {
      NEXT.lastIndex = searched;
      const next = NEXT.exec(text)?.index ?? text.length;
      searched = next < end ? lookAt(next) : next;
    }
    return refused;
  };
}

/** A stream as the Turtle parser reads one: it listens for its parts (`data`) and its `end`. */
export interface TextStream {
  on(event: string, listener: (part?: string) => void): void;
}

/**
 * Parse a Turtle text read as `url`, by a parser that
 * reads streams: `parse` hands it the text as one (n3's parser reads
 * such an object, as its own stream parser hands it one), and the text
 * is written to it in parts (textChunks), then ended, while `goOn` says
 * to. A parser given the whole text goes on through all of it after the
 * tally is past its limits; here it reads no further than the part it
 * is in. Before each part, the base and prefix declarations that start
 * in it, or before, are checked (declarationsPast), with limits or with
 * none: false when they are past what a read takes in, and the rest is
 * not written; true otherwise.
 */
export function writeTurtle(
  text: string,
  url: string,
  parse: (stream: TextStream) => void,
  goOn: () => boolean,
): boolean {
  const listeners = new Map<string, (part?: string) => void>();
  parse({ on: (event, listener) => void listeners.set(event, listener) });
  const past = declarationsPast(text, url);
  let end = 0;
  for (const part of textChunks(text)) {
    end += part.length;
    if (past(end)) return false;
    if (!goOn()) return true;
    listeners.get("data")?.(part);
  }
  if (!goOn()) return true;
  // The parser ends only a text it was given some of: an empty one is a blank one to it.
  if (end === 0) listeners.get("data")?.(" ");
  listeners.get("end")?.();
  return true;
}

function length(term: Term): number {
  if (term.termType !== "Literal") return term.value.length;
  return term.value.length + term.datatype.value.length + term.language.length;
}

/** How many characters of a text a parser is written at a time (textChunks). */
const TEXT_CHUNK = 4096;

/**
 * A text in parts of TEXT_CHUNK characters, none ending inside a
 * character (a surrogate pair), for a streaming parser to be written one
 * part at a time. A parser written the whole text in one call goes on
 * through all of it after the tally is past its limits; one written in
 * parts can be stopped (destroyed) between them, with the rest unread.
 */
export function* textChunks(text: string): Generator<string> {
  for (let start = 0; start < text.length; ) {
    let end = start + TEXT_CHUNK;
    const last = text.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end++;
    yield text.slice(start, end);
    start = end;
  }
}
