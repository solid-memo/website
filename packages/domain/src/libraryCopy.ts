// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Deck } from "./deck";
import type { LibraryDeck } from "./library";
import { librarySeriesUrlOf } from "./libraryLayout";

/**
 * Whether a deck is a copy of any of the library's decks, as isCopyOf
 * tells of each of them. The library's series and release addresses are
 * gathered once, and each deck's series is found once, not once per
 * library deck: telling many decks takes time linear in them and in the
 * library, not in their product.
 */
export function libraryCopyTest(
  library: readonly LibraryDeck[],
): (deck: Pick<Deck, "sourceUrl">) => boolean {
  const series = new Set(library.map((libraryDeck) => libraryDeck.seriesUrl));
  const releases = new Set(
    library.flatMap((libraryDeck) => [
      libraryDeck.url,
      ...libraryDeck.releases.map((release) => release.url),
    ]),
  );
  return ({ sourceUrl }) =>
    sourceUrl !== undefined &&
    (releases.has(sourceUrl) || series.has(librarySeriesUrlOf(sourceUrl)));
}

/**
 * Whether the decks hold a copy of a library deck, as isCopyOf tells of
 * any of them. The decks' release links and their series are gathered
 * once, each link parsed once, not once per library deck: telling many
 * library decks takes time linear in them and in the decks.
 */
export function copiedTest(decks: readonly Deck[]): (libraryDeck: LibraryDeck) => boolean {
  const sources = new Set<string>();
  const series = new Set<string>();
  for (const { sourceUrl } of decks) {
    if (sourceUrl !== undefined) {
      sources.add(sourceUrl);
      series.add(librarySeriesUrlOf(sourceUrl));
    }
  }
  return (libraryDeck) =>
    series.has(libraryDeck.seriesUrl) ||
    sources.has(libraryDeck.url) ||
    libraryDeck.releases.some((release) => sources.has(release.url));
}
