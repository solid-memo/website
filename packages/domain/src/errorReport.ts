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

/** The stack's first frames, which say where it broke; the rest only make the link long. */
const MAX_FRAMES = 12;

/**
 * An address, written out or URL-encoded (`https%3A%2F%2F…`, as in a
 * route's query), or a blob or data URL; a stop, comma or colon after it
 * is the sentence's. The scheme's length is bounded, so a long word that
 * is no address is passed over in linear time.
 */
const ADDRESS =
  /\b[a-z][a-z0-9+.-]{0,31}(?::\/\/|%3A%2F%2F)(?:[^\s"'<>()[\]{}]*[^\s"'<>()[\]{}.,:;!?])?|\b(?:blob|data):[^\s"'<>()[\]{}]*[^\s"'<>()[\]{}.,:;!?]/gi;

/**
 * `text` with every address in it taken out, so it names no pod, WebID,
 * deck or card, and carries no token in a query. An address in the
 * site's own folder (its scripts, in a stack) keeps its path there,
 * without a query or a hash, since that says where the code broke and
 * nothing about the learner.
 */
export function withoutAddresses(text: string, site: string): string {
  return text.replace(ADDRESS, (address) =>
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
 * `repoUrl`, its Where, Version and Anything else filled in, the last
 * with `details` (errorDetails). What happened and the steps are left to
 * the learner. Opening it sends nothing: the learner reads the form, and
 * submits it or not.
 */
export function errorReportUrl(repoUrl: string, place: ErrorPlace, details: string): string {
  const query = new URLSearchParams({
    template: BUG_FORM,
    where: routeOf(place.hash, place.site),
    version: versionOf(place),
    more: ["```text", details, "```"].join("\n"),
  });
  return `${repoUrl}/issues/new?${query}`;
}
