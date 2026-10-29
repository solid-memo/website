// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "./appError";
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

/**
 * True for an absolute https: URL without embedded credentials. Every
 * URL that steers authentication (WebID, OIDC issuer) must pass this
 * before it is used.
 */
export function isSecureUrl(value: string): boolean {
  const url = parseUrl(value);
  return url !== null && url.protocol === "https:" && !hasCredentials(url) && isWritableIri(value);
}

const LINKABLE_PROTOCOLS = ["https:", "http:", "mailto:"];

/**
 * True when a value read from a pod may be used as a link target: an
 * http(s) or mailto: URL with no user name or password, which would hide
 * the host it leads to. Pod data is untrusted: anything else
 * (javascript:, data:, `user@host`, …) must stay plain text.
 */
export function isLinkableUrl(value: string): boolean {
  const url = parseUrl(value);
  return url !== null && LINKABLE_PROTOCOLS.includes(url.protocol) && !hasCredentials(url);
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
 * Validate user input as a WebID: an absolute https: URL. Returns the
 * normalized WebID, or the error to show next to the field.
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
  if (url.protocol !== "https:") {
    return { ok: false, error: new AppError("webIdNotHttps") };
  }
  if (hasCredentials(url)) {
    return { ok: false, error: new AppError("webIdWithCredentials") };
  }
  return { ok: true, webId: url.href };
}
