import type { DeckLibrary } from "@solid-memo/application/ports";
import type { SolidDataset } from "@inrupt/solid-client";
import type { CourseOutline } from "@solid-memo/domain/course";
import type { LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import { AppError } from "@solid-memo/domain/appError";
import { catalogLinks } from "./catalogLinks";
import { getSolidDatasetLinear } from "./linearDataset";
import { toCourseOutline, toLibraryDeckContent, toLibraryDecks, toLibraryIndexView, toStandaloneLibraryDeck } from "./mappers/libraryMapper";
import { SM } from "./vocab";

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
 * once and what is made of it — its content, a course's outline — kept,
 * shared by every reader of it, concurrent or later; a failed read is not
 * kept, so the next one tries again. The index is read afresh each time,
 * as new releases come with the site.
 *
 * A release added from a link (readRelease) is read on its own, afresh
 * each time, with no index: its address may hold anything, now or later,
 * until it is copied. Its creator's catalogue (publishedBeside) is read
 * as anyone reads it, as the fetch reads everything: no login is sent.
 */
export function createSolidDeckLibrary({
  fetch,
  indexUrl,
}: SolidDeckLibraryDeps): DeckLibrary {
  const releases = new Map<string, Promise<SolidDataset>>();
  const contents = new Map<string, Promise<LibraryDeckContent>>();
  const outlines = new Map<string, Promise<CourseOutline>>();

  /** The release's document, read once. */
  function release(url: string): Promise<SolidDataset> {
    return kept(releases, url, () => getSolidDatasetLinear(url, { fetch }));
  }

  return {
    async listLibraryDecks(): Promise<LibraryDeck[]> {
      return toLibraryDecks(await getSolidDatasetLinear(indexUrl, { fetch }));
    },

    async readLibraryIndex() {
      return toLibraryIndexView(indexUrl, await getSolidDatasetLinear(indexUrl, { fetch }));
    },

    fetchLibraryDeck(url) {
      return kept(contents, url, () => release(url).then((dataset) => toLibraryDeckContent(url, dataset)));
    },

    fetchCourseOutline(url) {
      return kept(outlines, url, () => release(url).then((dataset) => toCourseOutline(url, dataset)));
    },

    async readRelease(url) {
      let dataset: SolidDataset;
      try {
        dataset = await getSolidDatasetLinear(url, { fetch });
      } catch {
        throw new AppError("releaseUnreadable", { url });
      }
      return toStandaloneLibraryDeck(url, dataset);
    },

    async publishedBeside(url) {
      for (const folder of foldersAbove(url)) {
        // An instance's catalogue is `<instance>catalog.ttl`; one that cannot be read is no answer.
        const links = await catalogLinks(folder, SM.publishedRelease, fetch).catch((): string[] => []);
        if (links.includes(url)) return links;
      }
      return null;
    },
  };
}

/** The folders above a document, nearest first, up to its host's root. */
function foldersAbove(url: string): string[] {
  const folders: string[] = [];
  for (let folder = new URL(".", url); ; folder = new URL("..", folder)) {
    folders.push(folder.href);
    if (folder.pathname === "/") return folders;
  }
}

/** What `make` makes for the URL, made once and kept; a failure is forgotten, so the next call tries again. */
function kept<T>(cache: Map<string, Promise<T>>, url: string, make: () => Promise<T>): Promise<T> {
  let made = cache.get(url);
  if (made === undefined) {
    made = make();
    cache.set(url, made);
    made.catch(() => cache.delete(url));
  }
  return made;
}
