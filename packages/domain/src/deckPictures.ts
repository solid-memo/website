// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Deck } from "./deck";
import { isHttpUrl } from "./webId";

/**
 * Which pictures a deck shows. A picture is a request from the learner's
 * browser to the host its address names, so a deck copied from a release
 * outside the library's index, and any deck of an instance outside the
 * learner's pod, shows one only once the learner chose to show that
 * host's pictures for that deck (docs/privacy.md).
 */

/** The host a picture's address asks, with any port that is not the default; null when it is no http(s) address. */
export function pictureHost(url: string): string | null {
  return isHttpUrl(url) ? new URL(url).host : null;
}

/**
 * How many hosts a deck shows pictures from, as many as MAX_DECK_METADATA
 * allows of its other lists: a catalog and a deck file are data anyone
 * may have written, and the catalog is read and written whole. Past the
 * bound, the last values are left out. It is well above what any deck
 * needs.
 */
export const MAX_PICTURE_HOSTS = 100;

/** How long a host is at most, as long as a DNS name may be. */
const MAX_HOST_LENGTH = 253;

/**
 * The hosts among stored values: each as pictureHost names it, once, the
 * first MAX_PICTURE_HOSTS of them. A value written any other way (a
 * whole address, say) matches no picture and is left out: the catalog
 * is data anyone may have written. A port counts as a picture's address
 * writes it, which depends on its scheme.
 */
export function storedPictureHosts(values: readonly string[]): string[] {
  const hosts = new Set<string>();
  for (const value of values) {
    if (hosts.size === MAX_PICTURE_HOSTS) break;
    if (value.length > MAX_HOST_LENGTH || hosts.has(value)) continue;
    if (pictureHost(`https://${value}/`) === value || pictureHost(`http://${value}/`) === value)
      hosts.add(value);
  }
  return [...hosts];
}

/**
 * The deck with `host` among the hosts whose pictures it shows, or not
 * among them. Shown, it is the last of them, and the first is left out
 * past MAX_PICTURE_HOSTS: the learner's latest choice is the one kept.
 * A host longer than MAX_HOST_LENGTH is never stored, so it is not added
 * and leaves out no other.
 */
export function withPictureHost(deck: Deck, host: string, shown: boolean): Deck {
  const { pictureHosts: old = [], ...rest } = deck;
  let hosts = old.filter((kept) => kept !== host);
  if (shown && host.length <= MAX_HOST_LENGTH) hosts = [...hosts, host].slice(-MAX_PICTURE_HOSTS);
  return hosts.length === 0 ? rest : { ...rest, pictureHosts: hosts };
}
