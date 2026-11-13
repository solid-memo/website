// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { getSourceUrl, hasResourceInfo } from "./client/resources";
import {
  type Dataset,
  type Subject,
  getInteger,
  getThing,
  getThingAll,
  getUrlAll,
  propertiesOf,
  toRdfJsDataset,
} from "./client/rdf";
import { canonicalUrlOf, isSameUrl } from "@solid-memo/domain/instanceLayout";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import type { Owned, Statement } from "./datasets";
import { namesAnotherScheduler } from "./mappers/reviewStateMapper";
import { ALL_SHAPES, SHAPES } from "@solid-memo/vocab/descriptors.generated";
import type { ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { DCAT, DCTERMS, RDF, SCHEMA, SM, SM_NS } from "./vocab";

/**
 * The links Solid Memo follows from a subject of its own to one it
 * writes beside it, each with the class of what it names: a creator or
 * publisher is a foaf:Agent, a distribution a dcat:Distribution.
 */
const WRITTEN_BESIDE: ReadonlyMap<string, string> = new Map([
  [DCTERMS.creator, SHAPES.agent[1].targetClass],
  [DCTERMS.publisher, SHAPES.agent[1].targetClass],
  [DCAT.distribution, SHAPES.distribution[1].targetClass],
]);

/**
 * Which of WRITTEN_BESIDE each class of Solid Memo's writes, by its
 * shapes at every version that fit where `context` says, or that fit
 * anywhere: in a pod's catalog, a deck entry its creators and
 * distribution, a deck group and the catalog their publisher; in a
 * release or a draft, a deck its creators, distribution and publisher,
 * and a series its publisher. A card, a review state or any other class
 * writes none of them, so what it names that way is never Solid Memo's.
 */
function writtenBesideByClass(
  context: "pod" | "release",
): ReadonlyMap<string, ReadonlySet<string>> {
  const fits = (shape: ShapeDescriptor) =>
    shape.context === "any" ||
    (context === "pod" ? shape.context === "pod" : shape.context !== "pod");
  const links = new Map<string, Set<string>>();
  for (const shape of ALL_SHAPES.filter(fits)) {
    for (const field of shape.fields) {
      if (field.kind !== "iri" || !WRITTEN_BESIDE.has(field.predicate)) continue;
      const written = links.get(shape.targetClass) ?? new Set<string>();
      links.set(shape.targetClass, written.add(field.predicate));
    }
  }
  return links;
}

/** WRITTEN_BESIDE by class in an instance's catalog (isCatalogDocument): a deck entry, a deck group, the catalog. */
const WRITTEN_BESIDE_IN_CATALOG = writtenBesideByClass("pod");

/** WRITTEN_BESIDE by class in a release or a draft (isDeckItself): its deck, its series. */
const WRITTEN_BESIDE_IN_DECK = writtenBesideByClass("release");

/**
 * The subjects of a document that Solid Memo wrote (see docs/validation.md
 * "Data another app wrote"): those with a Solid Memo class or its format
 * stamp, the catalog (isCatalogSubject), and what these name beside them
 * (withWrittenBeside) — a catalog, an agent and a distribution have no
 * class of Solid Memo's own, and they stay Solid Memo's when another
 * app's rewrite has dropped their stamp. A review
 * state of another scheduler (isAnotherSchedulersState) is never Solid
 * Memo's. The document itself (`<>`) is when all it says is that it is
 * a deck's (isDeckBackLink). Every other subject of the document is
 * another app's.
 */
export function solidMemoSubjects(dataset: Dataset): Set<string> {
  return withWrittenBeside(
    dataset,
    getThingAll(dataset).filter((thing) => isSolidMemos(dataset, thing)),
  );
}

/** Whether the subject is Solid Memo's by what it says itself (solidMemoSubjects). */
function isSolidMemos(dataset: Dataset, thing: Subject): boolean {
  return (
    isDeckBackLink(dataset, thing) ||
    (!isAnotherSchedulersState(dataset, thing) &&
      (isCatalogSubject(dataset, thing) ||
        getInteger(thing, SM.formatVersion) !== null ||
        getUrlAll(thing, RDF.type).some((type) => type.startsWith(SM_NS))))
  );
}

/**
 * Whether the subject is a review state of another scheduler: it names
 * one (any sm:scheduler but the sm:sm2 and sm:fsrs6 IRIs), has no Solid
 * Memo class but sm:ReviewState, and is no catalog (isCatalogSubject,
 * or one of class dcat:Catalog). A card, deck, catalog or
 * any other subject of a Solid Memo class is read as one whatever
 * sm:scheduler it carries, so it stays Solid Memo's and is held to its
 * shape.
 */
function isAnotherSchedulersState(dataset: Dataset, thing: Subject): boolean {
  const types = getUrlAll(thing, RDF.type);
  return (
    namesAnotherScheduler(thing) &&
    !isCatalogSubject(dataset, thing) &&
    !types.includes(DCAT.Catalog) &&
    !types.some((type) => type.startsWith(SM_NS) && type !== SM.ReviewState)
  );
}

/**
 * Whether the dataset is an instance's catalog document (`…/catalog.ttl`),
 * which holds the catalog, its deck entries and its deck groups, and no
 * release, draft or series. It is told by the address the dataset was
 * read from, so a catalog's dataset must keep it (getSourceUrl): one
 * without it is read as any other document, its `#catalog` as none.
 */
function isCatalogDocument(dataset: Dataset): boolean {
  return getSourceUrl(dataset)?.endsWith("/catalog.ttl") ?? false;
}

/**
 * Whether the subject is the catalog by its address: `#catalog` of an
 * instance's catalog document (isCatalogDocument), with or without a
 * class. A `#catalog` of any other document is none.
 */
function isCatalogSubject(dataset: Dataset, thing: Subject): boolean {
  return isCatalogDocument(dataset) && isSameUrl(thing.url, `${getSourceUrl(dataset)!}#catalog`);
}

/**
 * The subjects, and what they name beside them, and what those name, on.
 * A subject is followed only through a link its class writes in that
 * document (linksWrittenOn), to a subject of the class the link names
 * (WRITTEN_BESIDE) and of no other class a shape describes
 * (writtenBeside): another app's node a card names as its creator, a
 * deck entry's publisher, or a deck's creator that is a catalog, stays
 * another app's.
 */
function withWrittenBeside(dataset: Dataset, things: readonly Subject[]): Set<string> {
  const pending = [...things];
  const owned = new Set(things.map((thing) => thing.url));
  for (let thing = pending.pop(); thing !== undefined; thing = pending.pop()) {
    for (const [link, targetClass] of linksWrittenOn(dataset, thing)) {
      for (const url of getUrlAll(thing, link)) {
        const target = owned.has(url) ? null : writtenBeside(dataset, url, targetClass);
        if (target === null) continue;
        owned.add(url);
        pending.push(target);
      }
    }
  }
  return owned;
}

/**
 * The links of WRITTEN_BESIDE that Solid Memo writes on `thing` in the
 * kind of document it is in, each with the class it names: in an
 * instance's catalog (isCatalogDocument), those of a deck entry, a deck
 * group and the catalog; in a release or a draft (isDeckItself), those
 * of its deck and its series; in a deck's cards or reviews document, or
 * any other, none. They are chosen by the subject's classes of Solid
 * Memo's (sm:Deck, sm:DeckGroup, …) when it has one, its other classes
 * then being added by anyone who may append to the document: a card that
 * also says it is a series is a card. Without one, they are chosen by
 * its classes in a release or a draft (a series), and in a catalog only
 * for the catalog itself (isCatalogSubject), with or without its class.
 */
function linksWrittenOn(dataset: Dataset, thing: Subject): [string, string][] {
  const types = getUrlAll(thing, RDF.type);
  const own = types.filter((type) => type.startsWith(SM_NS));
  let byClass = WRITTEN_BESIDE_IN_DECK;
  let classes = own.length > 0 ? own : types;
  if (isCatalogDocument(dataset)) {
    byClass = WRITTEN_BESIDE_IN_CATALOG;
    if (own.length === 0) classes = isCatalogSubject(dataset, thing) ? [DCAT.Catalog] : [];
  } else if (!isDeckDocument(dataset)) return [];
  return [...WRITTEN_BESIDE].filter(([link]) =>
    classes.some((type) => byClass.get(type)?.has(link)),
  );
}

/**
 * Whether the dataset is a release or a draft's release document: the
 * document itself (`<>`) is an sm:Deck (isDeckItself). A deck's cards
 * and reviews documents never are.
 */
function isDeckDocument(dataset: Dataset): boolean {
  const url = getSourceUrl(dataset);
  return url !== null && isDeckItself(dataset, url);
}

/** The classes Solid Memo's shapes describe: dcat:Catalog, sm:Deck, foaf:Agent, … */
const SHAPED_CLASSES: ReadonlySet<string> = new Set(ALL_SHAPES.map((shape) => shape.targetClass));

/**
 * The subject at `url` when it is of `targetClass` and of no other
 * class a shape describes, else null: an agent that is also a catalog
 * or a deck, say, is none Solid Memo writes.
 */
function writtenBeside(dataset: Dataset, url: string, targetClass: string): Subject | null {
  const thing = getThing(dataset, url);
  if (thing === null) return null;
  const types = getUrlAll(thing, RDF.type);
  const isWritten =
    types.includes(targetClass) &&
    types.every((type) => type === targetClass || !SHAPED_CLASSES.has(type));
  return isWritten ? thing : null;
}

/** Every class a shape of Solid Memo's describes or adds: dcat:Catalog, sm:Deck, dcat:Dataset, foaf:Agent, … */
const SHAPED_TYPES: ReadonlySet<string> = new Set(
  ALL_SHAPES.flatMap((shape) => [shape.targetClass, ...shape.additionalTypes]),
);

/**
 * Whether the subject at `url` of an instance's catalog is an agent
 * Solid Memo writes beside a deck entry as its creator: a foaf:Agent of
 * no other class a shape describes or adds, stricter than writtenBeside
 * by the classes shapes add, and not the catalog (isCatalogSubject). Another deck's entry, a dcat:Dataset or
 * the catalog a deck names as its creator is none, so an export leaves
 * it behind (solidDeckArchive.ts).
 */
export function isCreatorAgent(dataset: Dataset, url: string): boolean {
  const thing = getThing(dataset, url);
  if (thing === null || isCatalogSubject(dataset, thing)) return false;
  const types = getUrlAll(thing, RDF.type);
  const agent = SHAPES.agent[1].targetClass;
  return types.includes(agent) && types.every((type) => type === agent || !SHAPED_TYPES.has(type));
}

/**
 * What of a document Solid Memo removes when it removes the document
 * (datasets.ts removeOwned): the subjects of its own (solidMemoSubjects)
 * of one of `classes`, with what they name beside them. Anything else
 * in it is kept.
 */
export function subjectsOfClasses(...classes: string[]): (dataset: Dataset) => Set<string> {
  return (dataset) =>
    withWrittenBeside(
      dataset,
      getThingAll(dataset).filter(
        (thing) =>
          isSolidMemos(dataset, thing) &&
          getUrlAll(thing, RDF.type).some((type) => classes.includes(type)),
      ),
    );
}

/**
 * What of a deck's cards or reviews document Solid Memo removes with the
 * deck (datasets.ts removeOwned), `entries` being the decks leaving:
 *
 * - when the document says it is only theirs (each deck it names, if
 *   any, one of `entries`): its cards, their distractors and its review
 *   states (deckEntrySubjects), and its saying it is theirs;
 * - when it says it is another deck's too (deckBackLinksOf), of this
 *   instance or another one: only its saying it is the leaving decks',
 *   the rest being that deck's;
 * - when it is a deck itself (isDeckItself), a release others may read
 *   by its address: nothing.
 *
 * Anything else in it is kept.
 */
export function deckDocumentSubjects(entries: readonly string[]): (dataset: Dataset) => Owned {
  // Each entry's address as a request sends it, worked out once, so
  // that a document's links are looked up rather than compared with
  // every entry.
  const leaving = new Set(entries.map(canonicalUrlOf));
  const isLeaving = (url: string) => {
    const canonical = canonicalUrlOf(url);
    return canonical !== null && leaving.has(canonical);
  };
  return (dataset) => {
    const url = getSourceUrl(dataset)!;
    if (isDeckItself(dataset, url)) return new Set();
    const self = documentThings(dataset, url);
    const statements = self.flatMap((thing) =>
      getUrlAll(thing, DCTERMS.isPartOf)
        .filter(isLeaving)
        .map((url): Statement => [thing.url, DCTERMS.isPartOf, url]),
    );
    if (self.some((thing) => deckBackLinks(thing).some((url) => !isLeaving(url))))
      return { subjects: new Set(), statements };
    const owned = deckEntrySubjects(dataset, url);
    for (const thing of self) if (isDeckBackLink(dataset, thing)) owned.add(thing.url);
    return owned;
  };
}

/**
 * The shapes of what a deck's cards and reviews documents hold, at
 * every version: cards, distractors and review states of either
 * scheduler.
 */
const DECK_ENTRY_SHAPES: readonly ShapeDescriptor[] = [
  SHAPES.card,
  SHAPES.distractor,
  SHAPES.reviewState,
  SHAPES.fsrsReviewState,
].flatMap((versions) => Object.values(versions));

/** The classes a card, distractor or review state is of (DECK_ENTRY_SHAPES' target classes). */
const DECK_ENTRY_CLASSES: ReadonlySet<string> = new Set(
  DECK_ENTRY_SHAPES.map((shape) => shape.targetClass),
);

/** Every class a card, distractor or review state of Solid Memo's states: its own and the others its shape adds. */
const DECK_ENTRY_TYPES: ReadonlySet<string> = new Set(
  DECK_ENTRY_SHAPES.flatMap((shape) => [shape.targetClass, ...shape.additionalTypes]),
);

/**
 * Every property a card, distractor or review state of Solid Memo's
 * has: rdf:type, those of its shape at any version, the format stamp,
 * the release a card was taken from (solidDeckRepository.ts), and the
 * schema:suggestedAnswer beside each sm:distractor (deckMapper.ts
 * withSuggestedAnswers).
 */
const DECK_ENTRY_PROPERTIES: ReadonlySet<string> = new Set([
  RDF.type,
  SM.formatVersion,
  SM.fromRelease,
  SCHEMA.suggestedAnswer,
  ...DECK_ENTRY_SHAPES.flatMap((shape) => [
    ...shape.fields.map((field) => field.predicate),
    ...shape.fixedValues.map((fixed) => fixed.predicate),
  ]),
]);

/**
 * The cards, distractors and review states of the deck's document at
 * `url` that are Solid Memo's (isSolidMemos) and say nothing else
 * (isDeckEntryShaped), and nothing they name: no card links to a
 * subject of another kind. The document itself (`<>`) is never one,
 * whatever class it says it has, so that it goes only when all it says
 * is that it is a deck's (isDeckBackLink).
 */
function deckEntrySubjects(dataset: Dataset, url: string): Set<string> {
  return new Set(
    getThingAll(dataset)
      .filter(
        (thing) =>
          !isSameUrl(thing.url, url) &&
          isSolidMemos(dataset, thing) &&
          getUrlAll(thing, RDF.type).some((type) => DECK_ENTRY_CLASSES.has(type)) &&
          isDeckEntryShaped(thing),
      )
      .map((thing) => thing.url),
  );
}

/**
 * Whether all a subject says is what a card, distractor or review state
 * of Solid Memo's says: each of its classes one of DECK_ENTRY_TYPES and
 * each of its properties one of DECK_ENTRY_PROPERTIES. Any other class
 * or property, Solid Memo's own or not, keeps it whole: anyone who may
 * append to a document can add a class to a subject of someone else's
 * in it, such as the user's preferences, but what that subject said
 * before stays.
 */
function isDeckEntryShaped(thing: Subject): boolean {
  return (
    getUrlAll(thing, RDF.type).every((type) => DECK_ENTRY_TYPES.has(type)) &&
    propertiesOf(thing).every(({ predicate }) => DECK_ENTRY_PROPERTIES.has(predicate))
  );
}

/**
 * What of a draft's document Solid Memo removes with the draft
 * (datasets.ts removeOwned): its subjects of Solid Memo's (the draft
 * deck, chapters, steps, cards, distractors, agents, distribution) and
 * every subject of the document they lead to, through blank nodes too:
 * how the release was made, its sources, its license, its series. A
 * subject nothing of the draft leads to is another app's, and kept.
 */
export function draftSubjects(dataset: Dataset): Set<string> {
  const links = new Map<string, string[]>();
  for (const quad of toRdfJsDataset(dataset)) {
    const from = termKey(quad.subject);
    const targets = links.get(from) ?? [];
    links.set(from, targets);
    if (quad.object.termType === "NamedNode" || quad.object.termType === "BlankNode")
      targets.push(termKey(quad.object));
  }
  const reached = new Set(solidMemoSubjects(dataset));
  const pending = [...reached];
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    // Every key reached is a subject of the dataset (solidMemoSubjects
    // or one it has quads of, `links.has`), so it has its entry.
    for (const target of links.get(key)!) {
      if (reached.has(target) || !links.has(target)) continue;
      reached.add(target);
      pending.push(target);
    }
  }
  return new Set([...reached].filter((key) => !key.startsWith("_:")));
}

/** A subject or object as the dataset keys it: a blank node `_:` and its label. */
function termKey(term: { termType: string; value: string }): string {
  return term.termType === "BlankNode" ? `_:${term.value}` : term.value;
}

/**
 * Whether `thing` is the document's own subject (`<>`, the document it
 * was read from) saying no more than that the document is a deck's: one
 * dcterms:isPartOf, or more, each naming an entry of a catalog
 * (isCatalogEntry), as Solid Memo writes it on a deck's cards and
 * reviews documents (deckPlace.ts withPartOf).
 */
export function isDeckBackLink(dataset: Dataset, thing: Subject): boolean {
  if (!hasResourceInfo(dataset) || !isSameUrl(thing.url, getSourceUrl(dataset))) return false;
  const properties = propertiesOf(thing);
  const partOf = getUrlAll(thing, DCTERMS.isPartOf);
  return (
    properties.length === 1 &&
    properties[0]!.predicate === DCTERMS.isPartOf &&
    properties[0]!.values.every((value) => value.type === "iri") &&
    partOf.length > 0 &&
    partOf.every(isCatalogEntry)
  );
}

/** Whether the address is an entry of a catalog (`…/catalog.ttl#…`), a deck's as Solid Memo names it. */
function isCatalogEntry(url: string): boolean {
  return url.includes("#") && documentUrlOf(url).endsWith("/catalog.ttl");
}

/** The subjects that are the document at `url` itself (`<>`), spelled any way a request sends it. */
function documentThings(dataset: Dataset, url: string): Subject[] {
  return getThingAll(dataset).filter((thing) => isSameUrl(thing.url, url));
}

/**
 * Whether the document itself (`<>`, spelled any way a request sends it,
 * with its percent-encoding undone too, as a server may read it) is an
 * sm:Deck: a release, or a draft's release document. No deck's cards or
 * reviews are kept in one, and what it says of itself is what the
 * release it was made from said, so it is never a deck's document
 * (deckPlace.ts).
 */
export function isDeckItself(dataset: Dataset, url: string): boolean {
  return [url, decodedOf(url)].some((spelling) =>
    documentThings(dataset, spelling).some((thing) => getUrlAll(thing, RDF.type).includes(SM.Deck)),
  );
}

/** The address with its percent-encoding undone; as it is when that cannot be done. */
function decodedOf(url: string): string {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

/** The decks a subject says it is part of: its dcterms:isPartOf naming a catalog's entry (isCatalogEntry). */
function deckBackLinks(thing: Subject): string[] {
  return getUrlAll(thing, DCTERMS.isPartOf).filter(isCatalogEntry);
}

/**
 * The decks the document at `url` says it is part of: what the
 * document itself (`<>`) states as dcterms:isPartOf naming a catalog's
 * entry, this instance's or another one's (deckPlace.ts withPartOf).
 */
export function deckBackLinksOf(dataset: Dataset, url: string): string[] {
  return documentThings(dataset, url).flatMap(deckBackLinks);
}

/** The subjects of a document another app wrote: every one that is not Solid Memo's (solidMemoSubjects). */
export function foreignSubjects(dataset: Dataset): Set<string> {
  const owned = solidMemoSubjects(dataset);
  return new Set(
    getThingAll(dataset)
      .map((thing) => thing.url)
      .filter((url) => !owned.has(url)),
  );
}
