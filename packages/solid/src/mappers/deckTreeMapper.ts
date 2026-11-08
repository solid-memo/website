// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  asUrl,
  buildThing,
  getInteger,
  getThing,
  getThingAll,
  getUrlAll,
} from "../client/rdf";
import { editOf } from "../datasetEdit";
import {
  deckGroupFromRecord,
  deckGroupToRecord,
  usablePosition,
} from "@solid-memo/domain/deckGroupRecord";
import type { StoredGroup, StoredLayout, TreeChanges } from "@solid-memo/domain/deckTree";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { DECK_GROUP_V1 } from "@solid-memo/vocab/descriptors.generated";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import {
  readIri,
  readIris,
  readVersioned,
  recordThing,
  removeAllUnlessNewer,
  storedVersionOf,
  unlessNewer,
} from "../records";
import { DCAT, DCTERMS, RDF, SM } from "../vocab";
import { toDecks } from "./deckMapper";

/**
 * The deck groups of a catalog document (docs/data-model.md "Deck
 * groups") between the pod and domain/deckTree.ts: what the document
 * states of the arrangement, and the document with an arrangement's
 * changes written.
 *
 * A group the app cannot read (one that does not fit its shape) is not
 * part of the layout and is never written: its members are at the top
 * level, and the catalog's `dcat:catalog` keeps listing it. A group in
 * a newer format than this app's makes the whole layout read-only. A
 * subject read as a deck is a deck, never also a group, whatever else
 * it is typed as: the tree holds each node once.
 */

/** The subjects typed as groups, but for those in `decks`. */
function groupThings(dataset: Dataset, decks: ReadonlySet<string>) {
  return getThingAll(dataset).filter(
    (thing) => getUrlAll(thing, RDF.type).includes(SM.DeckGroup) && !decks.has(asUrl(thing)),
  );
}

/** The arrangement a catalog document (at `catalogUrl`) states. */
export function toStoredLayout(dataset: Dataset, catalogUrl: string): StoredLayout {
  const decks = toDecks(dataset, catalogUrl);
  const things = groupThings(dataset, new Set(decks.map((deck) => deck.url)));
  const readOnly = things.some((thing) => storedVersionOf(thing) > LATEST_VERSION.deckGroup);
  const groups: StoredGroup[] = [];
  for (const thing of things) {
    const read = readVersioned(thing, "deckGroup");
    if (read === null) continue;
    const url = asUrl(thing);
    groups.push(deckGroupFromRecord(url, migrate("deckGroup", read.record, { subject: url })));
  }
  const deckPositions = new Map<string, number>();
  for (const deck of decks) {
    const position = getInteger(getThing(dataset, deck.url)!, SM.position);
    // A position the tree would not keep is none, as a group's is (usablePosition).
    if (usablePosition(position)) deckPositions.set(deck.url, position);
  }
  const root = getThing(dataset, `${catalogUrl}#catalog`);
  return {
    decks,
    deckPositions,
    groups,
    rootGroups: root === null ? [] : readIris(root, DCAT.catalog),
    readOnly,
  };
}

/**
 * The catalog document with an arrangement's changes (domain/deckTree.ts
 * `treeChanges`) written, and the subjects to check before it is saved:
 * the groups written and the catalog. Groups are written in their
 * shape's format, a new one published by the catalog's publisher; the
 * catalog's `dcat:catalog` and the decks' `sm:position` are triples no
 * shape owns, written as they are. A member link to a node the layout
 * does not have is kept only when it names a dataset (or catalog) the
 * document says is one, or a node in another document; a link to what
 * is gone is dropped as its list is written. The removals are made at
 * once, and so are the subjects written (setThings): a subject at a
 * time would copy the whole document at each, in the square of the
 * groups and decks a rearrangement renumbers.
 */
export function withTreeChanges(
  dataset: Dataset,
  catalogUrl: string,
  changes: TreeChanges,
): { dataset: Dataset; subjects: string[] } {
  const layout = toStoredLayout(dataset, catalogUrl);
  const deckUrls = new Set(layout.decks.map((deck) => deck.url));
  const groupUrls = new Set(layout.groups.map((entry) => entry.group.url));
  const known = new Set([...deckUrls, ...groupUrls]);
  const typed = (type: string) =>
    new Set(
      getThingAll(dataset)
        .filter((thing) => getUrlAll(thing, RDF.type).includes(type))
        .map(asUrl),
    );
  const datasets = typed(DCAT.Dataset);
  // A group the app cannot read may lack its `dcat:Catalog` type: a link to it is still one to a catalog.
  const catalogs = new Set([...typed(DCAT.Catalog), ...typed(SM.DeckGroup)]);
  /** The links to keep beside the layout's own: to what the document says is of that kind, or what is elsewhere. */
  const foreign = (links: readonly string[], kind: ReadonlySet<string>) =>
    links.filter((url) => !known.has(url) && (kind.has(url) || !url.startsWith(`${catalogUrl}#`)));

  const rootUrl = `${catalogUrl}#catalog`;
  const root = getThing(dataset, rootUrl);
  const noCatalog = () => new Error("Deck groups need the catalog, and its publisher");
  // A publisher that is no URL is none: a new group could not be written with it.
  const publisher = () => {
    const url = root === null ? null : readIri(root, DCTERMS.publisher);
    if (url === null) throw noCatalog();
    return url;
  };

  const edit = editOf(removeAllUnlessNewer(dataset, changes.groupsRemoved));

  const stored = new Map(layout.groups.map((entry) => [entry.group.url, entry]));
  const titles = new Map(
    [...changes.groupsAdded, ...changes.groupsRetitled].map((group) => [group.url, group]),
  );
  const written = new Set([
    ...titles.keys(),
    ...changes.members.keys(),
    ...[...changes.positions.keys()].filter((url) => stored.has(url) || titles.has(url)),
  ]);
  for (const url of written) {
    const before = stored.get(url);
    const existing = edit.getThing(url);
    // A new group's URL is minted by the client: one the document already has is not this app's to write.
    if (before === undefined && existing !== null)
      throw new Error(`${url} is already in the catalog document`);
    const previous =
      before === undefined ? undefined : readVersioned(existing!, "deckGroup")!.record.data;
    const members = changes.members.get(url) ?? {
      decks: before!.decks.filter((link) => deckUrls.has(link)),
      groups: before!.groups.filter((link) => groupUrls.has(link)),
    };
    const position = changes.positions.get(url) ?? before?.position;
    // A link the group has that is no URL (readIris) is no member, and stays as it is (setIriAll).
    const linked = (link: string) => (existing === null ? [] : getUrlAll(existing, link));
    const group: StoredGroup = {
      group: titles.get(url) ?? before!.group,
      decks: [...members.decks, ...foreign(linked(DCAT.dataset), datasets)],
      groups: [...members.groups, ...foreign(linked(DCAT.catalog), catalogs)],
      ...(position === undefined ? {} : { position }),
    };
    const record = deckGroupToRecord(group, previous?.publisher ?? publisher(), previous);
    edit.setThing(recordThing(url, DECK_GROUP_V1, record, existing));
  }

  for (const [url, position] of changes.positions) {
    if (written.has(url)) continue;
    edit.setThing(
      buildThing(unlessNewer(edit.getThing(url)!))
        .setInteger(SM.position, position)
        .build(),
    );
  }

  if (changes.rootGroups !== undefined) {
    if (root === null) throw noCatalog();
    // Set in one call (setIriAll): a link that is no URL, which another app may have written, stays as it is.
    edit.setThing(
      buildThing(unlessNewer(edit.getThing(rootUrl)!))
        .setIriAll(DCAT.catalog, [
          ...changes.rootGroups,
          ...foreign(getUrlAll(root, DCAT.catalog), catalogs),
        ])
        .build(),
    );
  }

  return { dataset: edit.done(), subjects: [...written, ...(root === null ? [] : [rootUrl])] };
}
