import type { DeckLibrary } from "@solid-memo/application/ports";
import type { LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import { getSolidDatasetLinear } from "./linearDataset";
import { toLibraryDeckContent, toLibraryDecks } from "./mappers/libraryMapper";

export interface SolidDeckLibraryDeps {
  /**
   * Plain fetch: the library is public Turtle published with the site
   * (docs/deck-library.md), readable by anyone, so no authentication is
   * involved.
   */
  fetch: typeof globalThis.fetch;
  /** URL of the library's index document. */
  indexUrl: string;
}

/**
 * Reads the deck library through its index. The library always publishes
 * an index (empty when there are no decks), so a failed read is an error
 * worth showing, not an empty library. Documents are read in one pass
 * (getSolidDatasetLinear): a release of 3,000 cards otherwise takes
 * seconds to read, each time. A release never changes, so each is read
 * once and its content kept, shared by every reader of it, concurrent or
 * later; a failed read is not kept, so the next one tries again. The
 * index is read afresh each time, as new releases come with the site.
 */
export function createSolidDeckLibrary({
  fetch,
  indexUrl,
}: SolidDeckLibraryDeps): DeckLibrary {
  const releases = new Map<string, Promise<LibraryDeckContent>>();
  return {
    async listLibraryDecks(): Promise<LibraryDeck[]> {
      return toLibraryDecks(await getSolidDatasetLinear(indexUrl, { fetch }));
    },

    fetchLibraryDeck(url) {
      let release = releases.get(url);
      if (release === undefined) {
        release = getSolidDatasetLinear(url, { fetch }).then((dataset) => toLibraryDeckContent(url, dataset));
        releases.set(url, release);
        release.catch(() => releases.delete(url));
      }
      return release;
    },
  };
}
