// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Where an error came up: the build the site runs, the route it was at,
 * and the folder the site is served from (its own scripts' addresses
 * start with it).
 */
export interface ErrorPlace {
  /** The site's version (the root package.json's). */
  version: string;
  /** Full commit hash of the build; null when unknown. */
  commitSha: string | null;
  /** The page's hash when the error came up (`location.hash`). */
  hash: string;
  /** The site's folder, with a trailing slash. */
  site: string;
}

/** The issue form an error is reported with: the repository's .github/ISSUE_TEMPLATE/bug.yml. */
const BUG_FORM = "bug.yml";

/** Longest an error's message is kept; a message can quote a whole document. */
const MAX_MESSAGE = 500;

/** The stack's first frames, which say where it broke; more only lengthen the copied details. */
const MAX_FRAMES = 12;

/**
 * An address, written out, with its slashes escaped as in JSON
 * (`https:\/\/…`), or URL-encoded once or more (`https%3A%2F%2F…`, as
 * in a route's query, or `https%253A%252F%252F…`), an http(s) address
 * with one slash (`https:/host`, which the URL parser takes), with its
 * host an IPv6 one in brackets and its path holding parentheses that
 * close; a tel number (spaces and all), a blob, data, mailto, tel or urn
 * value, or an email address in any script, at localhost or a dotted
 * host (its `@` written out, encoded or encoded twice); a stop, comma,
 * colon or a parenthesis that does not close after it is the sentence's.
 * A scheme's length is bounded, a path's parentheses do not nest, and an
 * email's user starts where its letters do, so a long word that is no
 * address is passed over in time linear in its length.
 */
const ADDRESS =
  /\b(?:https?:(?:\\?\/){1,2}|[a-z][a-z0-9+.-]{0,31}(?::\\?\/\\?\/|%(?:25)*3A%(?:25)*2F%(?:25)*2F))(?:\[[\w:.%-]*\])?(?:(?:[^\s"'<>()[\]{}]|\([^\s"'<>()[\]{}]*\))*(?:[^\s"'<>()[\]{}.,:;!?]|\([^\s"'<>()[\]{}]*\)))?|\btel:\+?[\d ().-]*\d|\b(?:blob|data|mailto|tel|urn):[^\s"'<>()[\]{}]*[^\s"'<>()[\]{}.,:;!?]|(?<![\p{L}\p{M}\p{N}_.%+-])[\p{L}\p{M}\p{N}_.%+-]+(?:@|%40|%2540)(?:localhost\b|[\p{L}\p{M}\p{N}-]+(?:\.[\p{L}\p{M}\p{N}-]+)+)/giu;

/** Where an http(s) scheme may start, however the address after it is written. */
const HTTP = /https?/gi;

/** A space, which ends a word. */
const SPACE = /\s/g;

/** A JSON escape of a slash or a backslash (`\/`, `\\`, `\u002F`, `\u005C`). */
const JSON_ESCAPE = /\\(?:u00(?:2f|5c)|[/\\])/gi;

/** A percent-encoded ASCII character. */
const PERCENT = /%([0-7][\da-f])/gi;

/**
 * How much of a word after its scheme is undone to tell whether it is
 * an address: enough for a host, its escapes and its encodings.
 */
const WINDOW = 2048;

/** How many times JSON escapes and percent-encodings are undone, one inside the other. */
const UNDO_ROUNDS = 8;

/** A character ending a word that is the sentence's or the quote's, not the address's. */
const TRAILING = new Set([".", ",", ":", ";", "!", "?", '"', "'", ">"]);

/** `text` with JSON escapes and percent-encodings undone, as many times over as it holds them. */
function undone(text: string): string {
  let now = text;
  for (let round = 0; round < UNDO_ROUNDS; round += 1) {
    const next = now
      .replace(JSON_ESCAPE, (escaped) => (/[/f]$/i.test(escaped) ? "/" : "\\"))
      .replace(PERCENT, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
    if (next === now) break;
    now = next;
  }
  return now;
}

/** Whether `text` is an http(s) address, as the URL parser reads it (which wants a host for one). */
function isWebAddress(text: string): boolean {
  return /^https?:/i.test(text) && URL.canParse(text);
}

/**
 * Where the address in `text` from `start` to `end` stops: before the
 * stops, commas, quotes and brackets that end the word but close
 * nothing the address opened.
 */
function addressEnd(text: string, start: number, end: number): number {
  // How many more of each bracket the address opens than it closes.
  let parens = 0;
  let squares = 0;
  let braces = 0;
  for (let at = start; at < end; at += 1) {
    const char = text.charAt(at);
    if (char === "(") parens += 1;
    else if (char === ")") parens -= 1;
    else if (char === "[") squares += 1;
    else if (char === "]") squares -= 1;
    else if (char === "{") braces += 1;
    else if (char === "}") braces -= 1;
  }
  let stop = end;
  for (;;) {
    const char = text.charAt(stop - 1);
    if (char === ")" && parens < 0) parens += 1;
    else if (char === "]" && squares < 0) squares += 1;
    else if (char === "}" && braces < 0) braces += 1;
    else if (!TRAILING.has(char)) return stop;
    stop -= 1;
  }
}

/**
 * `text` with every http(s) address in it taken out, however it is
 * written: its slashes escaped as in JSON or with backslashes, encoded
 * once or more, with one slash or none, and with any character in its
 * path. An address is the rest of its word from its scheme on, when
 * that, undone (undone), is an address the URL parser takes; an address
 * in the site's own folder is left for ADDRESS. Only the start of the
 * rest is undone, so the text is gone through in time linear in its
 * length.
 */
function withoutWebAddresses(text: string, site: string): string {
  let kept = "";
  let from = 0;
  let wordEnd = 0;
  for (const { index: start } of text.matchAll(HTTP)) {
    if (start < from) continue;
    if (start >= wordEnd) {
      SPACE.lastIndex = start;
      wordEnd = SPACE.exec(text)?.index ?? text.length;
    }
    const rest = undone(text.slice(start, Math.min(wordEnd, start + WINDOW))).replaceAll("\\", "/");
    if (rest.startsWith(site) || !isWebAddress(rest)) continue;
    kept += `${text.slice(from, start)}<address>`;
    from = addressEnd(text, start, wordEnd);
  }
  return kept + text.slice(from);
}

/**
 * `text` with every address in it taken out: a pod's, a WebID's, a
 * deck's or a card's, an email address, and with them any token in a
 * query. A host written without its scheme is not an address here. An
 * address in the site's own folder (its scripts, in a stack) keeps its
 * path there, without a query or a hash, since that says where the code
 * broke and nothing about the learner.
 */
export function withoutAddresses(text: string, site: string): string {
  return withoutWebAddresses(text, site).replace(ADDRESS, (address) =>
    address.startsWith(site) ? address.slice(site.length).replace(/[?#].*$/, "") : "<address>",
  );
}

/**
 * The route a hash is at, without its query's values, which are the
 * addresses of the instance, the deck or the card it shows:
 * `#/study?instance=&deck=`. The start (`#/`) for no hash.
 */
export function routeOf(hash: string, site: string): string {
  if (hash === "" || hash === "#") return "#/";
  const at = hash.indexOf("?");
  if (at === -1) return withoutAddresses(hash, site);
  const keys = [...new URLSearchParams(hash.slice(at + 1)).keys()];
  const query = keys.map((key) => `${withoutAddresses(key, site)}=`).join("&");
  return `${withoutAddresses(hash.slice(0, at), site)}?${query}`;
}

/** What was thrown, as its name and message, then its stack's frames (when it has a stack). */
function describe(error: unknown): { message: string; frames: string[] } {
  if (!(error instanceof Error)) return { message: String(error), frames: [] };
  const message = `${error.name}: ${error.message}`;
  const stack = error.stack ?? "";
  // Chromium starts a stack with the message; Firefox and Safari list the frames alone.
  const frames = (stack.startsWith(message) ? stack.slice(message.length) : stack)
    .split("\n")
    .filter((line) => line.trim() !== "");
  return { message, frames };
}

/**
 * What a learner can copy, or send in a report, about `error`: the
 * build, the route (routeOf) and the error's message and stack, every
 * address taken out of them (withoutAddresses). Nothing private: no pod
 * address, no WebID, no token, no card's address. Plain English lines,
 * for the maintainer to read whatever language the app was in.
 */
export function errorDetails(error: unknown, place: ErrorPlace): string {
  const { message, frames } = describe(error);
  const shortMessage =
    message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE - 1)}…` : message;
  return [
    `Version: ${versionOf(place)}`,
    `Route: ${routeOf(place.hash, place.site)}`,
    `Error: ${withoutAddresses(shortMessage, place.site)}`,
    ...frames.slice(0, MAX_FRAMES).map((frame) => withoutAddresses(frame, place.site)),
  ].join("\n");
}

/** The build, as the bug form's Version asks for it: the version and the commit the footer links to. */
function versionOf({ version, commitSha }: ErrorPlace): string {
  return commitSha === null ? version : `${version} (${commitSha})`;
}

/**
 * The link that reports an error: the bug form of the repository at
 * `repoUrl`, its Where and Version filled in. The error's details
 * (errorDetails) stay out of it, since a link's query reaches the server
 * as soon as it opens: the learner pastes them from Copy details into
 * the form, and submits it or not. What happened and the steps are left
 * to the learner too.
 */
export function errorReportUrl(repoUrl: string, place: ErrorPlace): string {
  const query = new URLSearchParams({
    template: BUG_FORM,
    where: routeOf(place.hash, place.site),
    version: versionOf(place),
  });
  return `${repoUrl}/issues/new?${query}`;
}
