// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  buildThing,
  createSolidDataset,
  createThing,
  getThingAll,
  getUrlAll,
  setThing,
} from "./client/rdf";
import type { Deck } from "@solid-memo/domain/deck";
import { AppError } from "@solid-memo/domain/appError";
import {
  canonicalUrlOf,
  ensureTrailingSlash,
  instanceUrlOfDeck,
  isDeckInPlace,
  isDocumentIn,
  isSameUrl,
  ownsDocument,
} from "@solid-memo/domain/instanceLayout";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { getSolidDatasetOrNull, isReadFrom, saveDataset } from "./datasets";
import { deckBackLinksOf } from "./ownership";
import { hasStorageLink } from "./solidStorageGateway";
import { DCTERMS } from "./vocab";

/** A deck as the guard needs it: its entry, its title for an error, and its two documents. */
type DeckPlace = Pick<Deck, "url" | "title" | "cardsDocumentUrl" | "reviewsDocumentUrl">;

/**
 * Where a deck's document stands (docs/data-model.md, "Where an
 * instance's documents are"):
 *
 * - "owned": it says it is the deck's (`<> dcterms:isPartOf <entry>`),
 *   wherever it is (the app's fetch, the credential gate, still writes
 *   nothing outside the user's own pod: ownPodGate.ts);
 * - "adoptable": it does not yet, nor that it is any other deck's (of
 *   this instance or another, deckBackLinksOf), but it is in the
 *   instance's folder and that folder is the instance's own (not a
 *   storage's root), or there is no document there yet and it would be
 *   made in the instance's folder: the next write says it is the deck's;
 * - "unclaimed": anywhere else, or when it says it is another deck's, it
 *   does not say so, and Solid Memo never says it by itself: it is read,
 *   never written to or deleted, until the user claims it
 *   (claimDocuments).
 */
export type DocumentStanding = "owned" | "adoptable" | "unclaimed";

/** What dcterms:isPartOf the document itself (`<>`, spelled any way a request sends it) states. */
function partOfOf(dataset: Dataset, url: string): string[] {
  return getThingAll(dataset)
    .filter((thing) => isSameUrl(thing.url, url))
    .flatMap((thing) => getUrlAll(thing, DCTERMS.isPartOf));
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
 * The guard every write to and every delete of a deck's cards or reviews
 * document passes first, over the pod `fetch`: whether the document is
 * the deck's to change (DocumentStanding), and the claim that makes one
 * so. Whether the instance's folder is its own is asked once per folder.
 */
export function createDeckDocumentGuard(fetch: typeof globalThis.fetch) {
  const dedicated = new Map<string, Promise<boolean>>();

  /**
   * Whether the folder is an instance's own: not a pod's root (`/`), nor
   * a storage's (the Solid Protocol's `pim:Storage` link), which hold
   * the user's other data too. Asked of the pod once per folder; a
   * failed ask (cannotCheck) is asked again.
   */
  function isDedicatedFolder(folder: string): Promise<boolean> {
    let known = dedicated.get(folder);
    if (known === undefined) {
      known = (async () => {
        if (new URL(folder).pathname === "/") return false;
        const response = await fetch(folder, { method: "HEAD" });
        // An answer that says nothing of the folder (401, 429, 503) is asked again, never kept as "not its own".
        if (!response.ok)
          throw new AppError("cannotCheck", { url: folder, status: response.status });
        return !hasStorageLink(response.headers.get("Link"));
      })();
      known.catch(() => dedicated.delete(folder));
      dedicated.set(folder, known);
    }
    return known;
  }

  /** The instance the deck's entry is in, as a request sends its address; the deck must be one that can be used (isDeckInPlace), else deckGone. */
  function instanceOf(deck: DeckPlace): string {
    if (!isDeckInPlace(deck)) throw new AppError("deckGone", { deck: deck.title });
    return ensureTrailingSlash(instanceUrlOfDeck(canonicalUrlOf(documentUrlOf(deck.url))!));
  }

  /** Where the document at `url` stands for the deck, given what is there (null: no document). */
  async function standing(
    deck: DeckPlace,
    url: string,
    dataset: Dataset | null,
  ): Promise<DocumentStanding> {
    const instance = instanceOf(deck);
    if (dataset !== null && ownsDocument(partOfOf(dataset, url), deck.url)) return "owned";
    if (!isDocumentIn(url, instance)) return "unclaimed";
    if (dataset === null) return "adoptable";
    if (deckBackLinksOf(dataset, url).length > 0) return "unclaimed";
    return (await isDedicatedFolder(instance)) ? "adoptable" : "unclaimed";
  }

  /**
   * The deck's documents that are unclaimed: read wherever they are,
   * never written to or deleted until the user claims them. One in the
   * instance's own folder is not read for this, so that a check of an
   * unchanged instance downloads nothing (docs/data-model.md): one there
   * that says it is another deck's is still refused on a write
   * (standing), and kept with that deck's cards when the deck goes
   * (ownership.ts deckDocumentSubjects). One that cannot be read as RDF
   * is unclaimed.
   */
  async function unclaimed(deck: DeckPlace): Promise<string[]> {
    if (!isDeckInPlace(deck)) return [];
    const instance = instanceOf(deck);
    const found: string[] = [];
    for (const url of [deck.cardsDocumentUrl, deck.reviewsDocumentUrl]) {
      if (found.some((other) => isSameUrl(other, url))) continue;
      if (isDocumentIn(url, instance) && (await isDedicatedFolder(instance))) continue;
      let dataset: Dataset | null;
      try {
        dataset = await getSolidDatasetOrNull(url, fetch);
      } catch {
        // Not a document Solid Memo can read (not RDF, refused): nothing says it is the deck's.
        found.push(url);
        continue;
      }
      if ((await standing(deck, url, dataset)) === "unclaimed") found.push(url);
    }
    return found;
  }

  return {
    /** Refuse a deck that cannot be used (isDeckInPlace): deckGone, before anything is read or sent. */
    assertUsable(deck: DeckPlace): void {
      instanceOf(deck);
    },

    standing,

    unclaimed,

    /**
     * The dataset to save at `url`, one of the deck's documents, saying it
     * is the deck's (withPartOf); refused (deckDocumentUnclaimed), before
     * anything is sent, when the document is not the deck's to change. A
     * dataset not read from `url` is a new document, made only where
     * there is none yet (If-None-Match: *).
     */
    async writable(deck: DeckPlace, url: string, dataset: Dataset): Promise<Dataset> {
      const read = isReadFrom(dataset, url) ? dataset : null;
      if ((await standing(deck, url, read)) === "unclaimed")
        throw new AppError("deckDocumentUnclaimed", { deck: deck.title });
      return withPartOf(dataset, url, deck.url);
    },

    /**
     * Claim the deck's unclaimed documents, as the user confirmed: each
     * says it is the deck's from then on, in one write made only while it
     * is as read (If-Match), or, where there is none, made with that alone
     * (If-None-Match: *). Nothing else in it changes.
     */
    async claim(deck: DeckPlace): Promise<void> {
      for (const url of await unclaimed(deck)) {
        const dataset = (await getSolidDatasetOrNull(url, fetch)) ?? createSolidDataset();
        await saveDataset(url, withPartOf(dataset, url, deck.url), fetch);
      }
    },
  };
}
