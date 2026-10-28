// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { isHttpUrl } from "./webId";

/**
 * Where a mistake in a release is reported (docs/deck-library.md,
 * Reporting a mistake): the library's issue tracker for a release the
 * library lists, whatever contact its version names; for a release from
 * a link, the web page its own contact names (dcat:contactPoint's
 * vcard:hasURL), when it names one.
 */
export type ReportPlace = { library: true } | { library: false; contact?: string };

/** True for a contact page a report may lead to: an http(s) address with no `user@` before the host. */
function isContactPage(contact: string): boolean {
  if (!isHttpUrl(contact)) return false;
  const { username, password } = new URL(contact);
  return username === "" && password === "";
}

/** The issue form a mistake in a library release is reported with: the repository's .github/ISSUE_TEMPLATE/deck.yml. */
const DECK_FORM = "deck.yml";

/**
 * The link that reports a mistake in the release at `releaseUrl`, in
 * the card `cardId` (its fragment) when given, the release as a whole
 * otherwise. For a library release it opens the deck form of the
 * repository at `repoUrl` with its fields filled in: the release, and
 * the card's address with a line asking what is wrong. For a release
 * from a link it is the release's contact page, which no one fills in
 * for it. Null when there is nowhere to report it: a release from a
 * link with no web page for a contact (an http(s) address with no user
 * name or password before the host), or a library release with no
 * repository known (`repoUrl` null). The library's tracker is never
 * the place to report someone else's release.
 */
export function mistakeReportUrl(
  place: ReportPlace,
  repoUrl: string | null,
  releaseUrl: string,
  cardId?: string,
): string | null {
  if (!place.library)
    return place.contact !== undefined && isContactPage(place.contact) ? place.contact : null;
  if (repoUrl === null) return null;
  const card = cardId === undefined ? [] : [`Card: ${releaseUrl}#${cardId}`, ""];
  const query = new URLSearchParams({
    template: DECK_FORM,
    deck: releaseUrl,
    details: [...card, "What is wrong, and what should it say instead?"].join("\n"),
  });
  return `${repoUrl}/issues/new?${query}`;
}
