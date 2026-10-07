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
import type { Card, Deck } from "@solid-memo/domain/deck";
import {
  cardFromRecord,
  deckAgents,
  deckDistribution,
  deckFromRecord,
  deckToRecord,
} from "@solid-memo/domain/deckRecord";
import { distributionUrlOf } from "@solid-memo/domain/dcat";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { AGENT_V1, CATALOG_V1, DECK_V6, DISTRIBUTION_V1 } from "@solid-memo/vocab/descriptors.generated";
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
  return deckFromRecord(
    url,
    read.storedVersion,
    migrate("deck", read.record, { subject: url }),
    (agent) => names.get(agent) ?? agent,
  );
}

/**
 * The catalog document with a deck written in this app's format, onto
 * its existing subject when there is one (so unknown triples survive),
 * with its creators' agent nodes and its distribution beside it. Agents
 * no deck names any more are removed.
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
  return withCatalogDatasets(withoutStrayAgents(updated, documentUrlOf(deck.url)), documentUrlOf(deck.url));
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
  return withCatalogDatasets(withoutStrayAgents(updated, documentUrlOf(deck.url)), documentUrlOf(deck.url));
}

function deckUrlsOf(dataset: SolidDataset): string[] {
  return getThingAll(dataset)
    .filter((thing) => getUrlAll(thing, RDF.type).includes(SM.Deck))
    .map(asUrl);
}

/** The catalogue node, when the document has one, listing exactly its decks. */
function withCatalogDatasets(dataset: SolidDataset, documentUrl: string): SolidDataset {
  const catalog = getThing(dataset, `${documentUrl}#catalog`);
  if (catalog === null) return dataset;
  let builder = buildThing(catalog).removeAll(DCAT.dataset);
  for (const url of deckUrlsOf(dataset)) builder = builder.addIri(DCAT.dataset, url);
  return setThing(dataset, builder.build());
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
 * subject when there is one, listing every deck of the document, with
 * its publisher described beside it.
 */
export function withCatalog(dataset: SolidDataset, documentUrl: string, catalog: Catalog): SolidDataset {
  const url = `${documentUrl}#catalog`;
  const withNode = setThing(
    dataset,
    recordThing(url, CATALOG_V1, catalogToRecord(catalog, deckUrlsOf(dataset)), getThing(dataset, url)),
  );
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
 * Map a cards-document subject to a Card; null when the subject is not
 * an sm:Card that fits its format's shape, or a side has neither text
 * nor a picture.
 */
export function toCard(thing: Thing): Card | null {
  const read = readVersioned(thing, "card");
  if (read === null) return null;
  return cardFromRecord(asUrl(thing), read.storedVersion, migrate("card", read.record, { subject: asUrl(thing) }));
}
