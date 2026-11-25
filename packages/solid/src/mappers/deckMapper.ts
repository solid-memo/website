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
  getThing,
  getThingAll,
  removeThings,
  setThing,
  setThings,
} from "@solid-memo/solid-client/rdf";
import { MAX_TERM_CHARACTERS } from "@solid-memo/solid-client/readLimits";
import { editOf, type DatasetEdit } from "../datasetEdit";
import {
  agentUrlOf,
  type AgentNodes,
  agentNodesOf,
  authorFromAgentRecord,
  type AgentHolder,
} from "@solid-memo/domain/agentRecord";
import { isIriPastBound, TextMap } from "@solid-memo/domain/pathKeys";
import {
  catalogFromRecord,
  catalogToRecord,
  publisherToRecord,
  type Catalog,
  type CatalogRead,
} from "@solid-memo/domain/catalog";
import {
  boundedCompletedChapters,
  withBoundedMetadata,
  type Card,
  type Deck,
  type Distractor,
} from "@solid-memo/domain/deck";
import { cardLanguageTag } from "@solid-memo/domain/deckCardLanguage";
import { storedPictureHosts } from "@solid-memo/domain/deckPictures";
import { storedPause } from "@solid-memo/domain/deckPause";
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
import { isDeckInPlace } from "@solid-memo/domain/deckAddress";
import { isSameUrl } from "@solid-memo/domain/instanceLayout";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { documentUrlOf, isDocumentSubject, isSameDocument } from "@solid-memo/domain/subjectUrl";
import {
  AGENT_V1,
  ALL_SHAPES,
  CARD_TERMS,
  CARD_V7,
  CATALOG_V1,
  DECK_TERMS,
  DECK_V6,
  DISTRACTOR_V1,
  DISTRIBUTION_V1,
} from "@solid-memo/vocab/descriptors.generated";
import { type CardV7, LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { foreignSubjects } from "../ownership";
import {
  allIris,
  hasClass,
  isWrittenByNewer,
  migrateWithinBound,
  ownSubjectsOf,
  readFieldOf,
  readTerms,
  readVersioned,
  recordThing,
  removeAllUnlessNewer,
  saysAnyOf,
  saysNothing,
  someIri,
  storedVersionOf,
  unlessNewer,
  unlessTyped,
} from "../records";
import { DCAT, DCTERMS, RDF, SCHEMA, SM } from "../vocab";
import { AppError } from "@solid-memo/domain/appError";

/** The classes a shape describes, but an agent's. */
const NOT_AGENT_CLASSES: ReadonlySet<string> = new Set(
  ALL_SHAPES.map((shape) => shape.targetClass).filter((type) => type !== AGENT_V1.targetClass),
);

/**
 * Every agent of a document by URL, named "Name <email>". A subject that
 * is also of another class a shape describes is none: the Studio holds
 * no agent record of it, so it would show no such name
 * (GHSA-mv57-839j-wrf6). A release is such a subject too, as a learner
 * reads one only when it is an sm:Deck.
 */
export function agentNamesOf(dataset: Dataset): Map<string, string> {
  const names = new Map<string, string>();
  for (const thing of getThingAll(dataset)) {
    if (someIri(thing, RDF.type, (type) => NOT_AGENT_CLASSES.has(type))) continue;
    const read = readVersioned(thing, "agent");
    if (read === null) continue;
    const url = asUrl(thing);
    names.set(url, authorFromAgentRecord(migrate("agent", read.record, { subject: url })));
  }
  return names;
}

/**
 * Who an agent of a deck or release is, the agent named by its IRI: for
 * one from before format 3, `creators` are the authors it names itself
 * ("Name <email>"), which name the agents the migration gives it, at
 * URLs joined from `subject`'s document and each author, which can be
 * longer than any term (TextMap); else the agents of the document, by
 * `names`, or the IRI where there is none.
 */
export function authorOfAgents(
  subject: string,
  creators: readonly string[],
  names: ReadonlyMap<string, string>,
): (agent: string) => string {
  const own = new TextMap<string>();
  for (const author of creators) own.set(agentUrlOf(subject, author), author);
  return (agent) => own.get(agent) ?? names.get(agent) ?? agent;
}

/**
 * Every deck of the catalog document at `catalogUrl`, its creators named
 * from the agents beside it: those whose entry is a subject of this
 * document and whose cards and reviews documents are where the instance
 * keeps them (isDeckInPlace), each as a request sends the address, which
 * another spelling of the same one is (isSameUrl). The catalog is data anyone may have
 * written, so a deck it names elsewhere is not one of the instance's:
 * nothing reads, writes or deletes through it, and the instance check
 * reports its entry, which it leaves as it is (docs/data-model.md,
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
 * completed (sm:completedChapter, at most MAX_COMPLETED_CHAPTERS of
 * them, its release's kept first), and a deck the language its card text is shown in first
 * (sm:deckCardLanguage), kept only when it names a language, and the
 * hosts whose pictures it shows (sm:deckPictureHost), kept only when they
 * are hosts, and a paused deck its pause (sm:deckPausedAt and
 * sm:deckResumesOn, as storedPause keeps them): the catalog is data anyone may have written, and no shape
 * checks those terms. A
 * deck from before format 3 names its creators itself ("Name <email>"),
 * which name the agents the migration gives it. A deck the migration
 * gives a term longer than a term may be, such as its distribution or
 * its untagged title in English, does not fit (migrateWithinBound): no
 * save of it would be accepted.
 */
export function toDeck(
  thing: Subject,
  agentNames: ReadonlyMap<string, string> = new Map(),
): Deck | null {
  const read = readVersioned(thing, "deck");
  if (read === null) return null;
  const url = asUrl(thing);
  // Only a deck before format 3 names agents of its own: the document's are not copied for each deck, which made many decks and agents take quadratic time (GHSA-hcrw-cr33-jg78).
  const own = read.record.version < 3 ? read.record.data.creator : [];
  const record = migrateWithinBound("deck", read.record, { subject: url });
  if (record === null) return null;
  const stored = deckFromRecord(
    url,
    read.storedVersion,
    record,
    authorOfAgents(url, own, agentNames),
  );
  // Outside the deck's shape, like sm:position: every write of the entry keeps them (recordThing).
  const terms = readTerms(thing, DECK_TERMS);
  // Only an http(s) URL is a chapter (DECK_TERMS): another IRI, such as `<rdf:type>`, is dropped here and never written back.
  const completedChapters = boundedCompletedChapters(terms.completedChapter, [stored.sourceUrl]);
  const cardLanguage =
    terms.deckCardLanguage === undefined ? undefined : cardLanguageTag(terms.deckCardLanguage);
  const pictureHosts = storedPictureHosts(terms.deckPictureHost);
  const pause = storedPause(terms.deckPausedAt ?? null, terms.deckResumesOn ?? null);
  return {
    ...stored,
    ...(hasClass(thing, SCHEMA.Course) ? { course: true as const } : {}),
    ...(completedChapters.length === 0 ? {} : { completedChapters }),
    ...(cardLanguage === undefined ? {} : { cardLanguage }),
    ...(pictureHosts.length === 0 ? {} : { pictureHosts }),
    ...(pause === undefined ? {} : { pause }),
  };
}

/**
 * The catalog document with a deck written in this app's format, onto
 * its existing subject when there is one (so unknown triples survive),
 * with its creators' agent nodes and its distribution beside it, and
 * listed by the catalog. Agents no deck names any more are removed,
 * except a node a newer version wrote: that one is never removed or
 * rewritten, it stays as it is. The terms outside the deck's shape
 * (sm:position, sm:completedChapter, sm:deckCardLanguage) and the
 * entry's other types (a course's schema:Course) are kept as the entry
 * has them, whatever the deck says: a deck read before one changed
 * cannot undo it by a save of its own fields.
 */
export function withDeck(dataset: Dataset, deck: Deck): Dataset {
  return withDecks(dataset, [deck]);
}

/**
 * The catalog document with each of the decks written, as withDeck
 * writes one: every subject set at once (editOf), and stray agents and
 * the catalog's links seen to once, so that many decks (a catalog
 * brought to this app's format) take time that grows with them and the
 * document, not their product. An agent's node longer than any term is
 * refused here (termTooLong), as the write would refuse it, before the
 * edits and the dataset are keyed by it (GHSA-4mgg-5xpp-3jx5). Each
 * deck is written with no more metadata than a deck keeps
 * (withBoundedMetadata), however it came to hold more.
 */
export function withDecks(dataset: Dataset, decks: readonly Deck[]): Dataset {
  const edit = editOf(dataset);
  const nodes = agentNodesIn(edit.getThing);
  for (const deck of decks.map(withBoundedMetadata)) {
    if (!wroteDeck(edit, nodes, deck)) {
      throw new AppError("termTooLong", { limit: MAX_TERM_CHARACTERS });
    }
  }
  const documents = new Set(decks.map((deck) => documentUrlOf(deck.url)));
  return withCatalogDatasets(
    withoutStrayAgents(edit.done(), documents, foreignSubjects(dataset)),
    decks.map((deck) => deck.url),
    "add",
  );
}

/** The subjects a deck is written as in `dataset` (withDeck's): its entry, its distribution and its agents. */
export function deckSubjects(dataset: Dataset, deck: Deck): string[] {
  return decksSubjects(dataset, [deck]);
}

/**
 * The subjects each of the decks is written as in `dataset` (withDecks'),
 * one deck after another, as deckSubjects gives them: the agent nodes of
 * the dataset are looked at once for all of them (agentNodesOf).
 */
export function decksSubjects(dataset: Dataset, decks: readonly Deck[]): string[] {
  const nodes = agentNodesIn((url) => getThing(dataset, url));
  return decks.flatMap((deck) => {
    const agents = new TextMap<string>();
    // Only the authors withDecks writes (withBoundedMetadata).
    const { url, authors } = withBoundedMetadata(deck);
    for (const agent of nodes.urlsOf(url, authors)) agents.set(agent, agent);
    return [deck.url, distributionUrlOf(deck.url), ...agents.values()];
  });
}

/**
 * The agent nodes of a catalog document, whose subjects `thingAt` finds
 * (agentNodesOf), each deck's authors named by urlsOf: a node that
 * holds another author's name or mailbox is never written over, as
 * every deck of the document names its authors' nodes, and the next one
 * is taken. A node a newer version of the app wrote is never written
 * over either, whatever it holds: the author is given its next node. A
 * node longer than any term holds nothing, and is not looked for: the
 * dataset's subjects are the keys of an object, which would key it
 * too. One for all the decks of a pass, so that many decks that share
 * an author look at its nodes once (GHSA-rm3f-655c-28wq).
 */
function agentNodesIn(thingAt: (url: string) => NamedSubject | null): AgentNodes {
  return agentNodesOf((url) => (isIriPastBound(url) ? null : agentHolderOf(thingAt(url))));
}

/**
 * The decks whose agents withDecks names within the bound on a term, in
 * `dataset`'s document. A deck from before format 3 names its authors
 * itself, and an agent's node, joined from the deck's address and an
 * author's name, can be longer than any term (GHSA-4mgg-5xpp-3jx5):
 * withDecks refuses such a deck, so a format update leaves it out, and
 * it does not keep the others from being brought up to date. The decks
 * are written in turn as withDecks writes them, each kept one taking
 * its nodes, so that a deck whose author is given a longer node because
 * a deck before it took the shorter one is left out too
 * (GHSA-qw6g-vfqc-37rx).
 */
export function decksWithAgentsWithinBound(dataset: Dataset, decks: readonly Deck[]): Deck[] {
  const edit = editOf(dataset);
  const nodes = agentNodesIn(edit.getThing);
  return decks.filter((deck) => wroteDeck(edit, nodes, withBoundedMetadata(deck)));
}

/**
 * Writes `deck` into `edit` as withDecks writes each deck: its entry,
 * its agents at the nodes `nodes` names and its distribution, and has
 * `nodes` look again at what it wrote. False, with nothing written,
 * when an agent's node is longer than any term.
 */
function wroteDeck(edit: DatasetEdit<Dataset>, nodes: AgentNodes, deck: Deck): boolean {
  const creator = nodes.urlsOf(deck.url, deck.authors);
  if (creator.some(isIriPastBound)) return false;
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
  for (const url of [deck.url, ...creator, distribution.url]) nodes.written(url);
  return true;
}

/**
 * What `thing` holds of an agent (AgentHolder): nothing when there is
 * none or it says nothing an agent says, else the author it names, or
 * "unreadable". A node a newer version of the app wrote
 * (isAgentByNewer) is "unreadable", whatever it says: no author is
 * written onto it, and a deck saved over it names its author's next
 * node (GHSA-hqvj-6p8f-vqfx).
 */
function agentHolderOf(thing: NamedSubject | null): AgentHolder {
  if (thing === null) return null;
  if (isAgentByNewer(thing)) return "unreadable";
  if (!saysAnyOf(thing, AGENT_FIELDS)) return null;
  const read = readVersioned(thing, "agent");
  return read === null ? "unreadable" : migrate("agent", read.record, { subject: asUrl(thing) });
}

/**
 * The catalog document without each of the decks, their distributions,
 * or agents only they named, and with no deck group this app writes
 * listing one of them any more. Only this app's subjects go: another
 * app's at a distribution's IRI stays (foreignSubjects,
 * GHSA-gvpx-j2mc-x9r9), and a group in a newer format than this app's
 * keeps its links, which the layout reads as no member once the deck is
 * gone (GHSA-x9mp-vw7v-rpwg). An entry, a distribution or the catalog
 * node a newer version of the app wrote is refused (writtenByNewerApp);
 * an agent node a newer version wrote stays as it is.
 * Their former siblings keep their positions: the gap is read as if it
 * were not there (domain/deckTree.ts buildTree), and the next
 * arrangement closes it. The entries and distributions are taken out at
 * once, the groups, stray agents and the catalog's links seen to once,
 * so that many decks (a bulk removal in the Studio) take time that grows
 * with them and the document, not their product.
 */
export function withoutDecks(dataset: Dataset, decks: readonly Deck[]): Dataset {
  const leaving = new Set(decks.map((deck) => deck.url));
  const foreign = foreignSubjects(dataset);
  const removed = removeAllUnlessNewer(
    dataset,
    decks
      .flatMap((deck) => [deck.url, distributionUrlOf(deck.url)])
      .filter((url) => !foreign.has(url)),
  );
  const groups: NamedSubject[] = [];
  for (const thing of getThingAll(removed)) {
    if (!hasClass(thing, SM.DeckGroup)) continue;
    const listed = allIris(thing, DCAT.dataset);
    const kept = listed.filter((url) => !leaving.has(url));
    // A group a newer version of the app wrote is left as it is: its link to a deck gone reads as no member.
    if (kept.length === listed.length || storedVersionOf(thing) > LATEST_VERSION.deckGroup)
      continue;
    groups.push(buildThing(thing).setIriAll(DCAT.dataset, kept).build());
  }
  return withCatalogDatasets(
    withoutStrayAgents(
      setThings(removed, groups),
      new Set(decks.map((deck) => documentUrlOf(deck.url))),
      foreign,
    ),
    [...leaving],
    "remove",
  );
}

function isTyped(dataset: Dataset, url: string, type: string): boolean {
  const thing = getThing(dataset, url);
  return thing !== null && hasClass(thing, type);
}

function deckUrlsOf(dataset: Dataset): string[] {
  return getThingAll(dataset)
    .filter((thing) => hasClass(thing, SM.Deck))
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
    const listed = new Set(allIris(catalog, DCAT.dataset));
    const links = [...urls].filter((url) => listed.has(url) !== (change === "add"));
    if (links.length === 0) continue;
    const changing = new Set(links);
    const datasets =
      change === "add" ? [...listed, ...links] : [...listed].filter((url) => !changing.has(url));
    // The new list set in one call (setIriAll), however many links change;
    // a link the library takes for no URL, which another app may have
    // written, stays as it is.
    changed.push(buildThing(unlessNewer(catalog)).setIriAll(DCAT.dataset, datasets).build());
  }
  return setThings(dataset, changed);
}

/**
 * The catalog of a catalog document, its publisher named by the agent
 * node beside it (or by the WebID when there is none); "misfit" when the
 * document's `#catalog` has statements of its own but does not fit the
 * catalog's shape (whatever its type, or with none), which no write of a
 * catalog replaces; null when there are none.
 */
export function toCatalog(dataset: Dataset, documentUrl: string): CatalogRead {
  const url = `${documentUrl}#catalog`;
  const thing = getThing(dataset, url);
  if (thing === null) return null;
  const read = readVersioned(thing, "catalog");
  if (read === null) return "misfit";
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
  const before = new Set(existing === null ? [] : allIris(existing, DCTERMS.license));
  const foreign = foreignSubjects(dataset);
  const kept = (existing === null ? [] : allIris(existing, DCAT.dataset)).filter(
    (link) =>
      !isSameDocument(link, documentUrl) ||
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
  const named = new Set(getThingAll(updated).flatMap((thing) => allIris(thing, DCTERMS.license)));
  // Each old license once, the changes made in one pass: one edit of the
  // whole document per license would take time in the square of them.
  const untyped: Subject[] = [];
  const gone: string[] = [];
  for (const license of before) {
    if (license === catalog.license || named.has(license)) continue;
    const node = getThing(updated, license);
    if (node === null) continue;
    const thing = buildThing(node).removeUrl(RDF.type, DCTERMS.LicenseDocument).build();
    if (saysNothing(thing)) gone.push(license);
    else untyped.push(thing);
  }
  updated = removeThings(setThings(updated, untyped), gone);
  if (catalog.license !== undefined) {
    const node = getThing(updated, catalog.license) ?? createThing({ url: catalog.license });
    if (!hasClass(node, DCTERMS.LicenseDocument)) {
      updated = setThing(
        updated,
        buildThing(node).addIri(RDF.type, DCTERMS.LicenseDocument).build(),
      );
    }
  }
  return updated;
}

/**
 * Whether a newer version of the app wrote the node at an agent's URL:
 * it is stamped above the agent format this app writes (AGENT_V1),
 * whatever its classes, as the agent's write (recordThing) judges it.
 * Such a node is never removed or rewritten by a catalog write, and
 * never refuses one (GHSA-hqvj-6p8f-vqfx).
 */
function isAgentByNewer(thing: Subject): boolean {
  return storedVersionOf(thing) > AGENT_V1.version;
}

/** The predicates of an agent's fields (AGENT_V1): a node that has none of them says nothing an agent says. */
const AGENT_FIELDS: readonly string[] = AGENT_V1.fields.map((field) => field.predicate);

/** What this app writes of an agent: its class, its format stamp and its fields (AGENT_V1). */
const AGENT_PREDICATES: readonly string[] = [SM.formatVersion, ...AGENT_FIELDS];

/**
 * The dataset without the agent nodes this app wrote (`#agent-…`) in one
 * of `documents` that nothing in it names any longer. A node is this
 * app's only when it was not another app's before the write (`foreign`,
 * foreignSubjects of the document as it was read): the IRI alone never
 * makes it one, so another app's subject at such a fragment stays
 * (GHSA-gvpx-j2mc-x9r9). Of this app's node only the agent statements
 * go; anything else said of it stays, and the node with it. A node a
 * newer version of the app wrote is never removed or rewritten: it
 * stays as it is (isAgentByNewer), whether or not a deck the write
 * saves or removes named it, as removeOwned leaves one. Leaving it
 * rewrites nothing of the newer version's, and refusing it would keep
 * decks from being written (GHSA-hqvj-6p8f-vqfx).
 */
function withoutStrayAgents(
  dataset: Dataset,
  documents: ReadonlySet<string>,
  foreign: ReadonlySet<string>,
): Dataset {
  const named = new Set(
    getThingAll(dataset).flatMap((thing) => [
      ...allIris(thing, DCTERMS.creator),
      ...allIris(thing, DCTERMS.publisher),
    ]),
  );
  const isStray = (url: string) => {
    const hash = url.indexOf("#");
    return (
      hash >= 0 &&
      url.startsWith("#agent-", hash) &&
      documents.has(url.slice(0, hash)) &&
      !named.has(url) &&
      !foreign.has(url)
    );
  };
  const gone: string[] = [];
  const kept: NamedSubject[] = [];
  for (const thing of getThingAll(dataset)) {
    // One a newer version of the app wrote stays as it is.
    if (!isStray(asUrl(thing)) || isAgentByNewer(thing)) continue;
    const builder = buildThing(thing).removeUrl(RDF.type, AGENT_V1.targetClass);
    for (const predicate of AGENT_PREDICATES) builder.removeAll(predicate);
    const rest = builder.build();
    if (saysNothing(rest)) gone.push(asUrl(thing));
    else kept.push(rest);
  }
  return removeThings(setThings(dataset, kept), gone);
}

/**
 * Map a cards-document subject to a Card, with the distractors it names
 * from the same document and the release it was taken from
 * (`sm:fromRelease`, outside the card format, read whatever format the
 * card states); null when the subject is not an sm:Card that fits its
 * format's shape, or a side has neither text nor a picture.
 */
export function toCard(thing: Subject, dataset: Dataset): Card | null {
  const read = readCard(thing);
  if (read === null) return null;
  const card = cardFromRecord(
    asUrl(thing),
    read.storedVersion,
    read.data,
    distractorsOf(dataset, read.data.distractor),
  );
  // One that is no URL is not read (CARD_TERMS), and stays as it is on the card (cardThing).
  const { fromRelease } = readTerms(thing, CARD_TERMS);
  return card === null || fromRelease === undefined ? card : { ...card, fromRelease };
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
    data: { ...data, subject: readFieldOf(thing, CARD_V7, "subject")! },
  };
}

/**
 * Every card of the cards document at `documentUrl`: its own subjects
 * alone (ownSubjectsOf). A card's id is its fragment, so a subject of
 * another document the cards document states things of, which may
 * share a card's fragment, is never read as one of its cards.
 */
export function toCards(dataset: Dataset, documentUrl: string): Card[] {
  return ownSubjectsOf(dataset, documentUrl)
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
    .map((url) => distractorAt(dataset, url))
    .filter((distractor): distractor is Distractor => distractor !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** The distractors read so far of each document, by IRI (null: none that fits its shape there). */
const readDistractors = new WeakMap<Dataset, Map<string, Distractor | null>>();

/**
 * The distractor at `url` of the document, read once per document
 * however many of its cards name it: the cards that share it share one
 * object, which a learner's upgrade compares once (libraryUpgrade.ts).
 * A document never changes (each edit makes a new one), so what was read
 * of it stays true. A document itself (isDocumentSubject) is no
 * distractor.
 */
function distractorAt(dataset: Dataset, url: string): Distractor | null {
  let read = readDistractors.get(dataset);
  if (read === undefined) {
    read = new Map();
    readDistractors.set(dataset, read);
  }
  if (read.has(url)) return read.get(url) ?? null;
  const thing = isDocumentSubject(url) ? null : getThing(dataset, url);
  const distractor = thing === null ? null : toDistractor(thing);
  read.set(url, distractor);
  return distractor;
}

/**
 * Writes a card's distractors beside it, as subjects of `documentUrl`
 * (an existing one keeps triples this app does not know); a distractor
 * is never written onto a card (unlessTyped). One that `writtenBefore`
 * says another card of the same write has written already is not
 * written again (writeCards in solidDeckRepository.ts says why), so a
 * distractor many cards name is written once, not once for each.
 * Refused (distractorIdRepeated) when two of the card's are one subject,
 * the later replacing the earlier, whichever route the card came by.
 * Returns the URLs the card names,
 * for the write check, and those it named before (`before`) but names
 * no longer (`dropped`), for withoutUnnamedDistractors.
 */
export function writeDistractors(
  edit: DatasetEdit<Dataset>,
  documentUrl: string,
  distractors: readonly Distractor[],
  before: readonly string[],
  writtenBefore: (url: string) => boolean = () => false,
): { subjects: string[]; dropped: string[] } {
  const subjects = distractors.map((distractor) => `${documentUrl}#${distractor.id}`);
  const written = new Set(subjects);
  if (written.size < subjects.length) throw new AppError("distractorIdRepeated");
  for (const [i, distractor] of distractors.entries()) {
    if (writtenBefore(subjects[i])) continue;
    edit.setThing(
      recordThing(
        subjects[i],
        DISTRACTOR_V1,
        distractorToRecord(distractor),
        unlessTyped(edit, subjects[i], SM.Card),
      ),
    );
  }
  return { subjects, dropped: before.filter((url) => !written.has(url)) };
}

/** How many subjects of the document name each URL as their distractor (sm:distractor). */
function distractorNamers(dataset: Dataset): Map<string, number> {
  const namers = new Map<string, number>();
  for (const thing of getThingAll(dataset))
    for (const url of allIris(thing, SM.distractor)) namers.set(url, (namers.get(url) ?? 0) + 1);
  return namers;
}

/**
 * The document without each of `urls`, distractors a card no longer
 * names, unless a card still names it: a distractor belongs to the one
 * card that names it, so a card's never goes with another's. Only an
 * sm:Distractor that is not an sm:Card is removed (isDistractorOnly):
 * a card, another app's subject, or the document itself
 * (isDocumentSubject), that a card names is never removed. Nor
 * is one a newer version of the app wrote (isWrittenByNewer): no write
 * needs it gone, so it is left as it is rather than refused, and a
 * card is never kept from being removed or moved by it
 * (GHSA-7x88-hfwx-whvj).
 */
export function withoutUnnamedDistractors(dataset: Dataset, urls: readonly string[]): Dataset {
  if (urls.length === 0) return dataset;
  const namers = distractorNamers(dataset);
  return removeThings(
    dataset,
    urls.filter((url) => isUnnamed(namers, url) && isDistractorOnly(dataset, url)),
  );
}

/** Whether no subject of the document names the distractor at `url` (distractorNamers) any longer. */
function isUnnamed(namers: ReadonlyMap<string, number>, url: string): boolean {
  return !namers.has(url);
}

/**
 * Whether the subject at `url` is typed sm:Distractor and not sm:Card,
 * this app wrote it (not isWrittenByNewer), and it is not the document
 * itself (isDocumentSubject).
 */
function isDistractorOnly(dataset: Dataset, url: string): boolean {
  const thing = isDocumentSubject(url) ? null : getThing(dataset, url);
  if (thing === null) return false;
  return hasClass(thing, SM.Distractor) && !hasClass(thing, SM.Card) && !isWrittenByNewer(thing);
}

/**
 * The document without the cards at `urls`, all at once. A subject an
 * earlier version left typed both a card and a distractor, which
 * another card names as its distractor, loses only its card statements
 * (the sm:Card type and the card properties no distractor has), so the
 * card that names it keeps its distractor. A subject at one of `urls`
 * that is no card and that a newer version of the app wrote
 * (isWrittenByNewer) is no card the removal is for: no write needs it
 * gone or rewritten, so it is left as it is (GHSA-7x88-hfwx-whvj). A
 * card a newer version wrote is refused (writtenByNewerApp). The
 * document itself (isDocumentSubject) is no card: it is left whole, with
 * what it says of whose the document is.
 */
export function withoutCardSubjects(dataset: Dataset, urls: readonly string[]): Dataset {
  let namers: Map<string, number> | undefined;
  const removed: string[] = [];
  const kept: NamedSubject[] = [];
  for (const url of urls) {
    const thing = isDocumentSubject(url) ? null : getThing(dataset, url);
    if (thing === null) continue;
    if (!hasClass(thing, SM.Card) && isWrittenByNewer(thing)) continue;
    const named = hasClass(thing, SM.Distractor) && (namers ??= distractorNamers(dataset)).has(url);
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
  const kept = allIris(card, SCHEMA.suggestedAnswer).filter((url) => !dropped.has(url));
  // The new list set in one call (setIriAll), however many distractors the card has.
  return buildThing(card)
    .setIriAll(SCHEMA.suggestedAnswer, [...kept, ...distractors])
    .build();
}
