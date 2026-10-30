// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  type NamedSubject,
  type Subject,
  asUrl,
  buildThing,
  createThing,
  getPropertyAll,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrlAll,
  removeThing,
  setThing,
} from "../client/rdf";
import { agentUrlOf, authorFromAgentRecord } from "@solid-memo/domain/agentRecord";
import {
  catalogFromRecord,
  catalogToRecord,
  publisherToRecord,
  type Catalog,
} from "@solid-memo/domain/catalog";
import type { Card, Deck, Distractor } from "@solid-memo/domain/deck";
import { cardLanguageTag } from "@solid-memo/domain/deckCardLanguage";
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
import { isDeckInPlace, isSameUrl } from "@solid-memo/domain/instanceLayout";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import {
  AGENT_V1,
  CARD_V7,
  CATALOG_V1,
  DECK_V6,
  DISTRACTOR_V1,
  DISTRIBUTION_V1,
} from "@solid-memo/vocab/descriptors.generated";
import type { CardV7 } from "@solid-memo/vocab/types.generated";
import { foreignSubjects } from "../ownership";
import {
  readVersioned,
  recordThing,
  removeUnlessNewer,
  unlessNewer,
  unlessTyped,
} from "../records";
import { DCAT, DCTERMS, RDF, SCHEMA, SM } from "../vocab";
import { AppError } from "@solid-memo/domain/appError";

/** Every agent of a document by URL, named "Name <email>". */
export function agentNamesOf(dataset: Dataset): Map<string, string> {
  const names = new Map<string, string>();
  for (const thing of getThingAll(dataset)) {
    const read = readVersioned(thing, "agent");
    if (read === null) continue;
    const url = asUrl(thing);
    names.set(url, authorFromAgentRecord(migrate("agent", read.record, { subject: url })));
  }
  return names;
}

/**
 * Every deck of the catalog document at `catalogUrl`, its creators named
 * from the agents beside it: those whose entry is a subject of this
 * document and whose cards and reviews documents are where the instance
 * keeps them (isDeckInPlace), each as a request sends the address, which
 * another spelling of the same one is (isSameUrl). The catalog is data anyone may have
 * written, so a deck it names elsewhere is not one of the instance's:
 * nothing reads, writes or deletes through it, and the instance check
 * reports its entry, which a repair may remove (docs/data-model.md,
 * "Where an instance's documents are").
 */
export function toDecks(dataset: Dataset, catalogUrl: string): Deck[] {
  const names = agentNamesOf(dataset);
  return getThingAll(dataset)
    .map((thing) => toDeck(thing, names))
    .filter(
      (deck): deck is Deck =>
        deck !== null && isSameUrl(documentUrlOf(deck.url), catalogUrl) && isDeckInPlace(deck),
    );
}

/**
 * Map a catalog subject to a Deck; null when the subject is not an
 * sm:Deck that fits its format's shape. An older format is brought up to
 * the current one in memory; the stored version stays on the model. A
 * course's deck is also typed schema:Course and has the chapters it
 * completed (sm:completedChapter), and a deck the language its card text is shown in first
 * (sm:deckCardLanguage), kept only when it names a language: the catalog
 * is data anyone may have written, and no shape checks that term. A
 * deck from before format 3 names its creators itself ("Name <email>"),
 * which name the agents the migration gives it.
 */
export function toDeck(
  thing: Subject,
  agentNames: ReadonlyMap<string, string> = new Map(),
): Deck | null {
  const read = readVersioned(thing, "deck");
  if (read === null) return null;
  const url = asUrl(thing);
  const names = new Map(agentNames);
  if (read.record.version < 3) {
    for (const author of read.record.data.creator) names.set(agentUrlOf(url, author), author);
  }
  const completedChapters = getUrlAll(thing, SM.completedChapter);
  const storedLanguage = getStringNoLocale(thing, SM.deckCardLanguage);
  const cardLanguage = storedLanguage === null ? undefined : cardLanguageTag(storedLanguage);
  return {
    ...deckFromRecord(
      url,
      read.storedVersion,
      migrate("deck", read.record, { subject: url }),
      (agent) => names.get(agent) ?? agent,
    ),
    // Outside the deck's shape, like sm:position: every write of the entry keeps them (recordThing).
    ...(getUrlAll(thing, RDF.type).includes(SCHEMA.Course) ? { course: true as const } : {}),
    ...(completedChapters.length === 0 ? {} : { completedChapters }),
    ...(cardLanguage === undefined ? {} : { cardLanguage }),
  };
}

/**
 * The catalog document with a deck written in this app's format, onto
 * its existing subject when there is one (so unknown triples survive),
 * with its creators' agent nodes and its distribution beside it, and
 * listed by the catalog. Agents no deck names any more are removed.
 * The terms outside the deck's shape (sm:position, sm:completedChapter,
 * sm:deckCardLanguage) and the entry's other types (a course's
 * schema:Course) are kept as the entry has them, whatever the deck
 * says: a deck read before one changed cannot undo it by a save of its
 * own fields.
 */
export function withDeck(dataset: Dataset, deck: Deck): Dataset {
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
export function withoutDeck(dataset: Dataset, deck: Deck): Dataset {
  let updated = removeUnlessNewer(
    removeUnlessNewer(dataset, deck.url),
    distributionUrlOf(deck.url),
  );
  for (const thing of getThingAll(updated)) {
    if (
      getUrlAll(thing, RDF.type).includes(SM.DeckGroup) &&
      getUrlAll(thing, DCAT.dataset).includes(deck.url)
    ) {
      updated = setThing(
        updated,
        buildThing(unlessNewer(thing)).removeUrl(DCAT.dataset, deck.url).build(),
      );
    }
  }
  return withCatalogDataset(
    withoutStrayAgents(updated, documentUrlOf(deck.url)),
    deck.url,
    "remove",
  );
}

function isTyped(dataset: Dataset, url: string, type: string): boolean {
  const thing = getThing(dataset, url);
  return thing !== null && getUrlAll(thing, RDF.type).includes(type);
}

function deckUrlsOf(dataset: Dataset): string[] {
  return getThingAll(dataset)
    .filter((thing) => getUrlAll(thing, RDF.type).includes(SM.Deck))
    .map(asUrl);
}

/**
 * The catalog node, when the document has one, with the one deck's
 * `dcat:dataset` link added or removed. Every other link stays as it is:
 * a dataset another app listed in the catalog is not this app's to
 * drop (docs/data-model.md "Write discipline").
 */
function withCatalogDataset(dataset: Dataset, deckUrl: string, change: "add" | "remove"): Dataset {
  const catalog = getThing(dataset, `${documentUrlOf(deckUrl)}#catalog`);
  if (catalog === null) return dataset;
  const listed = getUrlAll(catalog, DCAT.dataset).includes(deckUrl);
  if (listed === (change === "add")) return dataset;
  const builder = buildThing(unlessNewer(catalog));
  return setThing(
    dataset,
    (change === "add"
      ? builder.addIri(DCAT.dataset, deckUrl)
      : builder.removeUrl(DCAT.dataset, deckUrl)
    ).build(),
  );
}

/**
 * The catalog of a catalog document, its publisher named by the agent
 * node beside it (or by the WebID when there is none); null when the
 * document has no catalog that fits its shape.
 */
export function toCatalog(dataset: Dataset, documentUrl: string): Catalog | null {
  const url = `${documentUrl}#catalog`;
  const thing = getThing(dataset, url);
  const read = thing === null ? null : readVersioned(thing, "catalog");
  if (read === null) return null;
  const record = migrate("catalog", read.record, { subject: url });
  return catalogFromRecord(record, agentNamesOf(dataset).get(record.publisher) ?? record.publisher);
}

/**
 * The catalog document with its catalog written, onto the existing
 * subject when there is one, listing every deck of the document besides
 * the datasets it already lists: one in another document (another app's),
 * one this document describes as a dataset, or one another app described
 * in this document, whatever its class. Only a link to a subject of this
 * document that is no dataset of Solid Memo's (left by a deck removed)
 * goes, as the catalog could not be written with it. Its publisher is
 * described beside it.
 * Its license, when it states one, is typed a dcterms:LicenseDocument,
 * as DCAT-AP asks. A license it no longer states loses that type, unless
 * the document still names it a license elsewhere; with nothing else said
 * of it, it goes.
 */
export function withCatalog(dataset: Dataset, documentUrl: string, catalog: Catalog): Dataset {
  const url = `${documentUrl}#catalog`;
  const existing = getThing(dataset, url);
  const before = existing === null ? [] : getUrlAll(existing, DCTERMS.license);
  const foreign = foreignSubjects(dataset);
  const kept = (existing === null ? [] : getUrlAll(existing, DCAT.dataset)).filter(
    (link) =>
      documentUrlOf(link) !== documentUrl ||
      isTyped(dataset, link, DCAT.Dataset) ||
      foreign.has(link),
  );
  const datasets = [...new Set([...kept, ...deckUrlsOf(dataset)])];
  let updated = setThing(
    dataset,
    recordThing(url, CATALOG_V1, catalogToRecord(catalog, datasets), existing),
  );
  const publisher = catalog.publisher.webId;
  updated = setThing(
    updated,
    recordThing(publisher, AGENT_V1, publisherToRecord(catalog), getThing(updated, publisher)),
  );
  const named = new Set(getThingAll(updated).flatMap((thing) => getUrlAll(thing, DCTERMS.license)));
  for (const license of before.filter(
    (license) => license !== catalog.license && !named.has(license),
  )) {
    const node = getThing(updated, license);
    if (node === null) continue;
    const untyped = buildThing(node).removeUrl(RDF.type, DCTERMS.LicenseDocument).build();
    updated =
      getPropertyAll(untyped).length === 0
        ? removeThing(updated, license)
        : setThing(updated, untyped);
  }
  if (catalog.license !== undefined) {
    const node = getThing(updated, catalog.license) ?? createThing({ url: catalog.license });
    if (!getUrlAll(node, RDF.type).includes(DCTERMS.LicenseDocument)) {
      updated = setThing(
        updated,
        buildThing(node).addIri(RDF.type, DCTERMS.LicenseDocument).build(),
      );
    }
  }
  return updated;
}

/** Agent nodes this app wrote (`#agent-…`) that nothing in the document names. */
function withoutStrayAgents(dataset: Dataset, documentUrl: string): Dataset {
  const named = new Set(
    getThingAll(dataset).flatMap((thing) => [
      ...getUrlAll(thing, DCTERMS.creator),
      ...getUrlAll(thing, DCTERMS.publisher),
    ]),
  );
  return getThingAll(dataset)
    .map(asUrl)
    .filter((url) => url.startsWith(`${documentUrl}#agent-`) && !named.has(url))
    .reduce((current, url) => removeUnlessNewer(current, url), dataset);
}

/**
 * Map a cards-document subject to a Card, with the distractors it names
 * from the same document; null when the subject is not an sm:Card that
 * fits its format's shape, or a side has neither text nor a picture.
 */
export function toCard(thing: Subject, dataset: Dataset): Card | null {
  const read = readCard(thing);
  if (read === null) return null;
  return cardFromRecord(
    asUrl(thing),
    read.storedVersion,
    read.data,
    distractorsOf(dataset, read.data.distractor),
  );
}

/**
 * A card subject read with the shape of its stored format and brought up
 * to the latest; null as for readVersioned. What the card is about
 * (`dcterms:subject`) is read from the card itself whatever format it
 * states: a library release compiled from linked data states it on
 * format-4 cards, and an app's first write of an older card in format 7
 * would otherwise delete what another app wrote of it.
 */
export function readCard(thing: Subject): { storedVersion: number; data: CardV7 } | null {
  const read = readVersioned(thing, "card");
  if (read === null) return null;
  const data = migrate("card", read.record, { subject: asUrl(thing) });
  if (read.record.version >= 7) return { storedVersion: read.storedVersion, data };
  return {
    storedVersion: read.storedVersion,
    data: { ...data, subject: getUrlAll(thing, DCTERMS.subject) },
  };
}

/** Every card of a cards document. */
export function toCards(dataset: Dataset): Card[] {
  return getThingAll(dataset)
    .map((thing) => toCard(thing, dataset))
    .filter((card): card is Card => card !== null);
}

/** A distractor subject, a retired one marked so; null when it is not an sm:Distractor that fits its shape, or its text is empty. */
export function toDistractor(thing: Subject): Distractor | null {
  const read = readVersioned(thing, "distractor");
  if (read === null) return null;
  return distractorFromRecord(
    asUrl(thing),
    migrate("distractor", read.record, { subject: asUrl(thing) }),
  );
}

/**
 * The distractors a card names, ordered by id (RDF keeps no order among
 * a card's sm:distractor, so every reader gets the same one), as the
 * document has them: one that is missing or does not fit its shape is
 * left out. A retired one (owl:deprecated true) is kept, marked so, for
 * the card's editor and its learners' history; it is never offered.
 */
export function distractorsOf(dataset: Dataset, urls: readonly string[]): Distractor[] {
  return urls
    .map((url) => getThing(dataset, url))
    .map((thing) => (thing === null ? null : toDistractor(thing)))
    .filter((distractor): distractor is Distractor => distractor !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The document with a card's distractors written beside it, as subjects
 * of `documentUrl` (an existing one keeps triples this app does not
 * know); a distractor is never written onto a card (unlessTyped).
 * Returns the URLs written, for the write check, and those the card
 * named before (`before`) but names no longer (`dropped`), for
 * withoutUnnamedDistractors.
 */
export function withDistractors(
  dataset: Dataset,
  documentUrl: string,
  distractors: readonly Distractor[],
  before: readonly string[],
): { dataset: Dataset; subjects: string[]; dropped: string[] } {
  const subjects = distractors.map((distractor) => `${documentUrl}#${distractor.id}`);
  let updated = dataset;
  for (const [i, distractor] of distractors.entries()) {
    updated = setThing(
      updated,
      recordThing(
        subjects[i],
        DISTRACTOR_V1,
        distractorToRecord(distractor),
        unlessTyped(updated, subjects[i], SM.Card),
      ),
    );
  }
  return { dataset: updated, subjects, dropped: before.filter((url) => !subjects.includes(url)) };
}

/** How many subjects of the document name each URL as their distractor (sm:distractor). */
function distractorNamers(dataset: Dataset): Map<string, number> {
  const namers = new Map<string, number>();
  for (const thing of getThingAll(dataset))
    for (const url of getUrlAll(thing, SM.distractor)) namers.set(url, (namers.get(url) ?? 0) + 1);
  return namers;
}

/**
 * The document without each of `urls`, distractors a card no longer
 * names, unless a card still names it: a distractor belongs to the one
 * card that names it, so a card's never goes with another's.
 */
export function withoutUnnamedDistractors(dataset: Dataset, urls: readonly string[]): Dataset {
  if (urls.length === 0) return dataset;
  const namers = distractorNamers(dataset);
  return urls
    .filter((url) => !namers.has(url))
    .reduce((current, url) => removeUnlessNewer(current, url), dataset);
}

/**
 * The document without the card at `url`. A subject an earlier version
 * left typed both a card and a distractor, which another card names as
 * its distractor, loses only its card statements (the sm:Card type and
 * the card properties no distractor has), so the card that names it
 * keeps its distractor.
 */
export function withoutCardSubject(dataset: Dataset, url: string): Dataset {
  const thing = getThing(dataset, url);
  const named =
    thing !== null &&
    getUrlAll(thing, RDF.type).includes(SM.Distractor) &&
    distractorNamers(dataset).has(url);
  if (!named) return removeUnlessNewer(dataset, url);
  unlessNewer(thing);
  const kept = new Set(DISTRACTOR_V1.fields.map((field) => field.predicate));
  const builder = buildThing(thing).removeUrl(RDF.type, SM.Card).removeAll(SCHEMA.suggestedAnswer);
  for (const field of CARD_V7.fields)
    if (!kept.has(field.predicate)) builder.removeAll(field.predicate);
  return setThing(dataset, builder.setInteger(SM.formatVersion, DISTRACTOR_V1.version).build());
}

/**
 * Refused (idTakenInDeck) when one of the subjects written is named as
 * a distractor by more than one card: a distractor belongs to the one
 * card that names it, so a card is never given another's.
 */
export function assertDistractorsOwnedOnce(dataset: Dataset, subjects: readonly string[]): void {
  const namers = distractorNamers(dataset);
  const shared = subjects.find((url) => (namers.get(url) ?? 0) > 1);
  if (shared !== undefined) throw new AppError("idTakenInDeck", { url: shared });
}

/**
 * A card naming each of its distractors (`distractors`, their URLs) as a
 * schema:suggestedAnswer too, beside sm:distractor, for readers who know
 * schema.org's questions and not Solid Memo's. Those it named before
 * (`before`) and names no longer leave it; any other suggested answer,
 * another app's, stays. Readers go by sm:distractor alone.
 */
export function withSuggestedAnswers(
  card: NamedSubject,
  before: readonly string[],
  distractors: readonly string[],
): NamedSubject {
  const builder = buildThing(card);
  for (const url of before)
    if (!distractors.includes(url)) builder.removeUrl(SCHEMA.suggestedAnswer, url);
  const suggested = getUrlAll(card, SCHEMA.suggestedAnswer);
  for (const url of distractors)
    if (!suggested.includes(url)) builder.addUrl(SCHEMA.suggestedAnswer, url);
  return builder.build();
}
