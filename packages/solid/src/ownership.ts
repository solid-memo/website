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
import { SHAPES } from "@solid-memo/vocab/descriptors.generated";
import type { ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { DCAT, DCTERMS, RDF, SCHEMA, SM, SM_NS } from "./vocab";

/**
 * The links from a subject of Solid Memo's to the subjects it writes
 * beside it: a deck's creators and distribution, a catalog's or deck
 * group's publisher.
 */
const WRITTEN_BESIDE = [
  DCTERMS.creator,
  DCTERMS.publisher,
  "http://www.w3.org/ns/dcat#distribution",
];

/**
 * The subjects of a document that Solid Memo wrote (see docs/validation.md
 * "Data another app wrote"): those with a Solid Memo class or its format
 * stamp, the catalog at `#catalog`, and whatever these name as their
 * creator, publisher or distribution — a catalog, an agent and a
 * distribution have no class of Solid Memo's own, and they stay Solid
 * Memo's when another app's rewrite has dropped their stamp. A review
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
    (!isAnotherSchedulersState(thing) &&
      (thing.url.endsWith("#catalog") ||
        getInteger(thing, SM.formatVersion) !== null ||
        getUrlAll(thing, RDF.type).some((type) => type.startsWith(SM_NS))))
  );
}

/**
 * Whether the subject is a review state of another scheduler: it names
 * one (any sm:scheduler but the sm:sm2 and sm:fsrs6 IRIs), has no Solid
 * Memo class but sm:ReviewState, and is no catalog (the subject at
 * `#catalog`, or one of class dcat:Catalog). A card, deck, catalog or
 * any other subject of a Solid Memo class is read as one whatever
 * sm:scheduler it carries, so it stays Solid Memo's and is held to its
 * shape.
 */
function isAnotherSchedulersState(thing: Subject): boolean {
  const types = getUrlAll(thing, RDF.type);
  return (
    namesAnotherScheduler(thing) &&
    !thing.url.endsWith("#catalog") &&
    !types.includes(DCAT.Catalog) &&
    !types.some((type) => type.startsWith(SM_NS) && type !== SM.ReviewState)
  );
}

/** The subjects, and what they name as creator, publisher or distribution, and what those name, on. */
function withWrittenBeside(dataset: Dataset, things: readonly Subject[]): Set<string> {
  const pending = things.map((thing) => thing.url);
  const owned = new Set(pending);
  for (let url = pending.pop(); url !== undefined; url = pending.pop()) {
    const thing = getThing(dataset, url);
    if (thing === null) continue;
    for (const target of WRITTEN_BESIDE.flatMap((link) => getUrlAll(thing, link))) {
      if (owned.has(target)) continue;
      owned.add(target);
      pending.push(target);
    }
  }
  return owned;
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
    for (const target of links.get(key) ?? []) {
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
