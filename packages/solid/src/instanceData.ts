import { getThingAll, getUrlAll, type SolidDataset } from "@inrupt/solid-client";
import type { InstanceDeletion } from "@solid-memo/domain/instance";
import {
  cardsContainerOf,
  catalogUrlOf,
  digestUrlOf,
  ensureTrailingSlash,
  historyContainerOf,
  metaUrlOf,
  monthOfHistoryUrl,
  preferencesUrlOf,
  reviewsContainerOf,
} from "@solid-memo/domain/instanceLayout";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { deleteContainerIfEmpty, listContainerTree } from "./containers";
import { deleteIfPresent, getSolidDatasetOrNull } from "./datasets";
import { RDF, SM } from "./vocab";

/**
 * Delete what an instance holds of Solid Memo's, and nothing else
 * (docs/data-model.md "Deleting an instance"): a folder in the user's pod
 * may hold files other apps put there, which are not Solid Memo's to
 * delete. What Solid Memo knows it wrote:
 *
 * 1. every deck's cards and reviews documents, as the catalogue names
 *    them (`sm:cardsDocument`, `sm:reviewsDocument`), those below the
 *    container only: the catalogue is data, and one naming a document
 *    elsewhere must not lead a delete there;
 * 2. the answer log's months, `history/<YYYY-MM>.ttl`;
 * 3. the preferences, the digest, then the catalogue, which named the
 *    decks' documents, so a delete that fails before it can be retried
 *    (a catalogue the pod serves but that cannot be read is kept, and
 *    with it the decks' documents, which nothing else names);
 * 4. `decks/`, `reviews/` and `history/`, each only if it is then empty;
 * 5. `meta.ttl` last of the documents, so a partly deleted instance still
 *    attaches by URL;
 * 6. the instance's container, only if it is then empty.
 *
 * A document's access control (its `.acl`) goes with it: the Solid
 * Protocol has the server delete a resource's auxiliary resources with
 * it. A resource already gone counts as deleted. What is left is kept,
 * and so is the container holding it, which the result names.
 */
export async function deleteInstanceData(
  instanceUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<InstanceDeletion> {
  const container = ensureTrailingSlash(instanceUrl);
  const meta = metaUrlOf(container);
  const catalogUrl = catalogUrlOf(container);
  const catalog = await readCatalog(catalogUrl, fetch);
  const deckDocuments = (catalog === UNREADABLE || catalog === null ? [] : deckDocumentsOf(catalog)).filter(
    (url) => url.startsWith(container) && !url.endsWith("/") && url !== meta && url !== catalogUrl,
  );
  const history = historyContainerOf(container);
  const months = (await listContainerTree(history, fetch)).filter(
    (url) => monthOfHistoryUrl(container, url) !== null,
  );
  for (const url of [
    ...new Set(deckDocuments),
    ...months,
    preferencesUrlOf(container),
    digestUrlOf(container),
    // A catalogue that cannot be read is the one record of the decks' documents, which are kept: so is it.
    ...(catalog === UNREADABLE ? [] : [catalogUrl]),
  ]) {
    await deleteIfPresent(url, fetch);
  }
  for (const subcontainer of [cardsContainerOf(container), reviewsContainerOf(container), history]) {
    await deleteContainerIfEmpty(subcontainer, fetch);
  }
  await deleteIfPresent(meta, fetch);
  return { keptFolder: (await deleteContainerIfEmpty(container, fetch)) ? null : container };
}

const UNREADABLE = Symbol("unreadable");

/**
 * The catalogue, read afresh; null when there is none, UNREADABLE when
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

/** The cards and reviews documents every deck of a catalog document names, whether or not the deck fits its shape. */
function deckDocumentsOf(catalog: SolidDataset): string[] {
  return getThingAll(catalog)
    .filter((thing) => getUrlAll(thing, RDF.type).includes(SM.Deck))
    .flatMap((thing) => [...getUrlAll(thing, SM.cardsDocument), ...getUrlAll(thing, SM.reviewsDocument)])
    .map(documentUrlOf);
}
