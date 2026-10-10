import { buildThing, getThing, getUrlAll, setThing, type ThingPersisted } from "@inrupt/solid-client";
import { AppError } from "@solid-memo/domain/appError";
import { catalogNodeUrlOf, catalogUrlOf } from "@solid-memo/domain/instanceLayout";
import { getSolidDatasetOrNull, PreconditionFailedError, saveDataset } from "./datasets";
import { unlessNewer } from "./records";

/**
 * The links an instance's catalogue keeps outside every shape, to what
 * the Studio writes beside the decks (docs/data-model.md, Drafts and
 * releases): its drafts (`sm:releaseDraft`) and the releases it
 * published (`sm:publishedRelease`). CatalogV1 keeps them through every
 * write of the catalogue, so they are changed here alone.
 */

/** How often a link is written, in all, while the catalogue keeps changing elsewhere. */
const LINK_ATTEMPTS = 3;

/** What the catalogue links by `predicate`, in the order it names them; none without a catalogue. */
export async function catalogLinks(instanceUrl: string, predicate: string, fetch: typeof globalThis.fetch): Promise<string[]> {
  const catalog = await getSolidDatasetOrNull(catalogUrlOf(instanceUrl), fetch);
  const node = catalog === null ? null : getThing(catalog, catalogNodeUrlOf(instanceUrl));
  return node === null ? [] : getUrlAll(node, predicate);
}

/** Link `url` from the catalogue by `predicate`, unless it is linked; noCatalogToUpdate without a catalogue. */
export function addCatalogLink(instanceUrl: string, predicate: string, url: string, fetch: typeof globalThis.fetch): Promise<void> {
  return changeCatalog(instanceUrl, fetch, true, (node) => (getUrlAll(node, predicate).includes(url) ? null : buildThing(node).addUrl(predicate, url).build()));
}

/** Take the catalogue's link to `url` by `predicate` away; nothing to do when it has none, or no catalogue. */
export function removeCatalogLink(instanceUrl: string, predicate: string, url: string, fetch: typeof globalThis.fetch): Promise<void> {
  return changeCatalog(instanceUrl, fetch, false, (node) => (getUrlAll(node, predicate).includes(url) ? buildThing(node).removeUrl(predicate, url).build() : null));
}

/**
 * Change the catalogue's node as `change` says (null: nothing to
 * change), If-Match, read and made again on a 412, a few times. Without
 * a catalogue there is no link to remove, and none can be added
 * (noCatalogToUpdate).
 */
async function changeCatalog(
  instanceUrl: string,
  fetch: typeof globalThis.fetch,
  adding: boolean,
  change: (node: ThingPersisted) => ThingPersisted | null,
): Promise<void> {
  const url = catalogUrlOf(instanceUrl);
  for (let attempt = 1; ; attempt++) {
    const catalog = await getSolidDatasetOrNull(url, fetch);
    const node = catalog === null ? null : getThing(catalog, catalogNodeUrlOf(instanceUrl));
    if (node === null) {
      if (adding) throw new AppError("noCatalogToUpdate");
      return;
    }
    const changed = change(unlessNewer(node));
    if (changed === null) return;
    try {
      // The links are no shape's: the catalogue is not checked for them, as for sm:completedChapter.
      await saveDataset(url, setThing(catalog!, changed), fetch);
      return;
    } catch (error) {
      if (!(error instanceof PreconditionFailedError) || attempt === LINK_ATTEMPTS) throw error;
    }
  }
}
