// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  buildThing,
  createSolidDataset,
  createThing,
  type FetchedDataset,
  getThingAll,
  getUrlAll,
  setThing,
} from "./client/rdf";
import type { Deck } from "@solid-memo/domain/deck";
import { AppError } from "@solid-memo/domain/appError";
import {
  canonicalUrlOf,
  cardsContainerOf,
  ensureTrailingSlash,
  instanceUrlOfDeck,
  isDocumentIn,
  isInFolder,
  isSameUrl,
  ownsDocument,
  reviewsContainerOf,
} from "@solid-memo/domain/instanceLayout";
import { isDeckInPlace } from "@solid-memo/domain/deckAddress";
import {
  draftContainerOf,
  isDraftShaped,
  isDraftDocumentName,
  RELEASE_DOCUMENT,
} from "@solid-memo/domain/release/draftLayout";
import { derivedOnce } from "@solid-memo/domain/frozen";
import { TextMap } from "@solid-memo/domain/pathKeys";
import { documentUrlOf, fragmentIdOf } from "@solid-memo/domain/subjectUrl";
import { linkTargets, TURTLE_FIRST } from "./client/linkHeader";
import {
  asReadOf,
  getSolidDatasetOrNull,
  isReadFrom,
  readForRemoval,
  saveDataset,
  TOO_LARGE,
  UNREADABLE,
} from "./datasets";
import type { ReadBudget, SharedReads } from "@solid-memo/application/ports";
import { LWS_STORAGE_REL, storageRootsOf } from "./lwsStorage";
import { deckBackLinksOf, isDeckItself } from "./ownership";
import { hasStorageLink } from "./solidStorageGateway";
import { DCTERMS } from "./vocab";

/** A deck as the guard needs it: its entry, its title for an error, and its two documents. */
export type DeckPlace = Pick<Deck, "url" | "title" | "cardsDocumentUrl" | "reviewsDocumentUrl">;

/**
 * Where a deck's document stands (docs/data-model.md, "Where an
 * instance's documents are"):
 *
 * - "owned": it says it is the deck's (`<> dcterms:isPartOf <entry>`),
 *   it is in the instance's folder or in the storage the instance is in
 *   (isInInstanceStorage: anyone who may only append to a document can
 *   make it say so, so that alone never lets the deck of an instance
 *   elsewhere write to it or delete it), and it is not a deck itself
 *   (isDeckItself); the app's fetch, the credential gate, still writes
 *   nothing outside the user's own pod (ownPodGate.ts);
 * - "adoptable": it does not yet, nor that it is any other deck's (of
 *   this instance or another, deckBackLinksOf), but it is in the
 *   instance's folder and that folder is the instance's own (not a
 *   storage's root), or there is no document there yet and it would be
 *   made in the instance's folder: the next write says it is the deck's;
 * - "unclaimed": anywhere else, or when it says it is another deck's, it
 *   does not say so, and Solid Memo never says it by itself: it is read,
 *   never written to or deleted, until the user claims it
 *   (claimDocuments). A document that is a deck itself, or one of a
 *   draft's (isDraftDocument), is unclaimed whatever it says, and is
 *   never claimed.
 */
export type DocumentStanding = "owned" | "adoptable" | "unclaimed";

/** What dcterms:isPartOf the document itself (`<>`, spelled any way a request sends it) states. */
function partOfOf(dataset: Dataset, url: string): string[] {
  return getThingAll(dataset)
    .filter((thing) => isSameUrl(thing.url, url))
    .flatMap((thing) => getUrlAll(thing, DCTERMS.isPartOf));
}

/**
 * Whether the document is one of a draft's (draftLayout.ts): its release
 * document, its cards document or a chapter's, in a draft's container,
 * as a request sends the address (canonicalUrlOf) or a server that
 * decodes it reads it. What a draft holds is what the release it was
 * made from said, which may name any of its documents as one of its
 * subjects, so none of them is a deck's document, whatever it says.
 */
export function isDraftDocument(url: string): boolean {
  const sent = canonicalUrlOf(url) ?? url;
  let read: string;
  try {
    read = decodeURI(sent);
  } catch {
    read = sent;
  }
  return [sent, read].some((one) => {
    const container = draftContainerOf(one);
    return (
      isDraftDocumentName(one.slice(container.length)) &&
      isDraftShaped(`${container}${RELEASE_DOCUMENT}`)
    );
  });
}

/**
 * What the document at an address says that goes for every deck alike:
 * whether it is never a deck's (a draft's or a deck itself), the decks
 * the document itself (`<>`) says it is part of, as a request sends
 * each (canonicalUrlOf), and whether it says it is part of a catalog's
 * entry (deckBackLinksOf). Worked out once of a dataset read once
 * (documentFactsOf), so that many decks naming one document each find
 * where it stands for them with a lookup, not a pass over it.
 */
interface DocumentFacts {
  neverADecks: boolean;
  partOf: TextMap<true>;
  backLinked: boolean;
}

/** The facts already worked out of each frozen dataset, by the address asked about. */
const FACTS = new WeakMap<Dataset, Map<string, DocumentFacts>>();

/**
 * The address a read of the document at `url` is made at, and what it
 * gives resolved against (deckPlace read): `url` itself, or, for a read
 * the data checks share (SharedReads), the address as a request sends
 * it (canonicalUrlOf), which every spelling of it shares. A deck's
 * document is at an address a deck's may be (isDeckInPlace), so it has
 * one.
 */
export function readAt(url: string, reads?: SharedReads): string {
  return reads === undefined ? url : canonicalUrlOf(url)!;
}

/**
 * The document's facts (DocumentFacts), as `dataset` (null: no document)
 * says, worked out once per dataset and address while the dataset is
 * frozen (derivedOnce), as a read gives it: each deck naming a shared
 * document, and each read of it that the pod answers unchanged, gets
 * them without a pass over the document.
 */
function documentFactsOf(dataset: Dataset | null, url: string): DocumentFacts {
  if (dataset === null)
    return { neverADecks: isDraftDocument(url), partOf: new TextMap(), backLinked: false };
  const byUrl = derivedOnce(FACTS, dataset, () => new Map<string, DocumentFacts>());
  let facts = byUrl.get(url);
  if (facts === undefined) {
    const partOf = new TextMap<true>();
    for (const deck of partOfOf(dataset, url)) {
      const canonical = canonicalUrlOf(deck);
      if (canonical !== null) partOf.set(canonical, true);
    }
    facts = {
      neverADecks: isDraftDocument(url) || isDeckItself(dataset, url),
      partOf,
      backLinked: deckBackLinksOf(dataset, url).length > 0,
    };
    byUrl.set(url, facts);
  }
  return facts;
}

/** Whether the document says it is the deck's (ownsDocument), as its facts give it. */
function saysIsDecks(facts: DocumentFacts, deckUrl: string): boolean {
  const canonical = canonicalUrlOf(deckUrl);
  return canonical !== null && facts.partOf.has(canonical);
}

/**
 * The document saying it is the deck's: the document itself (`<>`)
 * dcterms:isPartOf the deck's catalog entry, added once. Any other
 * dcterms:isPartOf stays (another app may point two decks at one document).
 */
function withPartOf(dataset: Dataset, url: string, deckUrl: string): Dataset {
  if (ownsDocument(partOfOf(dataset, url), deckUrl)) return dataset;
  const document =
    getThingAll(dataset).find((thing) => isSameUrl(thing.url, url)) ?? createThing({ url });
  return setThing(dataset, buildThing(document).addUrl(DCTERMS.isPartOf, deckUrl).build());
}

/**
 * The storages of whoever is signed in: the ones their profile names
 * (pim:storage), or else the storage's root the server shows above
 * their WebID; none when no one is signed in. Asked on every check, so
 * a caller keeps what it found. The deck-document guard counts a
 * document outside an instance's folder in the instance's storage only
 * in one of these that holds both, or under one storage's root the
 * server shows (isInInstanceStorage).
 */
export type UserStorages = () => Promise<readonly string[]>;

/** No storage of the user's known: only a root the server shows counts. */
const noStorages: UserStorages = async () => [];

/**
 * Whether the folder is a storage's root, asked with `fetch`: the Solid
 * Protocol's `pim:Storage` link, or the root a Linked Web Storage server
 * names in its description (lwsStorage.ts). An answer that says nothing
 * of the folder (401, 429, 503, a description that can't be read) fails
 * with cannotCheck.
 */
export async function isStorageRootAt(
  folder: string,
  fetch: typeof globalThis.fetch,
): Promise<boolean> {
  // Turtle asked for, as the app reads a folder: an LWS server may answer a storage's root otherwise, without its Solid links.
  const response = await fetch(folder, { method: "HEAD", headers: { Accept: TURTLE_FIRST } });
  if (!response.ok) throw new AppError("cannotCheck", { url: folder, status: response.status });
  if (hasStorageLink(response.headers.get("Link"))) return true;
  // A Linked Web Storage server names a storage's root in its description, not with a type.
  const [storage] = linkTargets(response, LWS_STORAGE_REL, folder);
  if (storage === undefined) return false;
  const roots = await storageRootsOf(storage, fetch);
  if (roots === null) throw new AppError("cannotCheck", { url: folder, status: 0 });
  return roots.some((root) => isSameUrl(root, folder));
}

/**
 * The guard every write to and every delete of a deck's cards or reviews
 * document passes first, over the pod `fetch`: whether the document is
 * the deck's to change (DocumentStanding), and the claim that makes one
 * so. `userStorages` gives the signed-in user's storages. Whether the
 * instance's folder is its own is asked once per folder.
 */
export function createDeckDocumentGuard(
  fetch: typeof globalThis.fetch,
  userStorages: UserStorages = noStorages,
) {
  const storageRoots = new Map<string, Promise<boolean>>();

  /** Whether the folder is a storage's root (isStorageRootAt), asked of the pod once per folder; a failed ask is asked again. */
  function isStorageRoot(folder: string): Promise<boolean> {
    let known = storageRoots.get(folder);
    if (known === undefined) {
      known = isStorageRootAt(folder, fetch);
      known.catch(() => storageRoots.delete(folder));
      storageRoots.set(folder, known);
    }
    return known;
  }

  /**
   * Whether the folder is an instance's own: not a pod's root (`/`), nor
   * a storage's root or a folder above one, which hold the user's other
   * data too. A storage's root is one of the user's storages
   * (userStorages), which a server that holds many users' pods on one
   * origin may leave untyped, or one the server shows (isStorageRoot).
   * A storage list the pod does not answer for leaves it not shown to
   * be: `lenient`, so the instance's documents are read and kept as
   * they are; otherwise cannotCheck, so that a write may be tried again.
   */
  async function isDedicatedFolder(folder: string, lenient: boolean): Promise<boolean> {
    if (new URL(folder).pathname === "/") return false;
    let storages: readonly string[];
    try {
      storages = await userStorages();
    } catch {
      if (lenient) return false;
      throw new AppError("cannotCheck", { url: folder, status: 0 });
    }
    if (storages.some((storage) => isInFolder(ensureTrailingSlash(storage), folder))) return false;
    return !(await isStorageRoot(folder));
  }

  /**
   * The storage's root the folder is in: the folder itself or the
   * nearest folder above it that is a storage's root (isStorageRoot);
   * null when there is none up to the server's root (`/`), which a
   * server that types no root leaves.
   */
  async function rootOf(folder: string): Promise<string | null> {
    for (let at = folder; ; at = new URL("..", at).href) {
      if (await isStorageRoot(at)) return at;
      if (new URL(at).pathname === "/") return null;
    }
  }

  /**
   * Whether the document at `url` is in the storage the instance is in.
   * One of the user's storages (userStorages) that holds either decides
   * it: in the same one, or not. Otherwise both must have one storage's
   * root (rootOf), shown by the server; a folder both are in is not
   * enough, as a server may hold the storages of many under one root
   * it does not type. A document on another server is not, and nothing
   * is asked. A storage list or a folder the pod does not answer for
   * leaves it not shown to be: `lenient`, so the document is kept as it
   * is; otherwise the error (a profile's as cannotCheck), so that a
   * write may be tried again.
   */
  async function isInInstanceStorage(
    url: string,
    instance: string,
    lenient: boolean,
  ): Promise<boolean> {
    const document = new URL(canonicalUrlOf(url)!);
    if (!isInFolder(instance, new URL("/", document).href)) return false;
    try {
      // A profile that can't be read is a check that could not be made: tried again, as a folder's is.
      const storages = await userStorages().catch(() => {
        throw new AppError("cannotCheck", { url: instance, status: 0 });
      });
      const holding = storages.filter(
        (storage) => isDocumentIn(url, storage) || isInFolder(instance, storage),
      );
      if (holding.length > 0)
        return holding.some(
          (storage) => isDocumentIn(url, storage) && isInFolder(instance, storage),
        );
      const root = await rootOf(new URL(".", document).href);
      // The instance under that root too, with no root of its own below it.
      return (
        root !== null && isInFolder(instance, root) && isSameUrl(root, (await rootOf(instance))!)
      );
    } catch (error) {
      if (lenient) return false;
      throw error;
    }
  }

  /** The instance the deck's entry is in, as a request sends its address; the deck must be one that can be used (isDeckInPlace), else deckGone. */
  function instanceOf(deck: DeckPlace): string {
    if (!isDeckInPlace(deck)) throw new AppError("deckGone", { deck: deck.title });
    return ensureTrailingSlash(instanceUrlOfDeck(canonicalUrlOf(documentUrlOf(deck.url))!));
  }

  /** Where the document at `url` stands for the deck, given what is there (null: no document). */
  function standing(
    deck: DeckPlace,
    url: string,
    dataset: Dataset | null,
  ): Promise<DocumentStanding> {
    return standingOf(deck, url, dataset, true);
  }

  /**
   * Where the document stands (standing). `lenient`: one outside the
   * instance's folder whose storage the pod does not answer for is
   * unclaimed, as a check or a removal keeps it; otherwise cannotCheck,
   * as a write is refused for now rather than called not the deck's.
   */
  function standingOf(
    deck: DeckPlace,
    url: string,
    dataset: Dataset | null,
    lenient: boolean,
  ): Promise<DocumentStanding> {
    return standingBy(deck, url, dataset, documentFactsOf(dataset, url), lenient);
  }

  /** Where the document stands for the deck (standingOf), given what it says (documentFactsOf). */
  async function standingBy(
    deck: DeckPlace,
    url: string,
    dataset: Dataset | null,
    facts: DocumentFacts,
    lenient: boolean,
  ): Promise<DocumentStanding> {
    const instance = instanceOf(deck);
    if (facts.neverADecks) return "unclaimed";
    if (!isDocumentIn(url, instance)) {
      // Saying it is the deck's makes it so only in the instance's storage: anyone who may append to a document can say it.
      const owned =
        saysIsDecks(facts, deck.url) && (await isInInstanceStorage(url, instance, lenient));
      return owned ? "owned" : "unclaimed";
    }
    if (saysIsDecks(facts, deck.url)) return "owned";
    if (dataset === null) return "adoptable";
    if (facts.backLinked) return "unclaimed";
    return (await isDedicatedFolder(instance, lenient)) ? "adoptable" : "unclaimed";
  }

  /**
   * The deck's documents that are unclaimed: read wherever they are,
   * never written to or deleted until the user claims them. One in the
   * instance's own folder is not read for this, so that a check of an
   * unchanged instance downloads nothing (docs/data-model.md): one there
   * that says it is another deck's is still refused on a write
   * (standing), kept with that deck's cards when the deck goes
   * (ownership.ts deckDocumentSubjects), and left out of what a check
   * reports once it has read it (unclaimedAsRead). One that cannot be
   * read as RDF is unclaimed. Both are read at once. One outside the
   * instance's folder, which may be on anyone's server, is read within
   * `budget`, if given: once it is spent, one not yet read counts as
   * unreadable, so unclaimed, as it then is for a check (ReadBudget).
   */
  async function unclaimed(
    deck: DeckPlace,
    budget?: ReadBudget,
    reads?: SharedReads,
  ): Promise<string[]> {
    if (!isDeckInPlace(deck)) return [];
    const instance = instanceOf(deck);
    const urls = [deck.cardsDocumentUrl, deck.reviewsDocumentUrl].filter(
      (url, at, both) => both.findIndex((other) => isSameUrl(other, url)) === at,
    );
    const found = await Promise.all(
      urls.map(async (url) => {
        if (!isDocumentIn(url, instance))
          return budget === undefined
            ? unclaimedAsRead([deck], url, true, reads)
            : budget.spend(true, () => unclaimedAsRead([deck], url, true, reads));
        return (
          !(await isDedicatedFolder(instance, true)) && unclaimedAsRead([deck], url, true, reads)
        );
      }),
    );
    return urls.filter((_, at) => found[at]);
  }

  /**
   * Whether the document, as `dataset` (null: no document) says, is
   * unclaimed for every one of the decks (standing). What it says is
   * worked out once for them all (documentFactsOf): a catalog may name
   * one document for a thousand decks.
   */
  async function unclaimedForAll(
    decks: readonly DeckPlace[],
    url: string,
    dataset: Dataset | null,
  ): Promise<boolean> {
    const facts = documentFactsOf(dataset, url);
    for (const deck of decks) {
      if ((await standingBy(deck, url, dataset, facts, true)) !== "unclaimed") return false;
    }
    return true;
  }

  /**
   * Whether the document is unclaimed for every one of the decks, read
   * once, now (unclaimed spares one in the instance's own folder that
   * read). `unreadable` is the answer for a document that cannot be
   * read. Each deck must be one that can be used, else deckGone. With
   * `reads`, the read is one those reads share (read).
   */
  async function unclaimedAsRead(
    decks: readonly DeckPlace[],
    url: string,
    unreadable = true,
    reads?: SharedReads,
  ): Promise<boolean> {
    let dataset: Dataset | null;
    try {
      dataset = await read(url, reads);
    } catch {
      // Not a document Solid Memo can read (not RDF, refused): nothing says it is the deck's.
      return unreadable;
    }
    return unclaimedForAll(decks, readAt(url, reads), dataset);
  }

  /**
   * The deck's document as its removal reads it (readForRemoval). Of one
   * outside the instance's folder, which may be anyone's on any server,
   * a failed read counts as UNREADABLE too, so that it is kept and
   * named: such a read may never succeed, and must not hold back the
   * deck's removal, on either read of it (removeOwned). Any other failed
   * read throws.
   */
  async function readToRemove(deck: DeckPlace, url: string): ReturnType<typeof readForRemoval> {
    try {
      return await readForRemoval(url, fetch);
    } catch (error) {
      if (isDocumentIn(url, instanceOf(deck))) throw error;
      return UNREADABLE;
    }
  }

  /**
   * The document at `url` as the removal of `decks` reads it
   * (readToRemove, as the first of them reads it), but TOO_LARGE where
   * it is past the size limits of one read (readForRemoval) and is where
   * one of them keeps its own (isOwnDocument), in a folder that is the
   * instance's own (isDedicatedFolder) and outside the user's storages
   * (isOutsideStorages): no read will ever take it in, so it would be
   * left behind, kept unread, with nothing left to remove it, as an
   * import of a deck file there once could leave it. The removal deletes
   * it whole, unread. Unread, it cannot be asked whether it says it is
   * another deck's or holds another app's data (standing, removeOwned),
   * so anywhere else it is UNREADABLE, kept, as is one past only a
   * budget its reads share (isPastBudget), as a reload reads it.
   */
  async function readOwnToRemove(
    decks: readonly DeckPlace[],
    url: string,
  ): Promise<FetchedDataset | null | typeof UNREADABLE | typeof TOO_LARGE> {
    const own = decks.find((deck) => isOwnDocument(deck, url));
    if (own === undefined) return readToRemove(decks[0]!, url);
    const read = await readForRemoval(url, fetch, TOO_LARGE);
    if (read !== TOO_LARGE) return read;
    const instance = instanceOf(own);
    return (await isOutsideStorages(instance)) && (await isDedicatedFolder(instance, true))
      ? TOO_LARGE
      : UNREADABLE;
  }

  /**
   * Whether the instance is outside every one of the user's storages
   * (userStorages); not shown to be when they cannot be had.
   */
  async function isOutsideStorages(instance: string): Promise<boolean> {
    const storages = await userStorages().catch(() => null);
    return storages !== null && !storages.some((storage) => isInFolder(instance, storage));
  }

  /**
   * Whether `url` is where the deck's own cards or reviews document is
   * made: `decks/<id>.ttl` or `reviews/<id>.ttl` of its instance, its id
   * of the characters a path segment holds as they are, and no `..`,
   * which a server may read as a step up, so that it names no other
   * folder or document.
   */
  function isOwnDocument(deck: DeckPlace, url: string): boolean {
    const instance = instanceOf(deck);
    const id = fragmentIdOf(deck.url);
    return (
      /^(?:[\w~-]|\.(?!\.))+$/.test(id) &&
      [cardsContainerOf(instance), reviewsContainerOf(instance)].some((folder) =>
        isSameUrl(url, `${folder}${id}.ttl`),
      )
    );
  }

  /**
   * The document at `url` as the user reads it (null: none), the read
   * one of `reads` when given: the data checks of an instance share it
   * (SharedReads), so a document many decks name, in whatever spelling
   * of its address, is read once for them all, to map its cards and to
   * find where it stands for each. Such a read is made at the address as
   * a request sends it (readAt), so what it gives is resolved against
   * that spelling, whichever deck asked first.
   */
  function read(url: string, reads?: SharedReads): Promise<Dataset | null> {
    const at = readAt(url, reads);
    const fetched = () => getSolidDatasetOrNull(at, fetch);
    return reads === undefined ? fetched() : reads(at, fetched);
  }

  return {
    /** Refuse a deck that cannot be used (isDeckInPlace): deckGone, before anything is read or sent. */
    assertUsable(deck: DeckPlace): void {
      instanceOf(deck);
    },

    standing,

    unclaimed,

    unclaimedForAll,

    unclaimedAsRead,

    read,

    readToRemove,

    readOwnToRemove,

    /**
     * What an instance's deletion does with the deck's document:
     * "deletable" when it is the deck's, "unclaimed" when it is left
     * alone, "unreadable" when it is kept unread (readToRemove). One in
     * the instance's own folder is not read here, as in unclaimed: its
     * removal reads it, and keeps one that is a deck itself
     * (ownership.ts deckDocumentSubjects). A draft's is unclaimed
     * wherever it is (isDraftDocument).
     */
    async removal(deck: DeckPlace, url: string): Promise<"deletable" | "unclaimed" | "unreadable"> {
      const instance = instanceOf(deck);
      if (isDraftDocument(url)) return "unclaimed";
      if (isDocumentIn(url, instance) && (await isDedicatedFolder(instance, true)))
        return "deletable";
      const dataset = await readToRemove(deck, url);
      if (dataset === UNREADABLE) return "unreadable";
      return (await standing(deck, url, dataset)) === "unclaimed" ? "unclaimed" : "deletable";
    },

    /**
     * The dataset to save at `url`, one of the deck's documents, saying it
     * is the deck's (withPartOf); refused (deckDocumentUnclaimed), before
     * anything is sent, when the document is not the deck's to change. A
     * dataset not read from `url` is a new document, made only where
     * there is none yet (If-None-Match: *). Where the document stands is
     * judged on it as read (asReadOf), never on the edit: an edit that
     * takes another deck's dcterms:isPartOf out of it does not make it
     * this deck's.
     */
    async writable(deck: DeckPlace, url: string, dataset: Dataset): Promise<Dataset> {
      const read = isReadFrom(dataset, url) ? asReadOf(dataset) : null;
      if ((await standingOf(deck, url, read, false)) === "unclaimed")
        throw new AppError("deckDocumentUnclaimed", { deck: deck.title });
      return withPartOf(dataset, url, deck.url);
    },

    /**
     * Claim the deck's unclaimed documents, as the user confirmed: each
     * says it is the deck's from then on, in one write made only while it
     * is as read (If-Match), or, where there is none, made with that alone
     * (If-None-Match: *). Nothing else in it changes. One that is a deck
     * itself (isDeckItself) is left as it is.
     */
    async claim(deck: DeckPlace): Promise<void> {
      for (const url of await unclaimed(deck)) {
        if (isDraftDocument(url)) continue;
        const dataset = (await getSolidDatasetOrNull(url, fetch)) ?? createSolidDataset();
        if (isDeckItself(dataset, url)) continue;
        await saveDataset(url, withPartOf(dataset, url, deck.url), fetch);
      }
    },
  };
}
