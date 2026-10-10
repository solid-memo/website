import type { DeckLibrary } from "@solid-memo/application/ports";
import { AppError } from "@solid-memo/domain/appError";
import type { LibraryDeckContent } from "@solid-memo/domain/library";
import { draftLibraryDeck } from "@solid-memo/domain/release/draftListing";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { toCourseOutline, toLibraryCards } from "./mappers/libraryMapper";
import { datasetOf, draftQuads } from "./mappers/releaseDraftMapper";

/**
 * A library of one release, the draft as it is in memory (docs/studio.md,
 * The trial): what a Studio trial plays. Nothing of it is kept, as the
 * site's library keeps the releases of decks/, which never change: each
 * read makes it afresh from the draft. Its cards and a course's outline
 * are read from the draft's statements as a release's are; what the
 * release says of itself is what the listing preview shows
 * (draftLibraryDeck), as a draft may not say all of it yet. Any other
 * release is none of it: releaseUnreadable.
 */
export function createDraftDeckLibrary(draft: ReleaseDraft): DeckLibrary {
  /** The draft's statements, for the release at `url` (the draft's own only). */
  function release(url: string) {
    if (url !== draft.url) throw new AppError("releaseUnreadable", { url });
    return datasetOf(draftQuads(draft));
  }
  const listed = () => draftLibraryDeck(draft);

  return {
    async listLibraryDecks() {
      return [listed()];
    },

    async readLibraryIndex() {
      return { url: draft.url, publisher: draft.root.publisher ?? null, releases: [draft.url] };
    },

    async fetchLibraryDeck(url): Promise<LibraryDeckContent> {
      const dataset = release(url);
      const { url: _url, releases: _releases, cardCount: _cardCount, sources: _sources, createdAt: _createdAt, ...about } = listed();
      return { ...about, url, formatVersion: LATEST_VERSION.libraryDeck, cards: toLibraryCards(url, dataset) };
    },

    async fetchCourseOutline(url) {
      return toCourseOutline(url, release(url));
    },
  };
}
