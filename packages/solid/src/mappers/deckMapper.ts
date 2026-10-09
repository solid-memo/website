import {
  asUrl,
  buildThing,
  getThing,
  getThingAll,
  getUrlAll,
  removeThing,
  setThing,
  type SolidDataset,
  type Thing,
} from "@inrupt/solid-client";
import { agentUrlOf, authorFromAgentRecord } from "@solid-memo/domain/agentRecord";
import {
  catalogFromRecord,
  catalogToRecord,
  publisherToRecord,
  type Catalog,
} from "@solid-memo/domain/catalog";
import type { Card, Deck, Distractor } from "@solid-memo/domain/deck";
import {
  cardFromRecord,
  deckAgents,
  deckDistribution,
  deckFromRecord,
  deckToRecord,
  distractorFromRecord,
  distractorToRecord,
} from "@solid-memo/domain/deckRecord";
import { distributionUrlOf } from "@solid-memo/domain/dcat";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { AGENT_V1, CATALOG_V1, DECK_V6, DISTRACTOR_V1, DISTRIBUTION_V1 } from "@solid-memo/vocab/descriptors.generated";
import { readVersioned, recordThing } from "../records";
import { DCAT, DCTERMS, RDF, SM } from "../vocab";

export { fragmentIdOf } from "@solid-memo/domain/subjectUrl";

/** Every agent of a document by URL, named "Name <email>". */
export function agentNamesOf(dataset: SolidDataset): Map<string, string> {
  const names = new Map<string, string>();
  for (const thing of getThingAll(dataset)) {
    const read = readVersioned(thing, "agent");
    if (read === null) continue;
    const url = asUrl(thing);
    names.set(url, authorFromAgentRecord(migrate("agent", read.record, { subject: url })));
  }
  return names;
}

/** Every deck of a catalog document, its creators named from the agents beside it. */
export function toDecks(dataset: SolidDataset): Deck[] {
  const names = agentNamesOf(dataset);
  return getThingAll(dataset)
    .map((thing) => toDeck(thing, names))
    .filter((deck): deck is Deck => deck !== null);
}

/**
 * Map a catalog subject to a Deck; null when the subject is not an
 * sm:Deck that fits its format's shape. An older format is brought up to
 * the current one in memory; the stored version stays on the model. A
 * course's deck also has the chapters it completed (sm:completedChapter). A
 * deck from before format 3 names its creators itself ("Name <email>"),
 * which name the agents the migration gives it.
 */
export function toDeck(thing: Thing, agentNames: ReadonlyMap<string, string> = new Map()): Deck | null {
  const read = readVersioned(thing, "deck");
  if (read === null) return null;
  const url = asUrl(thing);
  const names = new Map(agentNames);
  if (read.record.version < 3) {
    for (const author of read.record.data.creator) names.set(agentUrlOf(url, author), author);
  }
  const completedChapters = getUrlAll(thing, SM.completedChapter);
  return {
    ...deckFromRecord(
      url,
      read.storedVersion,
      migrate("deck", read.record, { subject: url }),
      (agent) => names.get(agent) ?? agent,
    ),
    // Outside the deck's shape, like sm:position: every write of the entry keeps it (recordThing).
    ...(completedChapters.length === 0 ? {} : { completedChapters }),
  };
}

/**
 * The catalog document with a deck written in this app's format, onto
 * its existing subject when there is one (so unknown triples survive),
 * with its creators' agent nodes and its distribution beside it, and
 * listed by the catalogue. Agents no deck names any more are removed.
 */
export function withDeck(dataset: SolidDataset, deck: Deck): SolidDataset {
  let updated = setThing(
    dataset,
    recordThing(deck.url, DECK_V6, deckToRecord(deck), getThing(dataset, deck.url)),
  );
  for (const { url, record } of deckAgents(deck)) {
    updated = setThing(updated, recordThing(url, AGENT_V1, record, getThing(updated, url)));
  }
  const distribution = deckDistribution(deck);
  updated = setThing(
    updated,
    recordThing(
      distribution.url,
      DISTRIBUTION_V1,
      distribution.record,
      getThing(updated, distribution.url),
    ),
  );
  return withCatalogDataset(withoutStrayAgents(updated, documentUrlOf(deck.url)), deck.url, "add");
}

/** The subjects a deck is written as: its entry, its distribution and its agents. */
export function deckSubjects(deck: Deck): string[] {
  return [deck.url, distributionUrlOf(deck.url), ...deckAgents(deck).map((agent) => agent.url)];
}

/**
 * The catalog document without a deck, its distribution, or agents only
 * it named, and with no deck group listing it any more. Its former
 * siblings keep their positions: the gap is read as if it were not there
 * (domain/deckTree.ts buildTree), and the next arrangement closes it.
 */
export function withoutDeck(dataset: SolidDataset, deck: Deck): SolidDataset {
  let updated = removeThing(
    removeThing(dataset, deck.url),
    distributionUrlOf(deck.url),
  );
  for (const thing of getThingAll(updated)) {
    if (getUrlAll(thing, RDF.type).includes(SM.DeckGroup) && getUrlAll(thing, DCAT.dataset).includes(deck.url)) {
      updated = setThing(updated, buildThing(thing).removeUrl(DCAT.dataset, deck.url).build());
    }
  }
  return withCatalogDataset(withoutStrayAgents(updated, documentUrlOf(deck.url)), deck.url, "remove");
}

function isTyped(dataset: SolidDataset, url: string, type: string): boolean {
  const thing = getThing(dataset, url);
  return thing !== null && getUrlAll(thing, RDF.type).includes(type);
}

function deckUrlsOf(dataset: SolidDataset): string[] {
  return getThingAll(dataset)
    .filter((thing) => getUrlAll(thing, RDF.type).includes(SM.Deck))
    .map(asUrl);
}

/**
 * The catalogue node, when the document has one, with the one deck's
 * `dcat:dataset` link added or removed. Every other link stays as it is:
 * a dataset another app listed in the catalogue is not this app's to
 * drop (docs/data-model.md "Write discipline").
 */
function withCatalogDataset(dataset: SolidDataset, deckUrl: string, change: "add" | "remove"): SolidDataset {
  const catalog = getThing(dataset, `${documentUrlOf(deckUrl)}#catalog`);
  if (catalog === null) return dataset;
  const listed = getUrlAll(catalog, DCAT.dataset).includes(deckUrl);
  if (listed === (change === "add")) return dataset;
  const builder = buildThing(catalog);
  return setThing(dataset, (change === "add" ? builder.addIri(DCAT.dataset, deckUrl) : builder.removeUrl(DCAT.dataset, deckUrl)).build());
}

/**
 * The catalogue of a catalog document, its publisher named by the agent
 * node beside it (or by the WebID when there is none); null when the
 * document has no catalogue that fits its shape.
 */
export function toCatalog(dataset: SolidDataset, documentUrl: string): Catalog | null {
  const url = `${documentUrl}#catalog`;
  const thing = getThing(dataset, url);
  const read = thing === null ? null : readVersioned(thing, "catalog");
  if (read === null) return null;
  const record = migrate("catalog", read.record, { subject: url });
  return catalogFromRecord(record, agentNamesOf(dataset).get(record.publisher) ?? record.publisher);
}

/**
 * The catalog document with its catalogue written, onto the existing
 * subject when there is one, listing every deck of the document besides
 * the datasets it already lists: one in another document (another app's)
 * or one this document describes as a dataset. Only a link to a subject
 * of this document that is no dataset (left by a deck removed) goes, as
 * the catalogue could not be written with it. Its publisher is described
 * beside it.
 */
export function withCatalog(dataset: SolidDataset, documentUrl: string, catalog: Catalog): SolidDataset {
  const url = `${documentUrl}#catalog`;
  const existing = getThing(dataset, url);
  const kept = (existing === null ? [] : getUrlAll(existing, DCAT.dataset)).filter(
    (link) => documentUrlOf(link) !== documentUrl || isTyped(dataset, link, DCAT.Dataset),
  );
  const datasets = [...new Set([...kept, ...deckUrlsOf(dataset)])];
  const withNode = setThing(dataset, recordThing(url, CATALOG_V1, catalogToRecord(catalog, datasets), existing));
  const publisher = catalog.publisher.webId;
  return setThing(
    withNode,
    recordThing(publisher, AGENT_V1, publisherToRecord(catalog), getThing(withNode, publisher)),
  );
}

/** Agent nodes this app wrote (`#agent-…`) that nothing in the document names. */
function withoutStrayAgents(dataset: SolidDataset, documentUrl: string): SolidDataset {
  const named = new Set(
    getThingAll(dataset).flatMap((thing) => [
      ...getUrlAll(thing, DCTERMS.creator),
      ...getUrlAll(thing, DCTERMS.publisher),
    ]),
  );
  return getThingAll(dataset)
    .map(asUrl)
    .filter((url) => url.startsWith(`${documentUrl}#agent-`) && !named.has(url))
    .reduce((current, url) => removeThing(current, url), dataset);
}

/**
 * Map a cards-document subject to a Card, with the distractors it names
 * from the same document; null when the subject is not an sm:Card that
 * fits its format's shape, or a side has neither text nor a picture.
 */
export function toCard(thing: Thing, dataset: SolidDataset): Card | null {
  const read = readVersioned(thing, "card");
  if (read === null) return null;
  const data = migrate("card", read.record, { subject: asUrl(thing) });
  return cardFromRecord(asUrl(thing), read.storedVersion, data, distractorsOf(dataset, data.distractor));
}

/** Every card of a cards document. */
export function toCards(dataset: SolidDataset): Card[] {
  return getThingAll(dataset)
    .map((thing) => toCard(thing, dataset))
    .filter((card): card is Card => card !== null);
}

/** A distractor subject; null when it is not an sm:Distractor that fits its shape, its text is empty, or it is retired. */
export function toDistractor(thing: Thing): Distractor | null {
  const read = readVersioned(thing, "distractor");
  if (read === null) return null;
  return distractorFromRecord(asUrl(thing), migrate("distractor", read.record, { subject: asUrl(thing) }));
}

/**
 * The distractors a card names, ordered by id (RDF keeps no order among
 * a card's sm:distractor, so every reader gets the same one), as the
 * document has them: one that is missing, does not fit its shape or is
 * retired (owl:deprecated true) is left out.
 */
export function distractorsOf(dataset: SolidDataset, urls: readonly string[]): Distractor[] {
  return urls
    .map((url) => getThing(dataset, url))
    .map((thing) => (thing === null ? null : toDistractor(thing)))
    .filter((distractor): distractor is Distractor => distractor !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The document with a card's distractors written beside it, as subjects
 * of `documentUrl` (an existing one keeps triples this app does not
 * know), and those it named before (`before`, their URLs) but names no
 * longer removed. Returns the URLs written, for the write check.
 */
export function withDistractors(
  dataset: SolidDataset,
  documentUrl: string,
  distractors: readonly Distractor[],
  before: readonly string[],
): { dataset: SolidDataset; subjects: string[] } {
  const subjects = distractors.map((distractor) => `${documentUrl}#${distractor.id}`);
  let updated = before
    .filter((url) => !subjects.includes(url))
    .reduce((current, url) => removeThing(current, url), dataset);
  for (const [i, distractor] of distractors.entries()) {
    updated = setThing(
      updated,
      recordThing(subjects[i], DISTRACTOR_V1, distractorToRecord(distractor), getThing(updated, subjects[i])),
    );
  }
  return { dataset: updated, subjects };
}
