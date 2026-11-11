// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Deck } from "./deck";
import { isGuestUrl } from "./guest";
import {
  canonicalUrlOf,
  catalogUrlOf,
  instanceUrlOfDeck,
  isInstanceOwnDocument,
  isSafeDocumentUrl,
} from "./instanceLayout";
import { documentUrlOf } from "./subjectUrl";

/**
 * Where a deck's documents may be, for the instance whose catalog names
 * them (docs/data-model.md, "Where an instance's documents are"). A
 * guest's pod is this browser's (docs/guest-mode.md), so only a guest's
 * own instance may name a document in it, and a guest's instance names
 * only documents there.
 */

/** Whether `url`, as a request sends it, is in a guest's pod. */
function inGuestPod(url: string): boolean {
  return isGuestUrl(canonicalUrlOf(url) ?? url);
}

/**
 * Whether `url` may be a deck's document of the instance at
 * `instanceUrl`: one a deck's may be read at (isSafeDocumentUrl), not
 * one of the instance's own documents, and in a guest's pod exactly when
 * the instance is.
 */
export function isDeckDocumentAddress(instanceUrl: string, url: string): boolean {
  return (
    isSafeDocumentUrl(url) &&
    !isInstanceOwnDocument(instanceUrl, url) &&
    inGuestPod(url) === inGuestPod(instanceUrl)
  );
}

/**
 * Whether a deck can be used: its entry a subject of an instance's
 * catalog (`<instance>catalog.ttl#…`), and its cards and reviews
 * documents where a deck's document may be read (isSafeDocumentUrl), none
 * of them one of the instance's own documents, and in a guest's pod
 * exactly when the catalog is (isDeckDocumentAddress). Where they are is
 * otherwise free; whether one may be written to is what it says
 * (ownsDocument), only in the instance's folder or the storage the
 * instance is in (packages/solid/src/deckPlace.ts standing), and only
 * in the user's own pod (the credential gate, docs/boundaries.md). A
 * deck the catalog names otherwise is not read, written or deleted
 * through (docs/data-model.md, "Where an instance's documents are").
 */
export function isDeckInPlace(
  deck: Pick<Deck, "url" | "cardsDocumentUrl" | "reviewsDocumentUrl">,
): boolean {
  const catalog = canonicalUrlOf(documentUrlOf(deck.url));
  if (catalog === null) return false;
  const instance = instanceUrlOfDeck(catalog);
  return (
    catalog === catalogUrlOf(instance) &&
    [deck.cardsDocumentUrl, deck.reviewsDocumentUrl].every((url) =>
      isDeckDocumentAddress(instance, url),
    )
  );
}
