// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  buildThing,
  createThing,
  mockSolidDatasetFrom,
  setThing,
  type SolidDataset,
  type ThingPersisted,
} from "@inrupt/solid-client";
import { readDataset } from "./datasets";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import {
  deckDocumentSubjects,
  draftSubjects,
  foreignSubjects,
  solidMemoSubjects,
  subjectsOfClasses,
} from "./ownership";
import { DCAT, DCTERMS, RDF, SM } from "./vocab";

const DOC = "https://pod.example/solid-memo/a/catalog.ttl";
const DCAT_DISTRIBUTION = "http://www.w3.org/ns/dcat#distribution";
const FOAF_AGENT = "http://xmlns.com/foaf/0.1/Agent";

function documentOf(...things: ThingPersisted[]): SolidDataset {
  return things.reduce<SolidDataset>(
    (dataset, thing) => setThing(dataset, thing),
    mockSolidDatasetFrom(DOC),
  );
}

const subject = (id: string) =>
  buildThing(createThing({ url: id.startsWith("https:") ? id : `${DOC}#${id}` }));

describe("foreignSubjects", () => {
  it("leaves out what Solid Memo wrote, stamped or not, and what it names as creator, publisher or distribution", () => {
    const alice = "https://alice.example/profile/card#me";
    const dataset = documentOf(
      // The catalog, its stamp dropped by another app's rewrite, and its publisher.
      subject("catalog")
        .addIri(RDF.type, DCAT.Catalog)
        .addUrl(DCTERMS.publisher, alice)
        .addUrl(DCAT.dataset, `${DOC}#recipes`)
        .build(),
      subject(alice).addIri(RDF.type, FOAF_AGENT).build(),
      // Two decks naming the same unstamped agent; one deck's distribution is unstamped too.
      subject("deck-1")
        .addIri(RDF.type, SM.Deck)
        .addUrl(DCTERMS.creator, `${DOC}#agent-1`)
        .addUrl(DCAT_DISTRIBUTION, `${DOC}#deck-1-dist`)
        .build(),
      subject("deck-2")
        .addIri(RDF.type, SM.Deck)
        .addUrl(DCTERMS.creator, `${DOC}#agent-1`)
        .addUrl(DCTERMS.creator, "https://elsewhere.example/#bob")
        .build(),
      subject("agent-1").addIri(RDF.type, FOAF_AGENT).build(),
      subject("deck-1-dist").addIri(RDF.type, "http://www.w3.org/ns/dcat#Distribution").build(),
      // A stamped subject with no Solid Memo class is Solid Memo's.
      subject("agent-2").addIri(RDF.type, FOAF_AGENT).addInteger(SM.formatVersion, 1).build(),
      // Another app's dataset, and its publisher: neither is Solid Memo's.
      subject("recipes")
        .addIri(RDF.type, DCAT.Dataset)
        .addUrl(DCTERMS.publisher, `${DOC}#chef`)
        .build(),
      subject("chef").addIri(RDF.type, FOAF_AGENT).build(),
    );
    expect(foreignSubjects(dataset)).toEqual(new Set([`${DOC}#recipes`, `${DOC}#chef`]));
  });

  it("finds nothing foreign in an empty document", () => {
    expect(foreignSubjects(documentOf())).toEqual(new Set());
  });

  it("counts a review state of another scheduler as another app's, stamped or not", () => {
    const fsrs = "https://fsrs.example/ns#fsrs";
    const dataset = documentOf(
      subject("card-1")
        .addIri(RDF.type, SM.ReviewState)
        .addInteger(SM.formatVersion, 2)
        .addIri(SM.scheduler, SM.sm2)
        .build(),
      subject("card-2").addIri(RDF.type, SM.ReviewState).build(),
      subject("rs-1").addIri(RDF.type, SM.ReviewState).addIri(SM.scheduler, fsrs).build(),
      subject("rs-2")
        .addIri(RDF.type, SM.ReviewState)
        .addInteger(SM.formatVersion, 2)
        .addIri(SM.scheduler, fsrs)
        .build(),
      // A scheduler named by a literal, even one spelling SM-2's IRI, is not SM-2.
      subject("rs-3")
        .addIri(RDF.type, SM.ReviewState)
        .addStringNoLocale(SM.scheduler, "fsrs")
        .build(),
      subject("rs-4")
        .addIri(RDF.type, SM.ReviewState)
        .addIri(SM.scheduler, SM.sm2)
        .addStringNoLocale(SM.scheduler, SM.sm2)
        .build(),
    );
    expect(foreignSubjects(dataset)).toEqual(
      new Set([`${DOC}#rs-1`, `${DOC}#rs-2`, `${DOC}#rs-3`, `${DOC}#rs-4`]),
    );
  });

  it("counts this app's FSRS-6 state as its own, unless FSRS-6 is named by a literal", () => {
    const dataset = documentOf(
      subject("card-1@fsrs6")
        .addIri(RDF.type, SM.ReviewState)
        .addInteger(SM.formatVersion, 1)
        .addIri(SM.scheduler, SM.fsrs6)
        .build(),
      subject("rs-5")
        .addIri(RDF.type, SM.ReviewState)
        .addInteger(SM.formatVersion, 1)
        .addStringNoLocale(SM.scheduler, SM.fsrs6)
        .build(),
    );
    expect(foreignSubjects(dataset)).toEqual(new Set([`${DOC}#rs-5`]));
  });
});

/** A document as a pod serves it, read as Solid Memo reads it: its Turtle at `url`. */
async function served(url: string, turtle: string): Promise<SolidDataset> {
  const local = createLocalPod({
    root: "https://pod.example/",
    store: createMemoryResourceStore(),
    newEtag: () => '"e1"',
  });
  await local(url, { method: "PUT", headers: { "Content-Type": "text/turtle" }, body: turtle });
  return readDataset(url, local);
}

const CARDS = "https://pod.example/solid-memo/a/decks/deck-1.ttl";
const ENTRY = "https://pod.example/solid-memo/a/catalog.ttl#deck-1";
const SAYS = "https://other.example/says";

describe("subjectsOfClasses", () => {
  it("names Solid Memo's subjects of the classes, and what they name beside them, never another app's", () => {
    const dataset = documentOf(
      subject("deck-1").addIri(RDF.type, SM.Deck).addUrl(DCTERMS.creator, `${DOC}#agent-1`).build(),
      subject("agent-1").addIri(RDF.type, FOAF_AGENT).build(),
      subject("group-1").addIri(RDF.type, SM.DeckGroup).build(),
      subject("rs-1")
        .addIri(RDF.type, SM.Deck)
        .addIri(SM.scheduler, "https://fsrs.example/ns#fsrs")
        .build(),
      subject("recipes").addIri(RDF.type, DCAT.Dataset).build(),
    );
    expect(subjectsOfClasses(SM.Deck)(dataset)).toEqual(
      new Set([`${DOC}#deck-1`, `${DOC}#agent-1`]),
    );
    expect(solidMemoSubjects(dataset)).toEqual(
      new Set([`${DOC}#deck-1`, `${DOC}#agent-1`, `${DOC}#group-1`]),
    );
  });
});

describe("deckDocumentSubjects", () => {
  it("names the cards, distractors and review states, and the saying it is the deck's when it names only decks leaving", async () => {
    const dataset = await served(
      CARDS,
      `<> <${DCTERMS.isPartOf}> <${ENTRY}> .
<#c1> a <${SM.Card}> ; <${SM.distractor}> <#d1> .
<#d1> a <${SM.Distractor}> .
<#c1-sm2> a <${SM.ReviewState}> .
<#recipe> <${SAYS}> "kept" .`,
    );
    const ours = [`${CARDS}#c1`, `${CARDS}#d1`, `${CARDS}#c1-sm2`];
    expect(deckDocumentSubjects([ENTRY])(dataset)).toEqual(new Set([...ours, CARDS]));
    // A document no deck says it is part of: what is Solid Memo's of it.
    const older = await served(CARDS, `<#c1> a <${SM.Card}> .\n<#recipe> <${SAYS}> "kept" .`);
    expect(deckDocumentSubjects([ENTRY])(older)).toEqual(new Set([`${CARDS}#c1`]));
    // The document saying more of itself than whose it is: that subject is kept.
    const titled = await served(
      CARDS,
      `<> <${DCTERMS.isPartOf}> <${ENTRY}> ; <${DCTERMS.title}> "Kept" .\n<#c1> a <${SM.Card}> .`,
    );
    expect(deckDocumentSubjects([ENTRY])(titled)).toEqual(new Set([`${CARDS}#c1`]));
  });

  it("names only the leaving decks' saying it is theirs when it says it is another deck's too, of any instance", async () => {
    const other = "https://pod.example/solid-memo/a/nested/catalog.ttl#deck-2";
    const dataset = await served(
      CARDS,
      `<> <${DCTERMS.isPartOf}> <${ENTRY}>, <${other}> .
<#c1> a <${SM.Card}> .
<#c1-sm2> a <${SM.ReviewState}> .`,
    );
    expect(deckDocumentSubjects([ENTRY])(dataset)).toEqual({
      subjects: new Set(),
      statements: [[CARDS, DCTERMS.isPartOf, ENTRY]],
    });
    // Neither leaving: nothing of it.
    expect(deckDocumentSubjects([`${ENTRY}-gone`])(dataset)).toEqual({
      subjects: new Set(),
      statements: [],
    });
    // Both leaving: all of it.
    expect(deckDocumentSubjects([ENTRY, other])(dataset)).toEqual(
      new Set([`${CARDS}#c1`, `${CARDS}#c1-sm2`, CARDS]),
    );
  });
});

describe("draftSubjects", () => {
  it("names the draft's subjects and every one they lead to, through blank nodes too, never one nothing leads to", async () => {
    const release = "https://pod.example/solid-memo/a/drafts/solid/v1/release.ttl";
    const dataset = await served(
      release,
      `<> a <${SM.Deck}> ; <http://www.w3.org/ns/prov#wasGeneratedBy> [ <http://www.w3.org/ns/prov#used> <#source> ] ; <http://www.w3.org/ns/dcat#inSeries> <#series> ; <http://purl.org/dc/terms/creator> <https://elsewhere.example/#me> .
<#source> <http://purl.org/dc/terms/title> "A source" ; <http://www.w3.org/2000/01/rdf-schema#seeAlso> <#series> .
<#series> <http://purl.org/dc/terms/title> "The series" ; <http://www.w3.org/2000/01/rdf-schema#seeAlso> <https://elsewhere.example/> .
<#recipe> <${SAYS}> [ <${SAYS}> "kept" ] .`,
    );
    expect(draftSubjects(dataset)).toEqual(
      new Set([release, `${release}#source`, `${release}#series`, "https://elsewhere.example/#me"]),
    );
  });
});
