import {
  asUrl,
  buildThing,
  getInteger,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  removeThing,
  setThing,
  type SolidDataset,
} from "@inrupt/solid-client";
import { deckGroupFromRecord, deckGroupToRecord } from "@solid-memo/domain/deckGroupRecord";
import type { StoredGroup, StoredLayout, TreeChanges } from "@solid-memo/domain/deckTree";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { DECK_GROUP_V1 } from "@solid-memo/vocab/descriptors.generated";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { readVersioned, recordThing, storedVersionOf } from "../records";
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
 * level, and the catalogue's `dcat:catalog` keeps listing it. A group in
 * a newer format than this app's makes the whole layout read-only.
 */

function groupThings(dataset: SolidDataset) {
  return getThingAll(dataset).filter((thing) => getUrlAll(thing, RDF.type).includes(SM.DeckGroup));
}

/** The arrangement a catalog document (at `catalogUrl`) states. */
export function toStoredLayout(dataset: SolidDataset, catalogUrl: string): StoredLayout {
  const things = groupThings(dataset);
  const readOnly = things.some((thing) => storedVersionOf(thing) > LATEST_VERSION.deckGroup);
  const groups: StoredGroup[] = [];
  for (const thing of things) {
    const read = readVersioned(thing, "deckGroup");
    if (read === null) continue;
    const url = asUrl(thing);
    groups.push(deckGroupFromRecord(url, migrate("deckGroup", read.record, { subject: url })));
  }
  const decks = toDecks(dataset);
  const deckPositions = new Map<string, number>();
  for (const deck of decks) {
    const position = getInteger(getThing(dataset, deck.url)!, SM.position);
    if (position !== null) deckPositions.set(deck.url, position);
  }
  const root = getThing(dataset, `${catalogUrl}#catalog`);
  return { decks, deckPositions, groups, rootGroups: root === null ? [] : getUrlAll(root, DCAT.catalog), readOnly };
}

/**
 * The catalog document with an arrangement's changes (domain/deckTree.ts
 * `treeChanges`) written, and the subjects to check before it is saved:
 * the groups written and the catalogue. Groups are written in their
 * shape's format, a new one published by the catalogue's publisher; the
 * catalogue's `dcat:catalog` and the decks' `sm:position` are triples no
 * shape owns, written as they are. A member link to a node the layout
 * does not have is kept only when it names a dataset (or catalogue) the
 * document says is one, or a node in another document; a link to what
 * is gone is dropped as its list is written.
 */
export function withTreeChanges(
  dataset: SolidDataset,
  catalogUrl: string,
  changes: TreeChanges,
): { dataset: SolidDataset; subjects: string[] } {
  const layout = toStoredLayout(dataset, catalogUrl);
  const deckUrls = new Set(layout.decks.map((deck) => deck.url));
  const groupUrls = new Set(layout.groups.map((entry) => entry.group.url));
  const known = new Set([...deckUrls, ...groupUrls]);
  const typed = (type: string) =>
    new Set(getThingAll(dataset).filter((thing) => getUrlAll(thing, RDF.type).includes(type)).map(asUrl));
  const datasets = typed(DCAT.Dataset);
  // A group the app cannot read may lack its `dcat:Catalog` type: a link to it is still one to a catalogue.
  const catalogs = new Set([...typed(DCAT.Catalog), ...typed(SM.DeckGroup)]);
  /** The links to keep beside the layout's own: to what the document says is of that kind, or what is elsewhere. */
  const foreign = (links: readonly string[], kind: ReadonlySet<string>) =>
    links.filter((url) => !known.has(url) && (kind.has(url) || !url.startsWith(`${catalogUrl}#`)));

  const rootUrl = `${catalogUrl}#catalog`;
  const root = getThing(dataset, rootUrl);
  const noCatalogue = () => new Error("Deck groups need the catalogue, and its publisher");
  const publisher = () => {
    const url = root === null ? null : getUrl(root, DCTERMS.publisher);
    if (url === null) throw noCatalogue();
    return url;
  };

  let updated = dataset;
  for (const url of changes.groupsRemoved) updated = removeThing(updated, url);

  const stored = new Map(layout.groups.map((entry) => [entry.group.url, entry]));
  const titles = new Map([...changes.groupsAdded, ...changes.groupsRetitled].map((group) => [group.url, group]));
  const written = new Set([
    ...titles.keys(),
    ...changes.members.keys(),
    ...[...changes.positions.keys()].filter((url) => stored.has(url) || titles.has(url)),
  ]);
  for (const url of written) {
    const before = stored.get(url);
    const existing = getThing(updated, url);
    // A new group's URL is minted by the client: one the document already has is not this app's to write.
    if (before === undefined && existing !== null) throw new Error(`${url} is already in the catalog document`);
    const previous = before === undefined ? undefined : readVersioned(existing!, "deckGroup")!.record.data;
    const members = changes.members.get(url) ?? {
      decks: before!.decks.filter((link) => deckUrls.has(link)),
      groups: before!.groups.filter((link) => groupUrls.has(link)),
    };
    const position = changes.positions.get(url) ?? before?.position;
    const group: StoredGroup = {
      group: titles.get(url) ?? before!.group,
      decks: [...members.decks, ...foreign(before?.decks ?? [], datasets)],
      groups: [...members.groups, ...foreign(before?.groups ?? [], catalogs)],
      ...(position === undefined ? {} : { position }),
    };
    const record = deckGroupToRecord(group, previous?.publisher ?? publisher(), previous);
    updated = setThing(updated, recordThing(url, DECK_GROUP_V1, record, existing));
  }

  for (const [url, position] of changes.positions) {
    if (written.has(url)) continue;
    updated = setThing(updated, buildThing(getThing(updated, url)!).setInteger(SM.position, position).build());
  }

  if (changes.rootGroups !== undefined) {
    if (root === null) throw noCatalogue();
    let builder = buildThing(getThing(updated, rootUrl)!).removeAll(DCAT.catalog);
    for (const url of [...changes.rootGroups, ...foreign(getUrlAll(root!, DCAT.catalog), catalogs)]) {
      builder = builder.addIri(DCAT.catalog, url);
    }
    updated = setThing(updated, builder.build());
  }

  return { dataset: updated, subjects: [...written, ...(root === null ? [] : [rootUrl])] };
}
