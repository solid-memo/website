// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  getInteger,
  getSourceUrl,
  getThing,
  getThingAll,
  getUrlAll,
  hasResourceInfo,
  toRdfJsDataset,
  type SolidDataset,
  type Thing,
} from "@inrupt/solid-client";
import { isSameUrl } from "@solid-memo/domain/instanceLayout";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import type { Owned, Statement } from "./datasets";
import { namesAnotherScheduler } from "./mappers/reviewStateMapper";
import { DCTERMS, RDF, SM, SM_NS } from "./vocab";

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
 * Memo's when another app's rewrite has dropped their stamp. A subject
 * naming another scheduler (any sm:scheduler but the sm:sm2 and sm:fsrs6
 * IRIs) is never Solid Memo's. So is the document itself (`<>`) when
 * all it says is that it is a deck's (isDeckBackLink). Every other
 * subject of the document is another app's.
 */
export function solidMemoSubjects(dataset: SolidDataset): Set<string> {
  return withWrittenBeside(
    dataset,
    getThingAll(dataset).filter((thing) => isSolidMemos(dataset, thing)),
  );
}

/** Whether the subject is Solid Memo's by what it says itself (solidMemoSubjects). */
function isSolidMemos(dataset: SolidDataset, thing: Thing): boolean {
  return (
    isDeckBackLink(dataset, thing) ||
    (!namesAnotherScheduler(thing) &&
      (thing.url.endsWith("#catalog") ||
        getInteger(thing, SM.formatVersion) !== null ||
        getUrlAll(thing, RDF.type).some((type) => type.startsWith(SM_NS))))
  );
}

/** The subjects, and what they name as creator, publisher or distribution, and what those name, on. */
function withWrittenBeside(dataset: SolidDataset, things: readonly Thing[]): Set<string> {
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
export function subjectsOfClasses(...classes: string[]): (dataset: SolidDataset) => Set<string> {
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
 *   states, and its saying it is theirs;
 * - when it says it is another deck's too (deckBackLinksOf), of this
 *   instance or another one: only its saying it is the leaving decks',
 *   the rest being that deck's.
 *
 * Anything else in it is kept.
 */
export function deckDocumentSubjects(entries: readonly string[]): (dataset: SolidDataset) => Owned {
  const deckSubjects = subjectsOfClasses(SM.Card, SM.Distractor, SM.ReviewState);
  const isLeaving = (url: string) => entries.some((entry) => isSameUrl(entry, url));
  return (dataset) => {
    const self = documentThings(dataset, getSourceUrl(dataset)!);
    const statements = self.flatMap((thing) =>
      getUrlAll(thing, DCTERMS.isPartOf)
        .filter(isLeaving)
        .map((url): Statement => [thing.url, DCTERMS.isPartOf, url]),
    );
    if (self.some((thing) => deckBackLinks(thing).some((url) => !isLeaving(url))))
      return { subjects: new Set(), statements };
    const owned = deckSubjects(dataset);
    for (const thing of self) if (isDeckBackLink(dataset, thing)) owned.add(thing.url);
    return owned;
  };
}

/**
 * What of a draft's document Solid Memo removes with the draft
 * (datasets.ts removeOwned): its subjects of Solid Memo's (the draft
 * deck, chapters, steps, cards, distractors, agents, distribution) and
 * every subject of the document they lead to, through blank nodes too:
 * how the release was made, its sources, its license, its series. A
 * subject nothing of the draft leads to is another app's, and kept.
 */
export function draftSubjects(dataset: SolidDataset): Set<string> {
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
export function isDeckBackLink(dataset: SolidDataset, thing: Thing): boolean {
  if (!hasResourceInfo(dataset) || !isSameUrl(thing.url, getSourceUrl(dataset))) return false;
  const predicates = Object.entries(thing.predicates);
  const partOf = getUrlAll(thing, DCTERMS.isPartOf);
  return (
    predicates.length === 1 &&
    predicates[0]![0] === DCTERMS.isPartOf &&
    Object.keys(predicates[0]![1]).length === 1 &&
    partOf.length > 0 &&
    partOf.every(isCatalogEntry)
  );
}

/** Whether the address is an entry of a catalog (`…/catalog.ttl#…`), a deck's as Solid Memo names it. */
function isCatalogEntry(url: string): boolean {
  return url.includes("#") && documentUrlOf(url).endsWith("/catalog.ttl");
}

/** The subjects that are the document at `url` itself (`<>`), spelled any way a request sends it. */
function documentThings(dataset: SolidDataset, url: string): Thing[] {
  return getThingAll(dataset).filter((thing) => isSameUrl(thing.url, url));
}

/** The decks a subject says it is part of: its dcterms:isPartOf naming a catalog's entry (isCatalogEntry). */
function deckBackLinks(thing: Thing): string[] {
  return getUrlAll(thing, DCTERMS.isPartOf).filter(isCatalogEntry);
}

/**
 * The decks the document at `url` says it is part of: what the
 * document itself (`<>`) states as dcterms:isPartOf naming a catalog's
 * entry, this instance's or another one's (deckPlace.ts withPartOf).
 */
export function deckBackLinksOf(dataset: SolidDataset, url: string): string[] {
  return documentThings(dataset, url).flatMap(deckBackLinks);
}

/** The subjects of a document another app wrote: every one that is not Solid Memo's (solidMemoSubjects). */
export function foreignSubjects(dataset: SolidDataset): Set<string> {
  const owned = solidMemoSubjects(dataset);
  return new Set(
    getThingAll(dataset)
      .map((thing) => thing.url)
      .filter((url) => !owned.has(url)),
  );
}
