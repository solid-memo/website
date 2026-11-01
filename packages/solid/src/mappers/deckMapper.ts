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
  removeThings,
  setThing,
  setThings,
} from "../client/rdf";
import { editOf, type DatasetEdit } from "../datasetEdit";
import {
  agentUrlOf,
  agentUrlsOf,
  authorFromAgentRecord,
  sameAgent,
} from "@solid-memo/domain/agentRecord";
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
import type { AgentV1, CardV7 } from "@solid-memo/vocab/types.generated";
import { foreignSubjects } from "../ownership";
import {
  readVersioned,
  recordThing,
  removeAllUnlessNewer,
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
  // Only a deck before format 3 names agents of its own: the document's are not copied for each deck, which made many decks and agents take quadratic time (GHSA-hcrw-cr33-jg78).
  const own = new Map<string, string>();
  if (read.record.version < 3) {
    for (const author of read.record.data.creator) own.set(agentUrlOf(url, author), author);
  }
  const completedChapters = getUrlAll(thing, SM.completedChapter);
  const storedLanguage = getStringNoLocale(thing, SM.deckCardLanguage);
  const cardLanguage = storedLanguage === null ? undefined : cardLanguageTag(storedLanguage);
  return {
    ...deckFromRecord(
      url,
      read.storedVersion,
      migrate("deck", read.record, { subject: url }),
      (agent) => own.get(agent) ?? agentNames.get(agent) ?? agent,
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
  return withDecks(dataset, [deck]);
}

/**
 * The catalog document with each of the decks written, as withDeck
 * writes one: every subject set at once (editOf), and stray agents and
 * the catalog's links seen to once, so that many decks (a catalog
 * brought to this app's format) take time that grows with them and the
 * document, not their product.
 */
export function withDecks(dataset: Dataset, decks: readonly Deck[]): Dataset {
  const edit = editOf(dataset);
  for (const deck of decks) {
    const creator = deckAgentUrls(deck, edit.getThing);
    edit.setThing(
      recordThing(deck.url, DECK_V6, deckToRecord(deck, creator), edit.getThing(deck.url)),
    );
    for (const { url, record } of deckAgents(deck, creator)) {
      edit.setThing(recordThing(url, AGENT_V1, record, edit.getThing(url)));
    }
    const distribution = deckDistribution(deck);
    edit.setThing(
      recordThing(
        distribution.url,
        DISTRIBUTION_V1,
        distribution.record,
        edit.getThing(distribution.url),
      ),
    );
  }
  const documents = new Set(decks.map((deck) => documentUrlOf(deck.url)));
  return withCatalogDatasets(
    withoutStrayAgents(edit.done(), documents),
    decks.map((deck) => deck.url),
    "add",
  );
}

/** The subjects a deck is written as in `dataset` (withDeck's): its entry, its distribution and its agents. */
export function deckSubjects(dataset: Dataset, deck: Deck): string[] {
  const agents = new Set(deckAgentUrls(deck, (url) => getThing(dataset, url)));
  return [deck.url, distributionUrlOf(deck.url), ...agents];
}

/**
 * The agent node of each of a deck's authors in its catalog document,
 * whose subjects `thingAt` finds (agentUrlsOf): a node that holds
 * another author's name or mailbox is never written over, as every deck
 * of the document names its authors' nodes, and the next one is taken.
 */
function deckAgentUrls(deck: Deck, thingAt: (url: string) => NamedSubject | null): string[] {
  return agentUrlsOf(deck.url, deck.authors, (url, record) => agentFits(thingAt(url), record));
}

/** Whether an author's record may be written onto `thing`: there is none, it says nothing an agent says, or it is that author's. */
function agentFits(thing: NamedSubject | null, record: AgentV1): boolean {
  if (thing === null) return true;
  const said = getPropertyAll(thing);
  if (!AGENT_V1.fields.some((field) => said.includes(field.predicate))) return true;
  const read = readVersioned(thing, "agent");
  return (
    read !== null && sameAgent(migrate("agent", read.record, { subject: asUrl(thing) }), record)
  );
}

/**
 * The catalog document without a deck, its distribution, or agents only
 * it named, and with no deck group listing it any more. Its former
 * siblings keep their positions: the gap is read as if it were not there
 * (domain/deckTree.ts buildTree), and the next arrangement closes it.
 */
export function withoutDeck(dataset: Dataset, deck: Deck): Dataset {
  const removed = removeAllUnlessNewer(dataset, [deck.url, distributionUrlOf(deck.url)]);
  const updated = setThings(
    removed,
    getThingAll(removed)
      .filter(
        (thing) =>
          getUrlAll(thing, RDF.type).includes(SM.DeckGroup) &&
          getUrlAll(thing, DCAT.dataset).includes(deck.url),
      )
      .map((thing) => buildThing(unlessNewer(thing)).removeUrl(DCAT.dataset, deck.url).build()),
  );
  return withCatalogDatasets(
    withoutStrayAgents(updated, new Set([documentUrlOf(deck.url)])),
    [deck.url],
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
 * The catalog node of each deck's document, when it has one, with the
 * deck's `dcat:dataset` link added or removed. Every other link stays as
 * it is: a dataset another app listed in the catalog is not this app's
 * to drop (docs/data-model.md "Write discipline").
 */
function withCatalogDatasets(
  dataset: Dataset,
  deckUrls: readonly string[],
  change: "add" | "remove",
): Dataset {
  const byCatalog = new Map<string, Set<string>>();
  for (const url of deckUrls) {
    const catalogUrl = `${documentUrlOf(url)}#catalog`;
    const urls = byCatalog.get(catalogUrl);
    if (urls === undefined) byCatalog.set(catalogUrl, new Set([url]));
    else urls.add(url);
  }
  const changed: NamedSubject[] = [];
  for (const [catalogUrl, urls] of byCatalog) {
    const catalog = getThing(dataset, catalogUrl);
    if (catalog === null) continue;
    const listed = new Set(getUrlAll(catalog, DCAT.dataset));
    const links = [...urls].filter((url) => listed.has(url) !== (change === "add"));
    if (links.length === 0) continue;
    // The new list set in one call (setIriAll), however many links change.
    const changing = new Set(links);
    const datasets =
      change === "add" ? [...listed, ...links] : [...listed].filter((url) => !changing.has(url));
    changed.push(buildThing(unlessNewer(catalog)).setIriAll(DCAT.dataset, datasets).build());
  }
  return setThings(dataset, changed);
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
  const before = new Set(existing === null ? [] : getUrlAll(existing, DCTERMS.license));
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
  // Each old license once, the changes made in one pass: one edit of the
  // whole document per license would take time in the square of them.
  const untyped: Subject[] = [];
  const gone: string[] = [];
  for (const license of before) {
    if (license === catalog.license || named.has(license)) continue;
    const node = getThing(updated, license);
    if (node === null) continue;
    const thing = buildThing(node).removeUrl(RDF.type, DCTERMS.LicenseDocument).build();
    if (getPropertyAll(thing).length === 0) gone.push(license);
    else untyped.push(thing);
  }
  updated = removeThings(setThings(updated, untyped), gone);
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

/** Agent nodes this app wrote (`#agent-…`) in one of `documents` that nothing in the dataset names. */
function withoutStrayAgents(dataset: Dataset, documents: ReadonlySet<string>): Dataset {
  const named = new Set(
    getThingAll(dataset).flatMap((thing) => [
      ...getUrlAll(thing, DCTERMS.creator),
      ...getUrlAll(thing, DCTERMS.publisher),
    ]),
  );
  const isAgent = (url: string) => {
    const hash = url.indexOf("#");
    return hash >= 0 && url.startsWith("#agent-", hash) && documents.has(url.slice(0, hash));
  };
  return removeAllUnlessNewer(
    dataset,
    getThingAll(dataset)
      .map(asUrl)
      .filter((url) => isAgent(url) && !named.has(url)),
  );
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
 * Writes a card's distractors beside it, as subjects of `documentUrl`
 * (an existing one keeps triples this app does not know); a distractor
 * is never written onto a card (unlessTyped). Returns the URLs written,
 * for the write check, and those the card named before (`before`) but
 * names no longer (`dropped`), for withoutUnnamedDistractors.
 */
export function writeDistractors(
  edit: DatasetEdit<Dataset>,
  documentUrl: string,
  distractors: readonly Distractor[],
  before: readonly string[],
): { subjects: string[]; dropped: string[] } {
  const subjects = distractors.map((distractor) => `${documentUrl}#${distractor.id}`);
  for (const [i, distractor] of distractors.entries()) {
    edit.setThing(
      recordThing(
        subjects[i],
        DISTRACTOR_V1,
        distractorToRecord(distractor),
        unlessTyped(edit, subjects[i], SM.Card),
      ),
    );
  }
  const written = new Set(subjects);
  return { subjects, dropped: before.filter((url) => !written.has(url)) };
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
 * card that names it, so a card's never goes with another's. Only an
 * sm:Distractor that is not an sm:Card is removed (isDistractorOnly):
 * a card, or another app's subject, a card names is never removed.
 */
export function withoutUnnamedDistractors(dataset: Dataset, urls: readonly string[]): Dataset {
  if (urls.length === 0) return dataset;
  const namers = distractorNamers(dataset);
  return removeAllUnlessNewer(
    dataset,
    urls.filter((url) => isUnnamed(namers, url) && isDistractorOnly(dataset, url)),
  );
}

/** Whether no subject of the document names the distractor at `url` (distractorNamers) any longer. */
function isUnnamed(namers: ReadonlyMap<string, number>, url: string): boolean {
  return !namers.has(url);
}

/** Whether the subject at `url` is typed sm:Distractor and not sm:Card. */
function isDistractorOnly(dataset: Dataset, url: string): boolean {
  const thing = getThing(dataset, url);
  const types = thing === null ? [] : getUrlAll(thing, RDF.type);
  return types.includes(SM.Distractor) && !types.includes(SM.Card);
}

/**
 * The document without the cards at `urls`, all at once. A subject an
 * earlier version left typed both a card and a distractor, which
 * another card names as its distractor, loses only its card statements
 * (the sm:Card type and the card properties no distractor has), so the
 * card that names it keeps its distractor.
 */
export function withoutCardSubjects(dataset: Dataset, urls: readonly string[]): Dataset {
  let namers: Map<string, number> | undefined;
  const removed: string[] = [];
  const kept: NamedSubject[] = [];
  for (const url of urls) {
    const thing = getThing(dataset, url);
    const named =
      thing !== null &&
      getUrlAll(thing, RDF.type).includes(SM.Distractor) &&
      (namers ??= distractorNamers(dataset)).has(url);
    if (named) kept.push(distractorOnly(unlessNewer(thing)));
    else removed.push(url);
  }
  return setThings(removeAllUnlessNewer(dataset, removed), kept);
}

/** A subject typed both a card and a distractor, without its card statements. */
function distractorOnly(thing: NamedSubject): NamedSubject {
  const kept = new Set(DISTRACTOR_V1.fields.map((field) => field.predicate));
  const builder = buildThing(thing).removeUrl(RDF.type, SM.Card).removeAll(SCHEMA.suggestedAnswer);
  for (const field of CARD_V7.fields)
    if (!kept.has(field.predicate)) builder.removeAll(field.predicate);
  return builder.setInteger(SM.formatVersion, DISTRACTOR_V1.version).build();
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
  const named = new Set(distractors);
  const dropped = new Set(before.filter((url) => !named.has(url)));
  const kept = getUrlAll(card, SCHEMA.suggestedAnswer).filter((url) => !dropped.has(url));
  // The new list set in one call (setIriAll), however many distractors the card has.
  return buildThing(card)
    .setIriAll(SCHEMA.suggestedAnswer, [...kept, ...distractors])
    .build();
}
