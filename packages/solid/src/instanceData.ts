// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { getThing, getThingAll, getUrlAll, type SolidDataset } from "@inrupt/solid-client";
import type { InstanceDeletion } from "@solid-memo/domain/instance";
import {
  cardsContainerOf,
  catalogNodeUrlOf,
  catalogUrlOf,
  digestUrlOf,
  ensureTrailingSlash,
  historyContainerOf,
  isDeckInPlace,
  isSameUrl,
  metaUrlOf,
  monthOfHistoryUrl,
  palettesUrlOf,
  preferencesUrlOf,
  reviewsContainerOf,
} from "@solid-memo/domain/instanceLayout";
import { draftPlaceOf, draftsContainerOf } from "@solid-memo/domain/release/draftLayout";
import { releasesContainerOf } from "@solid-memo/domain/release/releasePlace";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { deleteContainerIfEmpty, listContainerTree } from "./containers";
import { getSolidDatasetOrNull, type Owned, removeOwned } from "./datasets";
import { createDeckDocumentGuard } from "./deckPlace";
import { deckDocumentSubjects, solidMemoSubjects, subjectsOfClasses } from "./ownership";
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
 *    deck's to delete only (deckPlace.ts): ones that say they are the
 *    deck's, or are in the instance's own folder. The catalog is data,
 *    and one naming a document elsewhere must not lead a delete there;
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
 * published from the instance (`releases/`, never deleted) are among it.
 */
export async function deleteInstanceData(
  instanceUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<InstanceDeletion> {
  const container = ensureTrailingSlash(instanceUrl);
  const meta = metaUrlOf(container);
  const catalogUrl = catalogUrlOf(container);
  const catalog = await readCatalog(catalogUrl, fetch);
  const named =
    catalog === UNREADABLE || catalog === null ? [] : deckDocumentsOf(catalog, catalogUrl);
  const deckDocuments = await deletableDeckDocuments(named, fetch);
  const history = historyContainerOf(container);
  const months = (await listContainerTree(history, fetch)).filter(
    (url) => monthOfHistoryUrl(container, url) !== null,
  );
  const kept: string[] = [];
  const remove = async (url: string, owns: (dataset: SolidDataset) => Owned) => {
    if ((await removeOwned(url, owns, fetch)) === "kept") kept.push(url);
  };
  const deckSubjects = deckDocumentSubjects(named.map(({ entry }) => entry));
  for (const url of deckDocuments) await remove(url, deckSubjects);
  for (const url of months) await remove(url, subjectsOfClasses(SM.Answer));
  for (const draft of catalog === UNREADABLE || catalog === null
    ? []
    : draftsOf(catalog, container)) {
    kept.push(...(await deleteDraftResources(draft, fetch)));
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
    keptReleases: (await fetch(releasesContainerOf(container), { method: "HEAD" })).ok,
    keptDocuments: kept,
  };
}

const UNREADABLE = Symbol("unreadable");

/**
 * The catalog, read afresh; null when there is none, UNREADABLE when
 * the pod served it but it could not be read (not Turtle, or not RDF at
 * all). Any other failure throws, so the delete can be tried again.
 */
async function readCatalog(
  url: string,
  fetch: typeof globalThis.fetch,
): Promise<SolidDataset | null | typeof UNREADABLE> {
  let served = false;
  // A fetch of its own, so the read is not one remembered from before.
  const noting = (async (input, init) => {
    const response = await fetch(input, init);
    served = response.ok;
    return response;
  }) as typeof globalThis.fetch;
  try {
    return await getSolidDatasetOrNull(url, noting);
  } catch (error) {
    if (served) return UNREADABLE;
    throw error;
  }
}

/** The drafts the instance's catalog links that are in its `drafts/`: a link elsewhere is never followed to a delete. */
function draftsOf(catalog: SolidDataset, container: string): string[] {
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
function deckDocumentsOf(
  catalog: SolidDataset,
  catalogUrl: string,
): { entry: string; url: string }[] {
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
 * Of the decks' documents, those that are their decks' to delete: at an
 * address a deck's may be (isDeckInPlace) and not unclaimed (deckPlace.ts).
 * An unclaimed document may be anyone's, and is kept.
 */
async function deletableDeckDocuments(
  named: readonly { entry: string; url: string }[],
  fetch: typeof globalThis.fetch,
): Promise<string[]> {
  const guard = createDeckDocumentGuard(fetch);
  const deletable: string[] = [];
  for (const { entry, url } of named) {
    const deck = { url: entry, title: {}, cardsDocumentUrl: url, reviewsDocumentUrl: url };
    if (deletable.includes(url) || !isDeckInPlace(deck)) continue;
    if ((await guard.unclaimed(deck)).length === 0) deletable.push(url);
  }
  return deletable;
}
