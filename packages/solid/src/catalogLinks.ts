// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type NamedSubject, buildThing, getThing, getUrlAll, setThing } from "./client/rdf";
import { AppError } from "@solid-memo/domain/appError";
import { MAX_CATALOG_LINKS } from "@solid-memo/domain/deck";
import { catalogNodeUrlOf, catalogUrlOf } from "@solid-memo/domain/instanceLayout";
import { getSolidDatasetOrNull, PreconditionFailedError, saveDataset } from "./datasets";
import { unlessNewer } from "./records";

/**
 * The links an instance's catalog keeps outside every shape, to what
 * the Studio writes beside the decks (docs/data-model.md, Drafts and
 * releases): its drafts (`sm:releaseDraft`) and the releases it
 * published (`sm:publishedRelease`). CatalogV1 keeps them through every
 * write of the catalog, so they are changed here alone.
 */

/** How often a link is written, in all, while the catalog keeps changing elsewhere. */
const LINK_ATTEMPTS = 3;

export { MAX_CATALOG_LINKS };

/** `links`, unless there are more than MAX_CATALOG_LINKS of them: catalogTooManyLinks. */
export function withinCatalogLimit<L extends readonly unknown[]>(links: L): L {
  if (links.length > MAX_CATALOG_LINKS)
    throw new AppError("catalogTooManyLinks", { limit: MAX_CATALOG_LINKS });
  return links;
}

/**
 * Refuse, as catalogFull, one more deck in a catalog that has
 * MAX_CATALOG_LINKS `decks` already: past that, none of them would be
 * read (withinCatalogLimit), so an add never takes an instance there.
 */
export function refuseFullDeckList(decks: readonly unknown[]): void {
  if (decks.length >= MAX_CATALOG_LINKS)
    throw new AppError("catalogFull", { limit: MAX_CATALOG_LINKS });
}

/** The instance's catalog node, as read; null without a catalog or without one in it. */
export async function catalogNode(
  instanceUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<NamedSubject | null> {
  const catalog = await getSolidDatasetOrNull(catalogUrlOf(instanceUrl), fetch);
  return catalog === null ? null : getThing(catalog, catalogNodeUrlOf(instanceUrl));
}

/** What the catalog links by `predicate`, in the order it names them; none without a catalog, and catalogTooManyLinks past MAX_CATALOG_LINKS. */
export async function catalogLinks(
  instanceUrl: string,
  predicate: string,
  fetch: typeof globalThis.fetch,
): Promise<string[]> {
  const node = await catalogNode(instanceUrl, fetch);
  return node === null ? [] : withinCatalogLimit(getUrlAll(node, predicate));
}

/**
 * Refuse linking `url` by `predicate` where addCatalogLink would refuse
 * it after: as noCatalogToUpdate without a catalog, as writtenByNewerApp
 * when a newer version of the app wrote the catalog's node
 * (unlessNewer), and as catalogFull when the catalog links
 * MAX_CATALOG_LINKS others by it already, none of which would be read.
 */
export async function refuseFullCatalog(
  instanceUrl: string,
  predicate: string,
  url: string,
  fetch: typeof globalThis.fetch,
): Promise<void> {
  const node = await catalogNode(instanceUrl, fetch);
  if (node === null) throw new AppError("noCatalogToUpdate");
  const links = withinCatalogLimit(getUrlAll(unlessNewer(node), predicate));
  if (!links.includes(url) && links.length >= MAX_CATALOG_LINKS)
    throw new AppError("catalogFull", { limit: MAX_CATALOG_LINKS });
}

/**
 * Link `url` from the catalog by `predicate`, unless it is linked;
 * noCatalogToUpdate without a catalog, and catalogFull when it links
 * MAX_CATALOG_LINKS by `predicate` already: one more would leave none of
 * them read.
 */
export function addCatalogLink(
  instanceUrl: string,
  predicate: string,
  url: string,
  fetch: typeof globalThis.fetch,
): Promise<void> {
  return changeCatalog(instanceUrl, fetch, true, (node) => {
    const links = getUrlAll(node, predicate);
    if (links.includes(url)) return null;
    if (links.length >= MAX_CATALOG_LINKS)
      throw new AppError("catalogFull", { limit: MAX_CATALOG_LINKS });
    return buildThing(node).addUrl(predicate, url).build();
  });
}

/** Take the catalog's link to `url` by `predicate` away; nothing to do when it has none, or no catalog. */
export function removeCatalogLink(
  instanceUrl: string,
  predicate: string,
  url: string,
  fetch: typeof globalThis.fetch,
): Promise<void> {
  return changeCatalog(instanceUrl, fetch, false, (node) =>
    getUrlAll(node, predicate).includes(url)
      ? buildThing(node).removeUrl(predicate, url).build()
      : null,
  );
}

/**
 * Change the catalog's node as `change` says (null: nothing to
 * change), If-Match, read and made again on a 412, a few times. Without
 * a catalog there is no link to remove, and none can be added
 * (noCatalogToUpdate).
 */
async function changeCatalog(
  instanceUrl: string,
  fetch: typeof globalThis.fetch,
  adding: boolean,
  change: (node: NamedSubject) => NamedSubject | null,
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
      // The links are no shape's: the catalog is not checked for them, as for sm:completedChapter.
      await saveDataset(url, setThing(catalog!, changed), fetch);
      return;
    } catch (error) {
      if (!(error instanceof PreconditionFailedError) || attempt === LINK_ATTEMPTS) throw error;
    }
  }
}
