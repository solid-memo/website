// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type Dataset, getThing, getThingAll, getUrlAll } from "./client/rdf";
import type { InstanceDeletion } from "@solid-memo/domain/instance";
import {
  cardsContainerOf,
  catalogNodeUrlOf,
  catalogUrlOf,
  digestUrlOf,
  ensureTrailingSlash,
  historyContainerOf,
  isDocumentIn,
  isSameUrl,
  metaUrlOf,
  monthOfHistoryUrl,
  palettesUrlOf,
  preferencesUrlOf,
  reviewsContainerOf,
} from "@solid-memo/domain/instanceLayout";
import { isDeckInPlace } from "@solid-memo/domain/deckAddress";
import { draftPlaceOf, draftsContainerOf } from "@solid-memo/domain/release/draftLayout";
import {
  isPublishedReleaseUrl,
  releasesContainerOf,
} from "@solid-memo/domain/release/releasePlace";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { deleteContainerIfEmpty, listContainer } from "./containers";
import { type Owned, readForRemoval, removeOwned, UNREADABLE } from "./datasets";
import { createDeckDocumentGuard, type DeckPlace, type UserStorages } from "./deckPlace";
import {
  deckDocumentSubjects,
  isDeckItself,
  solidMemoSubjects,
  subjectsOfClasses,
} from "./ownership";
import { deleteDraftResources } from "./solidReleaseDraftRepository";
import { RDF, SM } from "./vocab";

/**
 * Delete what an instance holds of Solid Memo's, and nothing else
 * (docs/data-model.md "Deleting an instance"): a folder in the user's pod
 * may hold files other apps put there, which are not Solid Memo's to
 * delete. What Solid Memo knows it wrote:
 *
 * 1. every deck's cards and reviews documents, as the catalog names
 *    them (`sm:cardsDocument`, `sm:reviewsDocument`), those that are the
 *    deck's to delete only (deckPlace.ts, with `userStorages`): ones
 *    that say they are the deck's, in the instance's storage, or are in
 *    the instance's own folder. The catalog is data,
 *    and one naming a document elsewhere must not lead a delete there,
 *    nor one naming a release (a document that is a deck itself) or a
 *    draft's document anywhere lead to what is in it being removed;
 * 2. the answer log's months, `history/<YYYY-MM>.ttl`;
 * 3. the drafts the catalog links (`sm:releaseDraft`), those in the
 *    instance's `drafts/` only: each draft's documents and its folders,
 *    as deleting the draft does (deleteDraftResources);
 * 4. the preferences, the palettes, the digest, then the catalog, which
 *    named the decks' documents and the drafts, so a delete that fails before it
 *    can be retried (a catalog the pod serves but that cannot be read
 *    is kept, and with it the decks' documents and the drafts, which
 *    nothing else names);
 * 5. `decks/`, `reviews/`, `history/` and `drafts/`, each only if it is
 *    then empty;
 * 6. `meta.ttl` last of the documents, so a partly deleted instance still
 *    attaches by URL;
 * 7. the instance's container, only if it is then empty.
 *
 * From each document only what is Solid Memo's of its kind is removed
 * (datasets.ts removeOwned, ownership.ts): a deck's cards, distractors
 * and review states, the answers, the preferences, the palettes and
 * their color sets, the digest's receipts, schedules and month summaries, the catalog's
 * subjects, the instance's
 * `#it`; a document is deleted only when nothing else is left in it,
 * and one that also holds another app's data is kept with that, which
 * the result names (`keptDocuments`). A document's access control (its
 * `.acl`) goes with it: the Solid Protocol has the server delete a
 * resource's auxiliary resources with it. A resource already gone
 * counts as deleted. What is left is kept, and so is the container
 * holding it, which the result names, with whether the releases
 * published from the instance (never deleted: in `releases/`, any other
 * folder of the instance the catalog links one in, or one the catalog
 * names as a deck's document) are among it.
 */
export async function deleteInstanceData(
  instanceUrl: string,
  fetch: typeof globalThis.fetch,
  userStorages?: UserStorages,
): Promise<InstanceDeletion> {
  const container = ensureTrailingSlash(instanceUrl);
  const meta = metaUrlOf(container);
  const catalogUrl = catalogUrlOf(container);
  // Afresh; a catalog that fails to be read throws, so the delete can be tried again.
  const catalog = await readForRemoval(catalogUrl, fetch);
  const named =
    catalog === UNREADABLE || catalog === null ? [] : deckDocumentsOf(catalog, catalogUrl);
  const guard = createDeckDocumentGuard(fetch, userStorages);
  const { deletable: deckDocuments, unreadable } = await deletableDeckDocuments(named, guard);
  const history = historyContainerOf(container);
  // A month's document is one of history/'s own (monthOfHistoryUrl): no folder below it is listed.
  const months = (await listContainer(history, fetch)).filter(
    (url) => monthOfHistoryUrl(container, url) !== null,
  );
  const kept = [...unreadable];
  const remove = async (
    url: string,
    owns: (dataset: Dataset) => Owned,
    read?: Parameters<typeof removeOwned>[3],
  ) => {
    if ((await removeOwned(url, owns, fetch, read)) === "kept") kept.push(url);
  };
  const deckSubjects = deckDocumentSubjects(named.map(({ entry }) => entry));
  // A release named as a deck's document is kept whole (deckDocumentSubjects), as a release, not as another app's data.
  let releaseKept = false;
  for (const [url, deck] of deckDocuments) {
    let isRelease = false;
    const removal = await removeOwned(
      url,
      (dataset) => {
        isRelease = isDeckItself(dataset, url);
        return deckSubjects(dataset);
      },
      fetch,
      () => guard.readToRemove(deck, url),
    );
    if (isRelease) releaseKept = true;
    else if (removal === "kept") kept.push(url);
  }
  const linkedReleases =
    catalog === UNREADABLE || catalog === null ? [] : releasesElsewhereOf(catalog, container);
  for (const url of months) await remove(url, subjectsOfClasses(SM.Answer));
  for (const draft of catalog === UNREADABLE || catalog === null
    ? []
    : draftsOf(catalog, container)) {
    for (const url of await deleteDraftResources(draft, fetch)) kept.push(url);
  }
  await remove(preferencesUrlOf(container), subjectsOfClasses(SM.Preferences));
  await remove(palettesUrlOf(container), subjectsOfClasses(SM.Palette, SM.ColorSet));
  await remove(
    digestUrlOf(container),
    subjectsOfClasses(SM.DocumentReceipt, SM.DeckSchedule, SM.MonthSummary),
  );
  // A catalog that cannot be read is the one record of the decks' documents, which are kept: so is it.
  if (catalog !== UNREADABLE) await remove(catalogUrl, solidMemoSubjects);
  for (const subcontainer of [
    cardsContainerOf(container),
    reviewsContainerOf(container),
    history,
    draftsContainerOf(container),
  ]) {
    await deleteContainerIfEmpty(subcontainer, fetch);
  }
  await remove(meta, subjectsOfClasses(SM.Instance));
  if (await deleteContainerIfEmpty(container, fetch))
    return { keptFolder: null, keptReleases: false, keptDocuments: kept };
  // Releases others may read by their address are never deleted: the user is told they are why the folder is kept.
  return {
    keptFolder: container,
    keptReleases:
      releaseKept ||
      (await fetch(releasesContainerOf(container), { method: "HEAD" })).ok ||
      (await anyThere(linkedReleases, fetch)),
    keptDocuments: kept,
  };
}

/**
 * The releases the instance's catalog links (`sm:publishedRelease`) in
 * its folder but outside `releases/`, at an address a release may have
 * (isPublishedReleaseUrl): a creator may publish into any folder, and
 * such a release is kept too.
 */
function releasesElsewhereOf(catalog: Dataset, container: string): string[] {
  const node = getThing(catalog, catalogNodeUrlOf(container));
  return node === null
    ? []
    : getUrlAll(node, SM.publishedRelease).filter(
        (url) =>
          isPublishedReleaseUrl(url) &&
          isDocumentIn(url, container) &&
          !isDocumentIn(url, releasesContainerOf(container)),
      );
}

/** Whether any of the documents is there, asked one at a time until one is. */
async function anyThere(urls: readonly string[], fetch: typeof globalThis.fetch): Promise<boolean> {
  for (const url of urls) if ((await fetch(url, { method: "HEAD" })).ok) return true;
  return false;
}

/** The drafts the instance's catalog links that are in its `drafts/`: a link elsewhere is never followed to a delete. */
function draftsOf(catalog: Dataset, container: string): string[] {
  const node = getThing(catalog, catalogNodeUrlOf(container));
  return node === null
    ? []
    : getUrlAll(node, SM.releaseDraft).filter(
        (url) => draftPlaceOf(url)?.instanceUrl === container,
      );
}

/**
 * The cards and reviews documents every deck of a catalog document
 * names, whether or not the deck fits its shape, each with the entry
 * naming it: entries of this document only.
 */
function deckDocumentsOf(catalog: Dataset, catalogUrl: string): { entry: string; url: string }[] {
  return getThingAll(catalog)
    .filter(
      (thing) =>
        getUrlAll(thing, RDF.type).includes(SM.Deck) &&
        isSameUrl(documentUrlOf(thing.url), catalogUrl),
    )
    .flatMap((thing) =>
      [...getUrlAll(thing, SM.cardsDocument), ...getUrlAll(thing, SM.reviewsDocument)].map(
        (url) => ({ entry: thing.url, url: documentUrlOf(url) }),
      ),
    );
}

/**
 * Of the decks' documents, those that are their decks' to delete, each
 * with its deck: at an address a deck's may be (isDeckInPlace) and not
 * unclaimed (deckPlace.ts). An unclaimed document may be anyone's, and is kept; one not read
 * (deckPlace.ts, readToRemove) is kept too, and named. A failed read of
 * any other throws here, before anything is deleted.
 */
async function deletableDeckDocuments(
  named: readonly { entry: string; url: string }[],
  guard: ReturnType<typeof createDeckDocumentGuard>,
): Promise<{ deletable: ReadonlyMap<string, DeckPlace>; unreadable: string[] }> {
  const deletable = new Map<string, DeckPlace>();
  const unreadable = new Set<string>();
  for (const { entry, url } of named) {
    const deck = { url: entry, title: {}, cardsDocumentUrl: url, reviewsDocumentUrl: url };
    if (deletable.has(url) || !isDeckInPlace(deck)) continue;
    const standing = await guard.removal(deck, url);
    if (standing === "deletable") deletable.set(url, deck);
    if (standing === "unreadable") unreadable.add(url);
  }
  return { deletable, unreadable: [...unreadable] };
}
