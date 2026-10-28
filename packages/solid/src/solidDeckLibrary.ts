// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DeckLibrary } from "@solid-memo/application/ports";
import type { Dataset } from "./client/rdf";
import type { CourseOutline } from "@solid-memo/domain/course";
import type { LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import type { LibraryIndexView } from "@solid-memo/domain/release/releaseCheck";
import { catalogLinks } from "./catalogLinks";
import { getSolidDatasetLinear } from "./client/resources";
import { limitedFetch, RELEASE_LIMITS } from "./client/readLimits";
import {
  toCourseOutline,
  toLibraryDeckContent,
  toLibraryDecks,
  toLibraryIndexView,
  toStandaloneLibraryDeck,
} from "./mappers/libraryMapper";
import { releaseReadError, shownReadError } from "./releaseReadError";
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
 * kept, so the next one tries again. The index is read afresh each time
 * it is asked for, as new releases come with the site; the deck list asks
 * once a page (useCopies), since the index changes only with a deploy.
 *
 * A release added from a link (readRelease) is read on its own, afresh
 * each time, with no index: its address may hold anything, now or later,
 * until it is copied. Its creator's catalog (publishedBeside) is read
 * as anyone reads it, as the fetch reads everything: no login is sent.
 * Every release is read under RELEASE_LIMITS, as anyone's server may
 * serve one as it likes (a copy from a link reads its newer releases
 * here too), and so is that catalog; the library's releases are well
 * within them (client/readLimits.test.ts); a release past them is
 * releaseTooLarge, however it is read. The index, which grows with the
 * library and comes with the site, is not.
 */
export function createSolidDeckLibrary({ fetch, indexUrl }: SolidDeckLibraryDeps): DeckLibrary {
  const limited = limitedFetch(fetch, RELEASE_LIMITS);
  const releases = new Map<string, Promise<Dataset>>();
  const contents = new Map<string, Promise<LibraryDeckContent>>();
  const outlines = new Map<string, Promise<CourseOutline>>();
  const indexes = new Map<string, Promise<Dataset>>();
  const decks = new Map<string, Promise<LibraryDeck[]>>();
  const views = new Map<string, Promise<LibraryIndexView>>();

  /** The index's document, read once. */
  function index(): Promise<Dataset> {
    return kept(indexes, indexUrl, () => getSolidDatasetLinear(indexUrl, { fetch }));
  }

  /** The release's document, read once. */
  function release(url: string): Promise<Dataset> {
    return kept(releases, url, () =>
      getSolidDatasetLinear(url, { fetch: limited }).catch((error: unknown) => {
        throw shownReadError(url, error);
      }),
    );
  }

  return {
    listLibraryDecks() {
      return kept(decks, indexUrl, () => index().then(toLibraryDecks));
    },

    readLibraryIndex() {
      return kept(views, indexUrl, () =>
        index().then((dataset) => toLibraryIndexView(indexUrl, dataset)),
      );
    },

    fetchLibraryDeck(url) {
      return kept(contents, url, () =>
        release(url).then((dataset) => toLibraryDeckContent(url, dataset)),
      );
    },

    fetchCourseOutline(url) {
      return kept(outlines, url, () =>
        release(url).then((dataset) => toCourseOutline(url, dataset)),
      );
    },

    async readRelease(url) {
      let dataset: Dataset;
      try {
        dataset = await getSolidDatasetLinear(url, { fetch: limited });
      } catch (error) {
        throw releaseReadError(url, error);
      }
      return toStandaloneLibraryDeck(url, dataset);
    },

    async publishedBeside(url) {
      for (const folder of foldersAbove(url)) {
        // An instance's catalog is `<instance>catalog.ttl`; one that cannot be read is no answer.
        const links = await catalogLinks(folder, SM.publishedRelease, limited).catch(
          (): string[] => [],
        );
        if (links.includes(url)) return links;
      }
      return null;
    },
  };
}

/**
 * How many folders above a release publishedBeside looks for its
 * creator's catalog in: a release is published at
 * `<instance>releases/<name>/v<N>.ttl` unless its creator chooses
 * another folder, so the catalog is three folders up; whoever made the
 * link chose the address, and each folder is one more read.
 */
const MAX_CATALOG_LEVELS = 8;

/** The folders above a document, nearest first, up to its host's root or MAX_CATALOG_LEVELS. */
function foldersAbove(url: string): string[] {
  const folders: string[] = [];
  for (let folder = new URL(".", url); folders.length < MAX_CATALOG_LEVELS; ) {
    folders.push(folder.href);
    if (folder.pathname === "/") break;
    folder = new URL("..", folder);
  }
  return folders;
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
