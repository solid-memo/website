// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Deck } from "@solid-memo/domain/deck";
import { isGuestUrl } from "@solid-memo/domain/guest";
import { catalogUrlOf, isDocumentIn } from "@solid-memo/domain/instanceLayout";
import type { StorageGateway } from "./ports/session";

/** Which of a deck's documents are read as no one for an instance (ReadScope.asNoOneOf). */
export interface DeckPlace {
  cards: boolean;
  reviews: boolean;
}

/**
 * Whose a document is, for the use cases that read it for an instance:
 * one is read as the user only when it is the instance's, and as no one
 * otherwise. An instance attached from someone else's pod may name a
 * document of the user's own that was kept from everyone, which must not
 * be read as the user and copied into the instance, or made public by
 * it. Made once for the page, for whoever is signed in at each call.
 */
export interface ReadScope {
  /**
   * Whether the document at `url` (a release, a deck's cards) is the
   * instance's: in the instance, or in one of the signed-in user's
   * storages that holds the instance too, each as a request sends the
   * address. With no one signed in, or the storages not found, only a
   * document in the instance is. The guest's pod is this browser's, so
   * any document in it is the guest's instance's, as the storage the
   * guest's profile names (the pod's root) holds both.
   */
  isInstances(instanceUrl: string, url: string): Promise<boolean>;
  /** Which of the deck's two documents are read as no one: each that is not the instance's (isInstances). */
  asNoOneOf(
    instanceUrl: string,
    deck: Pick<Deck, "cardsDocumentUrl" | "reviewsDocumentUrl">,
  ): Promise<DeckPlace>;
}

export function createReadScope({
  storageGateway,
  webId,
}: {
  storageGateway: Pick<StorageGateway, "discoverStorages">;
  /** The WebID of whoever is signed in, asked at each call; none when no one is. */
  webId: () => string | undefined;
}): ReadScope {
  /**
   * The storages of each WebID, found once per WebID for this page: a
   * deck list asks of every deck of the catalog, and each would otherwise
   * read the user's profile again. A search that failed is not kept, so
   * the next asks again.
   */
  const storagesFound = new Map<string, ReturnType<StorageGateway["discoverStorages"]>>();
  function storagesOf(user: string): ReturnType<StorageGateway["discoverStorages"]> {
    let found = storagesFound.get(user);
    if (found === undefined) {
      found = storageGateway.discoverStorages(user);
      storagesFound.set(user, found);
      found.catch(() => storagesFound.delete(user));
    }
    return found;
  }
  async function isInstances(instanceUrl: string, url: string): Promise<boolean> {
    if (isDocumentIn(url, instanceUrl)) return true;
    if (isGuestUrl(instanceUrl)) return isGuestUrl(url);
    const user = webId();
    if (user === undefined) return false;
    const storages = await storagesOf(user).catch(() => []);
    return storages.some(
      (storage) =>
        isDocumentIn(url, storage.url) && isDocumentIn(catalogUrlOf(instanceUrl), storage.url),
    );
  }
  return {
    isInstances,
    async asNoOneOf(instanceUrl, deck) {
      const [cards, reviews] = await Promise.all([
        isInstances(instanceUrl, deck.cardsDocumentUrl),
        isInstances(instanceUrl, deck.reviewsDocumentUrl),
      ]);
      return { cards: !cards, reviews: !reviews };
    },
  };
}
