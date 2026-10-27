// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Whether a Markdown link is followed, and where it leads: only an
 * absolute `https:` URL without a user name or password is
 * (docs/markdown.md). Every other one — `javascript:`, `data:`, `http:`,
 * `mailto:`, a relative or `#/route` link — is shown as its text, so
 * pod data can neither run script, steer the app to a route of its own,
 * fill in a mail, nor hide its host behind `user@`. The host is returned
 * as the URL parser has it (punycode kept), to be shown beside a link
 * whose text is not its URL.
 */
export function liveLink(url: string): { href: string; host: string } | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") return null;
  return { href: parsed.href, host: parsed.host };
}

/**
 * The host a URL as written names, as the URL parser has it (lowercase,
 * punycode), when the parser takes it as written: each label the same
 * but for case, or an international one the parser turns into punycode,
 * and the same port. Null for one with anything the parser would turn
 * into another host — a percent escape, a `user@` before it, an
 * ideographic or full-width dot, a full-width letter, an IPv4 address in
 * short or hexadecimal form, a default port — so that, compared with the
 * host the URL leads to (liveLink), it tells whether the address as
 * written shows where it leads.
 */
export function writtenHost(written: string): string | null {
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(written)?.[1];
  if (authority === undefined || !/^[\p{L}\p{M}\p{N}._-]+(?::\d+)?$/u.test(authority)) return null;
  // Composed first: an accent written as its own mark is the same host.
  const composed = authority.normalize("NFC");
  if (composed.normalize("NFKC") !== composed) return null;
  const url = `https://${authority}/`;
  if (!URL.canParse(url)) return null;
  const host = new URL(url).host;
  const labels = composed.toLowerCase().split(".");
  const parsed = host.split(".");
  const same = (label: string, i: number) =>
    label === labels[i] || (label.startsWith("xn--") && !/^[\x20-\x7e]*$/.test(labels[i]!));
  return parsed.length === labels.length && parsed.every(same) ? host : null;
}
