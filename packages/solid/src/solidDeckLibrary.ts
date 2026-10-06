import { getSolidDataset } from "@inrupt/solid-client";
import type { DeckLibrary } from "@solid-memo/application/ports";
import type { LibraryDeck } from "@solid-memo/domain/library";
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
 * worth showing, not an empty library.
 */
export function createSolidDeckLibrary({
  fetch,
  indexUrl,
}: SolidDeckLibraryDeps): DeckLibrary {
  return {
    async listLibraryDecks(): Promise<LibraryDeck[]> {
      return toLibraryDecks(await getSolidDataset(indexUrl, { fetch }));
    },

    async fetchLibraryDeck(url) {
      return toLibraryDeckContent(url, await getSolidDataset(url, { fetch }));
    },
  };
}
