// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "./appError.ts";
/** Outcome of validating user input as a WebID. */
export type WebIdValidation = { ok: true; webId: string } | { ok: false; error: AppError };

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** What Turtle leaves out of an IRI written between `<` and `>` (IRIREF), controls and space aside. */
const NOT_IN_IRI = new Set('<>"{}|^`\\');

/**
 * True for a value Turtle can write as an IRI (`<…>`) as it is: no
 * control character, space or one of `<>"{}|^`\`. A URL parser keeps
 * these in a fragment, and a writer that does not escape them ends the
 * IRI there, so the rest is read as statements of their own
 * (GHSA-x937-hx25-qfp4).
 */
export function isWritableIri(value: string): boolean {
  for (const character of value) {
    if (character.codePointAt(0)! <= 0x20 || NOT_IN_IRI.has(character)) return false;
  }
  return true;
}

function hasCredentials(url: URL): boolean {
  return url.username !== "" || url.password !== "";
}

/** An IPv4 address in 127.0.0.0/8, as the URL parser writes one. */
const LOOPBACK_IPV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * True for a host on this machine: `localhost`, a name under
 * `.localhost`, an address in 127.0.0.0/8 or `[::1]`, the hosts a
 * browser counts as potentially trustworthy. Requests to them never
 * leave the machine, so plain http there is no less safe than https.
 */
function isLoopbackHost(url: URL): boolean {
  const host = url.hostname;
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    LOOPBACK_IPV4.test(host) ||
    host === "[::1]"
  );
}

/** True for an https: URL, or an http: one to a loopback host (isLoopbackHost), any port. */
function isSecureProtocol(url: URL): boolean {
  return url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHost(url));
}

/**
 * True for an absolute https: URL, or http: to a loopback host such as
 * a pod run locally, without embedded credentials. Every URL that steers
 * authentication (WebID, OIDC issuer) must pass this before it is used.
 */
export function isSecureUrl(value: string): boolean {
  const url = parseUrl(value);
  return url !== null && isSecureProtocol(url) && !hasCredentials(url) && isWritableIri(value);
}

/**
 * True when the browser may be sent to `issuer` to log in as `webId`
 * (isSecureUrl), and a plain-http issuer only for a WebID on a loopback
 * host too: a profile on the web can't send the learner to a server on
 * their own machine.
 */
export function isSecureIssuerOf(issuer: string, webId: string): boolean {
  if (!isSecureUrl(issuer)) return false;
  if (new URL(issuer).protocol === "https:") return true;
  const webIdUrl = parseUrl(webId);
  return webIdUrl !== null && isLoopbackHost(webIdUrl);
}

const LINKABLE_PROTOCOLS = ["https:", "http:", "mailto:"];

/**
 * True when a value read from a pod may be used as a link target: an
 * http(s) URL with no user name or password, which would hide the host
 * it leads to, or a mailto: URL with no query or fragment, which would
 * fill in more of the mail than the address it shows
 * (GHSA-hmqq-ppqh-66f9). Pod data is untrusted: anything else
 * (javascript:, data:, `user@host`, …) must stay plain text.
 */
export function isLinkableUrl(value: string): boolean {
  const url = parseUrl(value);
  if (url === null || !LINKABLE_PROTOCOLS.includes(url.protocol) || hasCredentials(url)) {
    return false;
  }
  return url.protocol !== "mailto:" || (url.search === "" && url.hash === "");
}

/**
 * True for an absolute http(s) URL: what may be loaded into the page as
 * an image. Narrower than isLinkableUrl, which also allows mailto:.
 */
export function isHttpUrl(value: string): boolean {
  const url = parseUrl(value);
  return url !== null && (url.protocol === "https:" || url.protocol === "http:");
}

/**
 * Validate user input as a WebID: an absolute https: URL, or http: to a
 * loopback host (isSecureUrl). Returns the normalized WebID, or the
 * error to show next to the field.
 */
export function validateWebId(input: string): WebIdValidation {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: false, error: new AppError("webIdEmpty") };
  }
  const url = parseUrl(trimmed);
  if (url === null || !isWritableIri(url.href)) {
    return { ok: false, error: new AppError("webIdInvalidUrl") };
  }
  if (!isSecureProtocol(url)) {
    return { ok: false, error: new AppError("webIdNotHttps") };
  }
  if (hasCredentials(url)) {
    return { ok: false, error: new AppError("webIdWithCredentials") };
  }
  return { ok: true, webId: url.href };
}
