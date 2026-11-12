// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DeckLibrary, LinkedReleaseReads } from "@solid-memo/application/ports";
import type { Dataset } from "./client/rdf";
import type { CourseOutline } from "@solid-memo/domain/course";
import type { DocumentReport } from "@solid-memo/domain/validation";
import type { LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import type { LibraryIndexView } from "@solid-memo/domain/release/releaseCheck";
import { isPublishedReleaseUrl, releaseInstanceOf } from "@solid-memo/domain/release/releasePlace";
import { isDocumentIn } from "@solid-memo/domain/instanceLayout";
import { AppError } from "@solid-memo/domain/appError";
import { releaseHost } from "@solid-memo/domain/library";
import { catalogLinks } from "./catalogLinks";
import { ReadLimitError, type ReadLimits } from "./client/interface";
import { getSolidDatasetLinear } from "./client/resources";
import { limitedFetch, noneSpent, RELEASE_LIMITS, type ReadsSpent } from "./client/readLimits";
import {
  toCourseOutline,
  toLibraryDeckContent,
  toLibraryDecks,
  toLibraryIndexView,
  toStandaloneLibraryDeck,
} from "./mappers/libraryMapper";
import {
  linkedReadsSpent,
  linkedReleasesTooLarge,
  releaseReadError,
  shownReadError,
  type TooLarge,
} from "./releaseReadError";
import { isStorageRootAt } from "./deckPlace";
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
  /**
   * What the library's shapes say of a release as read
   * (ShaclShapeValidator.validateDataset, "library"): a release added
   * from a link is checked as readRelease reads it, that read alone.
   */
  validate: (url: string, dataset: Dataset) => Promise<DocumentReport>;
}

/**
 * The most the reads of releases from a link, and their catalogs, take
 * in together in a page session, whatever reads them: twice what one
 * release may hold, so many times the largest release in the library. A
 * catalog may name a thousand decks, each with a release on any server,
 * and the app holds every triple of what it reads while it reads it.
 * Once read, a document counts once, by its largest read, while reads of
 * it again come out of LINKED_REREADS.
 */
const LINKED_READS_BUDGET: ReadLimits = {
  bytes: 2 * RELEASE_LIMITS.bytes,
  quads: 2 * RELEASE_LIMITS.quads,
  characters: 2 * RELEASE_LIMITS.characters,
};

/**
 * How much reads of documents already read may take in a page session
 * without counting in LINKED_READS_BUDGET, up to each one's largest read:
 * twice that budget, so thirty reads of the largest release in the
 * library, and far more of an ordinary one, more than a few copies are
 * looked up and planned in a session. Past it they count whole, or many
 * decks naming one document could read it, and keep what is made of it,
 * without limit.
 */
const LINKED_REREADS: ReadLimits = {
  bytes: 2 * LINKED_READS_BUDGET.bytes,
  quads: 2 * LINKED_READS_BUDGET.quads,
  characters: 2 * LINKED_READS_BUDGET.characters,
};

/** How many of those reads run at once, whichever screen asks. */
const LINKED_READS_AT_ONCE = 4;

/**
 * How long one of them may keep the others waiting, in milliseconds: a
 * server that answers slowly, or never, holds up only itself after that.
 */
const LINKED_READ_TURN_MS = 30_000;

/**
 * How long one of them waits for its turn, in milliseconds, before it
 * fails: a catalog may name a thousand decks on servers that never
 * answer, and whatever is asked after them must not wait for them all.
 */
const LINKED_READ_WAIT_MS = 120_000;

/**
 * How long a read of one release's or catalog's document may take in
 * all, in milliseconds, its body too: far longer than the largest release
 * in the library takes to download, but a server that answers and then
 * sends its body slowly, or not at all, holds up no reader for good. The
 * check of a release read (validate) is not counted.
 */
const RELEASE_READ_MS = 120_000;

/**
 * The triples of accepted reads of releases from a link kept to be read
 * again (the latest whatever its size), oldest let go first: room for
 * the largest releases in the library, and far more than a few decks.
 */
const KEPT_LINKED_QUADS = 100_000;

/**
 * A read of one document from a link within the page session's budget:
 * under RELEASE_LIMITS, on its own or with those of its plan or lookup,
 * and counted into the session's tally too.
 */
interface LinkedRead {
  fetch: typeof globalThis.fetch;
  /** The triples this document has taken in so far. */
  quads: () => number;
}

/** Work with a read of the document at a URL (LinkedRead), which counts as read when the work is done. */
type LinkedReads = <T>(url: string, work: (read: LinkedRead) => Promise<T>) => Promise<T>;

/**
 * The page session's budget for reads of releases from a link
 * (LINKED_READS_BUDGET): `reads` gives reads of documents under
 * RELEASE_LIMITS, together with those `own` counts, and within what is
 * left of the budget. Past it, reads are refused without asking the
 * server, and shown as linkedReadsSpent (`tooLarge`), not as a release
 * too large. A document whose Content-Length says it does not fit in
 * what is left spends the budget.
 *
 * What a read of a document takes past its largest read so far counts
 * in the budget, so first reads, those of one document at once too, stay
 * within it together. What it takes within that read comes out of
 * LINKED_REREADS while that lasts, and is not held against the budget,
 * whatever the document says of its size. When a read is done, what it
 * counted that the document's largest read now holds comes out of
 * LINKED_REREADS too, and goes back to the budget.
 */
function linkedReadsBudget(fetch: typeof globalThis.fetch) {
  const session = noneSpent();
  /** The largest read of each document so far: what stays counted of it. */
  const largest = new Map<string, ReadsSpent>();
  /** What is left of LINKED_REREADS. */
  const rereads: ReadsSpent = { ...LINKED_REREADS };
  let refused = false;
  const keys = ["bytes", "quads", "characters"] as const;
  const left = (key: keyof ReadsSpent) => (refused ? -1 : LINKED_READS_BUDGET[key] - session[key]);
  const spentOut = () => keys.some((key) => left(key) < 0);
  /** All that stays counted of a document read: what it adds to its largest read. */
  const settle = (url: string, document: ReadsSpent, counted: ReadsSpent) => {
    const most = largest.get(url) ?? noneSpent();
    for (const key of keys) {
      const added = Math.max(0, document[key] - most[key]);
      const back = Math.min(counted[key] - added, rereads[key]);
      session[key] -= back;
      rereads[key] -= back;
      most[key] += added;
    }
    largest.set(url, most);
  };
  return {
    reads(own: ReadsSpent = noneSpent()): LinkedReads {
      return async (url, work) => {
        const document = noneSpent();
        const counted = noneSpent();
        /** How much more of this read comes out of LINKED_REREADS. */
        const within = (key: keyof ReadsSpent) =>
          Math.max(0, Math.min((largest.get(url)?.[key] ?? 0) - document[key], rereads[key]));
        // limitedFetch compares one tally with RELEASE_LIMITS: it reads as `own`, or as what the session's leaves of
        // them, whichever is more, so it is past them once either is past its limit.
        const spent = {} as ReadsSpent;
        for (const key of keys) {
          Object.defineProperty(spent, key, {
            get: () => Math.max(own[key], RELEASE_LIMITS[key] - left(key) - within(key)),
            set: (value: number) => {
              const taken = value - spent[key];
              const free = Math.min(taken, within(key));
              rereads[key] -= free;
              own[key] += taken;
              document[key] += taken;
              counted[key] += taken - free;
              session[key] += taken - free;
            },
          });
        }
        const limited = limitedFetch(
          async (input, init) => {
            const response = await fetch(input, init);
            const declared = Number(response.headers.get("Content-Length"));
            if (
              own.bytes + declared <= RELEASE_LIMITS.bytes &&
              declared > left("bytes") + within("bytes")
            ) {
              refused = true;
            }
            return response;
          },
          RELEASE_LIMITS,
          spent,
        );
        try {
          return await work({
            fetch: (input, init) =>
              spentOut()
                ? Promise.reject(new ReadLimitError(String(input), RELEASE_LIMITS))
                : limited(input, init),
            quads: () => document.quads,
          });
        } finally {
          settle(url, document, counted);
        }
      };
    },
    tooLarge(past?: TooLarge): TooLarge {
      return (url, error) =>
        spentOut() ? linkedReadsSpent(url) : releaseReadError(url, error, past);
    },
  };
}

/**
 * Work taken in turns, `atOnce` at a time; one that takes longer than
 * `turnMs` goes on, but lets the next start. The hosts asked of take
 * turns, so that many reads of one host do not keep another's waiting,
 * and work still waiting after `waitMs` fails (releaseUnreadable), so
 * that many hosts do not either.
 */
function turnsOf(atOnce: number, turnMs: number, waitMs: number) {
  let free = atOnce;
  /** Who waits, by host, the host next in turn first. */
  const waiting = new Map<string, Set<() => void>>();
  const wait = (url: string) =>
    new Promise<void>((start, fail) => {
      const host = releaseHost(url) ?? url;
      const queue = waiting.get(host) ?? new Set();
      waiting.set(host, queue);
      const waiter = () => {
        clearTimeout(timer);
        start();
      };
      const timer = setTimeout(() => {
        queue.delete(waiter);
        if (queue.size === 0) waiting.delete(host);
        fail(new AppError("releaseUnreadable", { url }));
      }, waitMs);
      queue.add(waiter);
    });
  const next = () => {
    const first = waiting.entries().next();
    if (first.done === true) {
      free++;
      return;
    }
    const [host, queue] = first.value;
    const [waiter] = queue;
    queue.delete(waiter!);
    waiting.delete(host);
    if (queue.size > 0) waiting.set(host, queue);
    waiter!();
  };
  return async <T>(url: string, work: () => Promise<T>): Promise<T> => {
    if (free > 0) free--;
    else await wait(url);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      next();
    };
    const timer = setTimeout(finish, turnMs);
    try {
      return await work();
    } finally {
      clearTimeout(timer);
      finish();
    }
  };
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
 * until it is copied. A read checked against the library's shapes and
 * accepted is kept as the release's, in place of any before, so it is
 * the one its cards are imported from, while it is kept (pinned, for one
 * shown before it is added). Its creator's catalog
 * (publishedBeside) is read as anyone reads it, as the fetch reads
 * everything: no login is sent.
 * Every release is read under RELEASE_LIMITS, as anyone's server may
 * serve one as it likes, and so is that catalog; the library's releases
 * are well within them (client/readLimits.test.ts); a release past them
 * is releaseTooLarge, however it is read. The releases one upgrade plan
 * of a copy from a link reads (linkedReads) are read under them
 * together, not each, and kept only with the plan: a release may list
 * releases in between of its creator's choosing, each as large as a
 * release may be. So are those one lookup of such a copy's series
 * reads, its creator's catalogs too. The index, which grows with the
 * library and comes with the site, is not.
 *
 * However many decks name such releases, every read of one, for a plan,
 * a lookup or the page, is within LINKED_READS_BUDGET together, a
 * document counted once by its largest read while LINKED_REREADS lasts,
 * and LINKED_READS_AT_ONCE of them run at once, the hosts in turn. Past the budget a read fails
 * (linkedReadsSpent), as do those under way then, until the page is
 * loaded again; other work goes on. Of what such a release's accepted
 * reads made, KEPT_LINKED_QUADS of documents are kept with their content;
 * an older one is let go, and read and checked again as it was if its
 * cards are asked for, which may then find another release that passes
 * the same check. Its course outline stays. The one read a learner was
 * shown (pinned, DeckLibrary.readRelease) is not let go that way. What
 * the index lists is none of this, as fetchLibraryDeck and
 * fetchCourseOutline read it; readRelease knows no index, and reads any
 * address as a release from a link.
 */
export function createSolidDeckLibrary({
  fetch,
  indexUrl,
  validate,
}: SolidDeckLibraryDeps): DeckLibrary {
  const budget = linkedReadsBudget(fetch);
  const turn = turnsOf(LINKED_READS_AT_ONCE, LINKED_READ_TURN_MS, LINKED_READ_WAIT_MS);
  const limited = limitedFetch(fetch, RELEASE_LIMITS);
  const reads = releaseReads({
    unchecked: (url) => readDocument(url, limited),
    linked: (url, work) => budget.reads()(url, work),
    validate,
    tooLarge: budget.tooLarge(),
    turn,
    keptQuads: KEPT_LINKED_QUADS,
  });
  const indexes = new Map<string, Promise<Dataset>>();
  const decks = new Map<string, Promise<LibraryDeck[]>>();
  const views = new Map<string, Promise<LibraryIndexView>>();

  /** The index's document, read once. */
  function index(): Promise<Dataset> {
    return kept(indexes, indexUrl, () => getSolidDatasetLinear(indexUrl, { fetch }));
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

    ...reads,

    // One plan's or lookup's reads, catalogs too: their own, kept with them alone, under one release's limits.
    linkedReads() {
      const linked = budget.reads();
      return releaseReads({
        unchecked: (url) => turn(url, () => linked(url, ({ fetch }) => readDocument(url, fetch))),
        linked,
        validate,
        tooLarge: budget.tooLarge(linkedReleasesTooLarge),
        turn,
        keptQuads: Number.POSITIVE_INFINITY,
      });
    },
  };
}

/**
 * Releases read, each once, and what is made of it kept
 * (createSolidDeckLibrary), in maps of their own: dropped with what is
 * returned. One that readRelease checked is read with `linked` in `turn`,
 * as a release's catalogs (publishedBeside) are, and any other with
 * `unchecked`. Of the documents accepted, `keptQuads` of triples are kept,
 * and an older one let go is read again with the same check; the one read
 * pinned stays beside them until another is pinned. A read past the
 * limits is shown as `tooLarge` says.
 */
function releaseReads({
  unchecked,
  linked,
  validate,
  tooLarge,
  turn,
  keptQuads,
}: {
  unchecked: (url: string) => Promise<Dataset>;
  linked: LinkedReads;
  validate: SolidDeckLibraryDeps["validate"];
  tooLarge: TooLarge;
  turn: ReturnType<typeof turnsOf>;
  keptQuads: number;
}): LinkedReleaseReads {
  const releases = new Map<string, Promise<Dataset>>();
  const contents = new Map<string, Promise<LibraryDeckContent>>();
  const outlines = new Map<string, Promise<CourseOutline>>();
  /** The check each accepted release passed, for when it is read again. */
  const accepts = new Map<string, Accept>();
  /** The triples of each accepted read kept, oldest first; not the one pinned. */
  const held = new Map<string, number>();
  let heldQuads = 0;
  /** The release whose accepted read is pinned, of the `pinnedRead`th read asked to be. */
  let pinned: string | undefined;
  let pinnedRead = 0;
  let pinReads = 0;

  function letGo(url: string): void {
    releases.delete(url);
    contents.delete(url);
  }

  /** The accepted read is kept in place of any before, older ones let go down to `keptQuads`; the latest stays. */
  function hold(url: string, quads: number): void {
    heldQuads += quads - (held.get(url) ?? 0);
    held.delete(url);
    held.set(url, quads);
    for (const [older, size] of held) {
      if (heldQuads <= keptQuads || older === url) break;
      held.delete(older);
      heldQuads -= size;
      letGo(older);
    }
  }

  /** The accepted read stays, out of what `hold` may let go, in place of the one pinned before, which is let go. */
  function pin(url: string, read: number): void {
    heldQuads -= held.get(url) ?? 0;
    held.delete(url);
    if (pinned !== undefined && pinned !== url) letGo(pinned);
    pinned = url;
    pinnedRead = read;
  }

  /** A read of the release as readRelease makes it, the document with what it reads as. */
  function readLinked(url: string, accept?: Accept, pinning = false) {
    // A read asked to be pinned before the one pinned, but done after it, pins nothing.
    const read = pinning ? ++pinReads : 0;
    return turn(url, () =>
      linked(url, async ({ fetch, quads }) => {
        let dataset: Dataset;
        try {
          dataset = await readDocument(url, fetch);
        } catch (error) {
          throw releaseReadError(url, error, tooLarge);
        }
        const deck = toStandaloneLibraryDeck(url, dataset);
        if (accept !== undefined) {
          accept(await validate(url, dataset));
          const pins = read > pinnedRead;
          // A read pinned is what was shown: no other read of that release, under way when it was, takes its place.
          if (url === pinned && !pins) return { dataset, deck };
          // What was checked is what is read of the release from now on: its content and outline made of it anew.
          accepts.set(url, accept);
          releases.set(url, Promise.resolve(dataset));
          contents.delete(url);
          outlines.delete(url);
          if (pins) pin(url, read);
          else hold(url, quads());
        }
        return { dataset, deck };
      }),
    );
  }

  /** The release's document, read once, and with its check again when it was accepted and has been let go. */
  function release(url: string): Promise<Dataset> {
    return kept(releases, url, () => {
      const accept = accepts.get(url);
      if (accept !== undefined) return readLinked(url, accept).then(({ dataset }) => dataset);
      return unchecked(url).catch((error: unknown) => {
        throw shownReadError(url, error, tooLarge);
      });
    });
  }

  return {
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

    async readRelease(url, accept, options) {
      return (await readLinked(url, accept, options?.pin)).deck;
    },

    async publishedBeside(url) {
      const instance = releaseInstanceOf(url);
      if (instance === null) return null;
      for (const folder of foldersUpTo(url, instance)) {
        // An instance's catalog is `<instance>catalog.ttl`; one that cannot be read is no answer.
        const links = await turn(folder, () =>
          linked(folder, ({ fetch }) =>
            readWithin(folder, fetch, (fetch) => catalogLinks(folder, SM.publishedRelease, fetch)),
          ),
        ).catch((): string[] => []);
        // The catalog is data its creator wrote: of its links, only those at an address a release may have are
        // read, and may become a copy's source (isPublishedReleaseUrl), as the user's own catalog's are, and of
        // those only the ones in the catalog's own folder, so in the release's instance.
        if (links.includes(url))
          return links.filter((link) => isPublishedReleaseUrl(link) && isDocumentIn(link, folder));
        // A storage's root is its owner's: what is above it is someone else's.
        if (folder !== instance && (await isStorageRoot(folder))) return null;
      }
      return null;
    },
  };

  /**
   * Whether the folder is a storage's root (isStorageRootAt), asked as
   * anyone asks; a folder the server says nothing of is not shown to be.
   */
  function isStorageRoot(folder: string): Promise<boolean> {
    return turn(folder, () =>
      linked(folder, ({ fetch }) =>
        readWithin(folder, fetch, (fetch) => isStorageRootAt(folder, fetch)),
      ),
    ).catch(() => false);
  }
}

/** The check a read of a release is held to (DeckLibrary.readRelease's `accept`). */
type Accept = (report: DocumentReport) => void;

/**
 * The folders publishedBeside looks for a release's creator's catalog
 * in, nearest first: the release's own, `<instance>releases/<name>/`,
 * up to the instance's (releaseInstanceOf), whose catalog links what it
 * published. Nothing above the instance is its creator's to say.
 */
function foldersUpTo(url: string, instance: string): string[] {
  const folders: string[] = [];
  for (let folder = new URL(".", url).href; ; folder = new URL("..", folder).href) {
    folders.push(folder);
    if (folder === instance) return folders;
  }
}

/** The release's document at `url`, read with `fetch` within RELEASE_READ_MS (readWithin). */
function readDocument(url: string, fetch: typeof globalThis.fetch): Promise<Dataset> {
  return readWithin(url, fetch, (fetch) => getSolidDatasetLinear(url, { fetch }));
}

/**
 * `read` of the document at `url` with `fetch`, within RELEASE_READ_MS:
 * a read not done by then, its body read too, fails with podNoAnswer, so
 * that what is kept of it is let go (kept), and its requests are aborted.
 * Only the read is timed: the check of what was read (validate) comes
 * after, however long it takes. The reads here pass no signal of their
 * own.
 */
function readWithin<T>(
  url: string,
  fetch: typeof globalThis.fetch,
  read: (fetch: typeof globalThis.fetch) => Promise<T>,
): Promise<T> {
  const deadline = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, fail) => {
    timer = setTimeout(() => {
      const error = new AppError("podNoAnswer", { url, seconds: RELEASE_READ_MS / 1000 });
      fail(error);
      deadline.abort(error);
    }, RELEASE_READ_MS);
  });
  const reading = read((input, init) => fetch(input, { ...init, signal: deadline.signal }));
  return Promise.race([reading, late]).finally(() => clearTimeout(timer));
}

/**
 * What `make` makes for the URL, made once and kept; a failure is
 * forgotten, so the next call tries again, unless what is kept is
 * another by then (a release's read checked, kept in its place).
 */
function kept<T>(cache: Map<string, Promise<T>>, url: string, make: () => Promise<T>): Promise<T> {
  let made = cache.get(url);
  if (made === undefined) {
    const making = make();
    made = making;
    cache.set(url, making);
    making.catch(() => {
      if (cache.get(url) === making) cache.delete(url);
    });
  }
  return made;
}
