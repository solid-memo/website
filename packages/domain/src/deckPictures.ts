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
 * The hosts among stored values: each as pictureHost names it, once. A
 * value written any other way (a whole address, say) matches no picture
 * and is left out: the catalog is data anyone may have written. A port
 * counts as a picture's address writes it, which depends on its scheme.
 */
export function storedPictureHosts(values: readonly string[]): string[] {
  return [...new Set(values)].filter(
    (value) =>
      pictureHost(`https://${value}/`) === value || pictureHost(`http://${value}/`) === value,
  );
}

/** The deck with `host` among the hosts whose pictures it shows, or not among them. */
export function withPictureHost(deck: Deck, host: string, shown: boolean): Deck {
  const { pictureHosts: old = [], ...rest } = deck;
  const hosts = old.filter((kept) => kept !== host);
  if (shown) hosts.push(host);
  return hosts.length === 0 ? rest : { ...rest, pictureHosts: hosts };
}
