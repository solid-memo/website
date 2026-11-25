// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import {
  buildThing,
  createThing,
  type Dataset,
  createSolidDataset,
  datasetFromQuads,
  getThing,
  getUrlAll,
  setThing,
  type SubjectBuilder,
} from "@solid-memo/solid-client/rdf";
import {
  getSolidDataset,
  parseQuads,
  solidDatasetAsTurtle,
} from "@solid-memo/solid-client/resources";
import { datasetFrom } from "../testing/datasets";
import { answersCsv } from "@solid-memo/domain/answerCsv";
import { cardToRecord } from "@solid-memo/domain/deckRecord";
import { CARD_V7 } from "@solid-memo/vocab/descriptors.generated";
import { MAX_DECK_METADATA } from "@solid-memo/domain/deck";
import { MAX_LISTED_SOURCES } from "@solid-memo/domain/library";
import { growth } from "@solid-memo/domain/testing/growth";
import { longNames, namesOf } from "@solid-memo/domain/testing/longAgents";
import { toAnswer, toAnswerThing } from "./answerMapper";
import {
  toCourseOutline,
  toLibraryCards,
  toLibraryDeckContent,
  toLibraryDecks,
  toLibraryIndexView,
  toStandaloneLibraryDeck,
} from "./libraryMapper";
import { turtleFetch } from "@solid-memo/shacl/testing/turtle";
import { DCTERMS, RDF, SM } from "../vocab";
import { integerLiteral } from "../testing/literals";
import { recordThing } from "../records";

const INDEX = "https://solid-memo.com/decks/index.ttl";
const DOC = "https://solid-memo.com/decks/capitals/v1.ttl";
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const SERIES = "https://solid-memo.com/decks/index.ttl#capitals";
const EDUC = "http://publications.europa.eu/resource/authority/data-theme/EDUC";
const FLAG = "https://flagcdn.com/af.svg";
const LANGUAGE = "http://publications.europa.eu/resource/authority/language/";

function thing(url: string, build: (t: SubjectBuilder) => SubjectBuilder) {
  return build(buildThing(createThing({ url }))).build();
}

const BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/";

/** A Turtle document as the app parses it, published at `url`. */
function datasetOf(turtle: string, url: string) {
  return getSolidDataset(url, { fetch: turtleFetch(turtle) });
}
const WIKIPEDIA = "https://en.wikipedia.org/wiki/List_of_national_capitals";
const WIKIDATA = "https://www.wikidata.org/wiki/Property:P36";

/** A library index, as the build writes it: relative to the index. */
const INDEX_TURTLE = `
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix adms: <http://www.w3.org/ns/adms#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<> a dcat:Catalog ; dcterms:title "Library" ; dcterms:description "Decks." ; dcterms:publisher <#solid-memo> ;
   dcat:dataset <#capitals>, <#broken-series>, <#no-current>, <#missing>, <#undescribed-current> .
<#solid-memo> a foaf:Agent ; foaf:name "Solid Memo" .
<#capitals> a dcat:DatasetSeries, dcat:Dataset ; dcterms:title "Capitals" ; dcterms:description "Capitals." ;
   dcterms:publisher <#solid-memo> ; dcat:first <capitals/v1.ttl> ; dcat:last <capitals/v2.ttl> ;
   dcat:hasVersion <capitals/v2.ttl>, <capitals/v1.ttl>, <capitals/v3.ttl> ; dcat:hasCurrentVersion <capitals/v2.ttl> .
<capitals/v1.ttl> a dcat:Dataset ; dcat:version "1" ; dcterms:issued "2026-09-21T10:00:00Z"^^xsd:dateTime ; adms:versionNotes "First." .
<capitals/v3.ttl> a dcat:Dataset .
<capitals/v2.ttl> a sm:Deck, dcat:Dataset ; sm:formatVersion 3 ; sm:cardCount 243 ;
   dcterms:title "Capitals" ; dcterms:description "Capitals of the world." ;
   dcterms:creator <capitals/v2.ttl#anton>, <capitals/v2.ttl#gone> ; dcterms:license <${CC0}> ;
   dcterms:created "2026-09-22T09:49:00.236Z"^^xsd:dateTime ; dcterms:modified "2026-09-27T20:12:13Z"^^xsd:dateTime ;
   dcterms:issued "2026-09-22T10:00:00Z"^^xsd:dateTime ;
   dcterms:publisher <#solid-memo> ; sm:studyDirection sm:bidirectional ;
   dcat:theme <${EDUC}>, <https://solid-memo.com/ns/vocab/topics.ttl#geography> ; dcat:keyword "capitals" ;
   dcterms:language <${LANGUAGE}SWE>, <${LANGUAGE}ENG> ;
   dcat:version "2" ; adms:versionNotes "Added Norway." ;
   dcat:inSeries <#capitals> ; dcat:isVersionOf <#capitals> ; dcat:distribution <capitals/v2.ttl#turtle> ;
   prov:wasDerivedFrom <${WIKIPEDIA}>, <https://iupac.org/>, <${WIKIDATA}> .
<https://iupac.org/> dcterms:creator "IUPAC" .
<capitals/v2.ttl#anton> a foaf:Agent ; foaf:name "Anton" ; foaf:mbox <mailto:anton@example.com> .
<${WIKIPEDIA}> dcterms:title "List of national capitals" ; dcterms:creator "Wikipedia contributors" ; dcterms:license <${BY_SA}> .
<#broken-series> a dcat:DatasetSeries .
<#no-current> a dcat:DatasetSeries, dcat:Dataset ; dcterms:title "N" ; dcterms:description "N." ;
   dcterms:publisher <#solid-memo> ; dcat:first <n/v1.ttl> ; dcat:last <n/v1.ttl> ;
   dcat:hasVersion <n/v1.ttl> ; dcat:hasCurrentVersion <n/v1.ttl> .
<n/v1.ttl> a dcat:Dataset .
<#undescribed-current> a dcat:DatasetSeries, dcat:Dataset ; dcterms:title "U" ; dcterms:description "U." ;
   dcterms:publisher <#solid-memo> ; dcat:first <u/v1.ttl> ; dcat:last <u/v1.ttl> ;
   dcat:hasVersion <u/v1.ttl> ; dcat:hasCurrentVersion <u/v1.ttl> .
`;

/** Statements that name `count` more sources and authors of `release`, and `count` more authors of `source`. */
function manySources(release: string, source: string, count: number): string {
  const urls = Array.from({ length: count }, (_, n) => `<https://many.example/${n}>`);
  const agents = Array.from({ length: count }, (_, n) => `<https://many.example/agent/${n}>`);
  const authors = Array.from({ length: count }, (_, n) => `"Author ${n}"`);
  return `
<${release}> <http://www.w3.org/ns/prov#wasDerivedFrom> ${urls.join(", ")} .
<${release}> <http://purl.org/dc/terms/creator> ${agents.join(", ")} .
<${source}> <http://purl.org/dc/terms/creator> ${authors.join(", ")} .
`;
}

describe("toLibraryDecks", () => {
  it("lists each series of the catalog by its current release, with every release, oldest first", async () => {
    const index = await datasetFromIndex(INDEX_TURTLE);
    expect(toLibraryDecks(index)).toEqual([
      {
        url: "https://solid-memo.com/decks/capitals/v2.ttl",
        seriesUrl: SERIES,
        version: "2",
        versionNotes: "Added Norway.",
        releases: [
          {
            url: "https://solid-memo.com/decks/capitals/v1.ttl",
            version: "1",
            issued: "2026-09-21T10:00:00.000Z",
            notes: "First.",
          },
          {
            url: "https://solid-memo.com/decks/capitals/v2.ttl",
            version: "2",
            issued: "2026-09-22T10:00:00.000Z",
            notes: "Added Norway.",
          },
          { url: "https://solid-memo.com/decks/capitals/v3.ttl", version: "?" },
        ],
        title: { en: "Capitals" },
        cardCount: 243,
        languages: [`${LANGUAGE}SWE`, `${LANGUAGE}ENG`],
        authors: ["Anton <anton@example.com>", "https://solid-memo.com/decks/capitals/v2.ttl#gone"],
        license: CC0,
        description: { en: "Capitals of the world." },
        direction: "bidirectional",
        createdAt: "2026-09-22T09:49:00.236Z",
        modifiedAt: "2026-09-27T20:12:13.000Z",
        themes: [EDUC, "https://solid-memo.com/ns/vocab/topics.ttl#geography"],
        keywords: { "": ["capitals"] },
        sources: [
          {
            url: WIKIPEDIA,
            title: "List of national capitals",
            authors: ["Wikipedia contributors"],
            license: BY_SA,
          },
          { url: "https://iupac.org/", authors: ["IUPAC"] },
          { url: WIKIDATA, authors: [] },
        ],
      },
    ]);
  });

  it("lists no more sources, nor authors of a source, than a listing keeps, and says how many sources (GHSA-46q4-pmpc-mj5j)", async () => {
    const index = await datasetFromIndex(
      `${INDEX_TURTLE}${manySources("https://solid-memo.com/decks/capitals/v2.ttl", WIKIPEDIA, 2_000)}`,
    );
    const [deck] = toLibraryDecks(index);
    expect(deck!.sources).toHaveLength(MAX_LISTED_SOURCES);
    expect(deck!.sourceCount).toBe(2_003);
    expect(deck!.sources[0]!.authors).toHaveLength(MAX_DECK_METADATA);
    expect(deck!.sources[0]!.authors[0]).toBe("Wikipedia contributors");
    expect(deck!.sources[0]!.authorCount).toBe(2_001);
    expect(deck!.sources[1]).not.toHaveProperty("authorCount");
    // The release's own authors are kept as a release added by link keeps them.
    expect(deck!.authors).toHaveLength(MAX_DECK_METADATA);
    expect(deck!.authorCount).toBe(2_002);
  });

  it("says how many authors a release from before format 3 names, past the first it reads", async () => {
    const authors = Array.from({ length: MAX_DECK_METADATA + 50 }, (_, n) => `"Author ${n}"`);
    const turtle = INDEX_TURTLE.replace("sm:formatVersion 3", "sm:formatVersion 2")
      .replace("sm:studyDirection sm:bidirectional", 'sm:direction "bidirectional"')
      .replace("<capitals/v2.ttl#anton>, <capitals/v2.ttl#gone>", authors.join(", "));
    const [deck] = toLibraryDecks(await datasetFromIndex(turtle));
    expect(deck!.authors).toHaveLength(MAX_DECK_METADATA);
    expect(deck!.authorCount).toBe(MAX_DECK_METADATA + 50);
  });

  it("says no count of authors of a release, or of a source, that names no more than it keeps", async () => {
    const [deck] = toLibraryDecks(await datasetFromIndex(INDEX_TURTLE));
    expect(deck).not.toHaveProperty("authorCount");
    expect(deck!.sources.filter((source) => "authorCount" in source)).toEqual([]);
  });

  it("reads a library deck 5 release's keywords per language, as its series states them", async () => {
    const index = await datasetFromIndex(`
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
<> a dcat:Catalog ; dcterms:title "Library" ; dcterms:description "Decks." ; dcterms:publisher <#solid-memo> ; dcat:dataset <#capitals> .
<#capitals> a dcat:DatasetSeries, dcat:Dataset ; sm:formatVersion 3 ;
   dcterms:title "Capitals"@en ; dcterms:description "Capitals."@en ; dcat:keyword "capitals"@en, "huvudstäder"@sv ;
   dcterms:publisher <#solid-memo> ; dcat:first <capitals/v1.ttl> ; dcat:last <capitals/v1.ttl> ;
   dcat:hasVersion <capitals/v1.ttl> ; dcat:hasCurrentVersion <capitals/v1.ttl> .
<capitals/v1.ttl> a sm:Deck, dcat:Dataset ; sm:formatVersion 5 ;
   dcterms:title "Capitals"@en ; dcterms:description "Capitals of the world."@en ;
   dcat:keyword "capitals"@en, "countries"@en, "huvudstäder"@sv, "länder"@sv, "stray" ;
   dcterms:publisher <#solid-memo> ; sm:studyDirection sm:frontToBack ; dcat:theme <${EDUC}> ;
   dcat:version "1" ; dcat:inSeries <#capitals> ; dcat:isVersionOf <#capitals> ; dcat:distribution <capitals/v1.ttl#turtle> .
`);
    expect(toLibraryDecks(index)).toEqual([
      expect.objectContaining({
        keywords: { en: ["capitals", "countries"], sv: ["huvudstäder", "länder"] },
      }),
    ]);
  });

  it("tells a course by its current release's type, schema:Course", async () => {
    const turtle = (types: string) => `
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix schema: <https://schema.org/> .
<> a dcat:Catalog ; dcterms:title "Library" ; dcterms:description "Decks." ; dcterms:publisher <#solid-memo> ; dcat:dataset <#solid> .
<#solid> a dcat:DatasetSeries, dcat:Dataset ; sm:formatVersion 3 ;
   dcterms:title "Solid"@en ; dcterms:description "Solid."@en ;
   dcterms:publisher <#solid-memo> ; dcat:first <solid/v1.ttl> ; dcat:last <solid/v1.ttl> ;
   dcat:hasVersion <solid/v1.ttl> ; dcat:hasCurrentVersion <solid/v1.ttl> .
<solid/v1.ttl> a ${types} ; sm:formatVersion 5 ;
   dcterms:title "Solid"@en ; dcterms:description "Solid fundamentals."@en ;
   dcterms:publisher <#solid-memo> ; sm:studyDirection sm:frontToBack ; dcat:theme <${EDUC}> ;
   dcat:version "1" ; dcat:inSeries <#solid> ; dcat:isVersionOf <#solid> ; dcat:distribution <solid/v1.ttl#turtle> .
`;
    const [course] = toLibraryDecks(
      await datasetFromIndex(turtle("sm:Deck, dcat:Dataset, schema:Course")),
    );
    expect(course).toMatchObject({ isCourse: true });
    const [deck] = toLibraryDecks(await datasetFromIndex(turtle("sm:Deck, dcat:Dataset")));
    expect(deck).not.toHaveProperty("isCourse");
  });

  it("flags the course the catalog offers to newcomers, if it is listed and is a course", async () => {
    const turtle = (named: string, types: string) => `
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix schema: <https://schema.org/> .
<> a dcat:Catalog ; dcterms:title "Library" ; dcterms:description "Decks." ; dcterms:publisher <#solid-memo> ; dcat:dataset <#solid> ${named} .
<#solid> a dcat:DatasetSeries, dcat:Dataset ; sm:formatVersion 3 ;
   dcterms:title "Solid"@en ; dcterms:description "Solid."@en ;
   dcterms:publisher <#solid-memo> ; dcat:first <solid/v1.ttl> ; dcat:last <solid/v1.ttl> ;
   dcat:hasVersion <solid/v1.ttl> ; dcat:hasCurrentVersion <solid/v1.ttl> .
<solid/v1.ttl> a ${types} ; sm:formatVersion 5 ;
   dcterms:title "Solid"@en ; dcterms:description "Solid fundamentals."@en ;
   dcterms:publisher <#solid-memo> ; sm:studyDirection sm:frontToBack ; dcat:theme <${EDUC}> ;
   dcat:version "1" ; dcat:inSeries <#solid> ; dcat:isVersionOf <#solid> ; dcat:distribution <solid/v1.ttl#turtle> .
`;
    const COURSE = "sm:Deck, dcat:Dataset, schema:Course";
    const decksOf = async (named: string, types: string) =>
      toLibraryDecks(await datasetFromIndex(turtle(named, types)));
    expect(await decksOf("; sm:newcomerCourse <#solid>", COURSE)).toEqual([
      expect.objectContaining({ isCourse: true, forNewcomers: true }),
    ]);
    for (const [named, types] of [
      ["", COURSE],
      ["; sm:newcomerCourse <#nowhere>", COURSE],
      ["; sm:newcomerCourse <#solid>", "sm:Deck, dcat:Dataset"],
    ]) {
      const decks = await decksOf(named, types);
      expect(decks, named).toHaveLength(1);
      expect(decks[0], named).not.toHaveProperty("forNewcomers");
    }
  });

  it("keeps the title and description of a deck of format 4 in every language", async () => {
    const index = await datasetFromIndex(`
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
<> a dcat:Catalog ; dcterms:title "Library" ; dcterms:description "Decks." ; dcterms:publisher <#solid-memo> ; dcat:dataset <#capitals> .
<#capitals> a dcat:DatasetSeries, dcat:Dataset ; sm:formatVersion 2 ;
   dcterms:title "Capitals"@en, "Huvudstäder"@sv ; dcterms:description "Capitals."@en, "Huvudstäder."@sv ;
   dcterms:publisher <#solid-memo> ; dcat:first <capitals/v1.ttl> ; dcat:last <capitals/v1.ttl> ;
   dcat:hasVersion <capitals/v1.ttl> ; dcat:hasCurrentVersion <capitals/v1.ttl> .
<capitals/v1.ttl> a sm:Deck, dcat:Dataset ; sm:formatVersion 4 ;
   dcterms:title "Huvudstäder"@sv, "Capitals"@en ; dcterms:description "Capitals of the world."@en, "Världens huvudstäder."@sv ;
   dcterms:publisher <#solid-memo> ; sm:studyDirection sm:frontToBack ; dcat:theme <${EDUC}> ;
   dcat:version "1" ; dcat:inSeries <#capitals> ; dcat:isVersionOf <#capitals> ; dcat:distribution <capitals/v1.ttl#turtle> .
`);
    expect(toLibraryDecks(index)).toEqual([
      expect.objectContaining({
        title: { en: "Capitals", sv: "Huvudstäder" },
        description: { en: "Capitals of the world.", sv: "Världens huvudstäder." },
      }),
    ]);
  });

  it("names a release the index does not describe by its URL alone, and counts no cards it does not state", async () => {
    const index = await datasetFromIndex(
      INDEX_TURTLE.replace("sm:cardCount 243 ;", "")
        .replace(", <capitals/v1.ttl>, <capitals/v3.ttl>", ", <capitals/v9.ttl>")
        .replace(`dcterms:license <${CC0}> ;`, "")
        .replace(
          'dcterms:created "2026-09-22T09:49:00.236Z"^^xsd:dateTime ; dcterms:modified "2026-09-27T20:12:13Z"^^xsd:dateTime ;',
          "",
        )
        .replace('adms:versionNotes "Added Norway." ;', ""),
    );
    const [deck] = toLibraryDecks(index);
    expect(deck.cardCount).toBe(0);
    expect(deck.releases.map((r) => r.version)).toEqual(["2", "?"]);
    expect(deck).not.toHaveProperty("license");
    expect(deck).not.toHaveProperty("createdAt");
    expect(deck).not.toHaveProperty("versionNotes");
  });

  it("lists a release issued past the years a date holds without when it was issued", async () => {
    const index = await datasetFromIndex(
      INDEX_TURTLE.replace(
        'dcterms:issued "2026-09-21T10:00:00Z"^^xsd:dateTime',
        'dcterms:issued "300000-01-01T00:00:00Z"^^xsd:dateTime',
      ),
    );
    const [deck] = toLibraryDecks(index);
    expect(deck.releases[0]).toEqual({
      url: "https://solid-memo.com/decks/capitals/v1.ttl",
      version: "1",
      notes: "First.",
    });
    expect(deck.releases[1].issued).toBe("2026-09-22T10:00:00.000Z");
  });

  it("lists nothing for a document without a catalog", async () => {
    expect(toLibraryDecks(await datasetFromIndex(`<#x> a <${SM.Card}> .`))).toEqual([]);
  });
});

/** The index as the app reads it, from where it is published. */
describe("toLibraryIndexView", () => {
  it("is the index's address, its catalog's publisher and every release of its decks", async () => {
    expect(toLibraryIndexView(INDEX, await datasetFromIndex(INDEX_TURTLE))).toEqual({
      url: INDEX,
      publisher: `${INDEX}#solid-memo`,
      releases: [
        "https://solid-memo.com/decks/capitals/v1.ttl",
        "https://solid-memo.com/decks/capitals/v2.ttl",
        "https://solid-memo.com/decks/capitals/v3.ttl",
      ],
    });
  });

  it("names no publisher without a catalog, or one without a publisher", async () => {
    expect(toLibraryIndexView(INDEX, await datasetFromIndex(`<#x> a <${SM.Card}> .`))).toEqual({
      url: INDEX,
      publisher: null,
      releases: [],
    });
    expect(
      toLibraryIndexView(
        INDEX,
        await datasetFromIndex(`<> a <http://www.w3.org/ns/dcat#Catalog> .`),
      ).publisher,
    ).toBeNull();
  });
});

function datasetFromIndex(turtle: string) {
  return datasetOf(turtle, INDEX);
}

describe("toLibraryDeckContent", () => {
  function deckDocument(...things: ReturnType<typeof thing>[]): Dataset {
    return things.reduce((dataset, t) => setThing(dataset, t), datasetFrom(DOC) as Dataset);
  }

  it("maps the deck and its well-formed cards, keeping the fragment ids", () => {
    const dataset = deckDocument(
      thing(DOC, (t) =>
        t
          .addIri(RDF.type, SM.Deck)
          .addStringNoLocale(DCTERMS.title, "Capitals")
          .addLiteral(SM.formatVersion, integerLiteral(2))
          .addStringNoLocale(DCTERMS.creator, "Anton Wiklund")
          .addIri(DCTERMS.license, CC0)
          .addStringNoLocale(DCTERMS.description, "From Wikipedia.")
          .addStringNoLocale(SM.direction, "bidirectional"),
      ),
      thing(`${DOC}#sweden`, (t) =>
        t
          .addIri(RDF.type, SM.Card)
          .addStringNoLocale(SM.front, "Sweden")
          .addStringNoLocale(SM.back, "Stockholm")
          .addLiteral(SM.formatVersion, integerLiteral(1)),
      ),
      thing(`${DOC}#afghanistan`, (t) =>
        t
          .addIri(RDF.type, SM.Card)
          .addIri(SM.frontImage, FLAG)
          .addStringNoLocale(SM.back, "Afghanistan")
          .addLiteral(SM.formatVersion, integerLiteral(2)),
      ),
      thing(`${DOC}#note`, (t) => t.addStringNoLocale(SM.front, "x")),
      thing(`${DOC}#half`, (t) =>
        t.addIri(RDF.type, SM.Card).addStringNoLocale(SM.front, "Norway"),
      ),
      thing(`${DOC}#half-2`, (t) =>
        t
          .addIri(RDF.type, SM.Card)
          .addStringNoLocale(SM.front, "Norway")
          .addLiteral(SM.formatVersion, integerLiteral(2)),
      ),
      thing(`${DOC}#literal`, (t) =>
        t
          .addIri(RDF.type, SM.Card)
          .addStringNoLocale(SM.frontImage, FLAG)
          .addStringNoLocale(SM.back, "Afghanistan"),
      ),
    );
    expect(toLibraryDeckContent(DOC, dataset)).toEqual({
      url: DOC,
      title: { en: "Capitals" },
      formatVersion: 2,
      authors: ["Anton Wiklund"],
      license: CC0,
      description: { en: "From Wikipedia." },
      direction: "bidirectional",
      version: "1",
      seriesUrl: SERIES,
      themes: [EDUC],
      keywords: {},
      cards: [
        { id: "sweden", front: { "": "Sweden" }, back: { "": "Stockholm" }, formatVersion: 1 },
        {
          id: "afghanistan",
          front: {},
          back: { "": "Afghanistan" },
          frontImageUrl: FLAG,
          formatVersion: 2,
        },
      ],
    });
  });

  it("reads no subject, picture or license shaped like a prefixed name, so a whole write of the copy keeps none (GHSA-6555-2gvc-c7f4)", async () => {
    const release = "https://other.example/rel/v1.ttl";
    const turtle = `
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
<> a sm:Deck ; sm:formatVersion 2 ; dcterms:title "Odd" ; dcterms:creator "x" ;
   dcterms:license <current:catalog> ; dcterms:description "d" ; sm:direction "bidirectional" .
<#c1> a sm:Card ; sm:formatVersion 7 ; sm:front "a"@en ; sm:back "b"@en ;
   sm:frontImage <current:c2> ; sm:backImage <${FLAG}> ;
   dcterms:subject <rdf:type> , <sm:Deck> , <${WIKIDATA}> .
`;
    const content = toLibraryDeckContent(release, await datasetOf(turtle, release));
    expect(content).not.toHaveProperty("license");
    const card = content.cards[0]!;
    expect(card).not.toHaveProperty("frontImageUrl");
    expect(card).toMatchObject({ backImageUrl: FLAG, subjects: [WIKIDATA] });
    // Written whole, as a library upgrade writes the cards document, and read back.
    const cards = "https://pod.example/solid-memo/main/decks/deck-1.ttl";
    const written = recordThing(
      `${cards}#c1`,
      CARD_V7,
      cardToRecord(card, "2026-01-01T00:00:00.000Z", cards),
      null,
    );
    const text = await solidDatasetAsTurtle(setThing(createSolidDataset(), written));
    const back = getThing(await datasetOf(text, cards), `${cards}#c1`)!;
    expect(getUrlAll(back, DCTERMS.subject)).toEqual([WIKIDATA]);
    expect(getUrlAll(back, SM.frontImage)).toEqual([]);
    expect(getUrlAll(back, SM.backImage)).toEqual([FLAG]);
  });

  it("treats a deck and cards without a version as the first format", () => {
    const dataset = deckDocument(
      thing(DOC, (t) => t.addIri(RDF.type, SM.Deck).addStringNoLocale(DCTERMS.title, "Capitals")),
      thing(`${DOC}#se`, (t) =>
        t
          .addIri(RDF.type, SM.Card)
          .addStringNoLocale(SM.front, "Sweden")
          .addStringNoLocale(SM.back, "Stockholm"),
      ),
    );
    const content = toLibraryDeckContent(DOC, dataset);
    expect(content).toEqual({
      url: DOC,
      title: { en: "Capitals" },
      formatVersion: 1,
      authors: [],
      description: { en: "Flashcards: Capitals.", sv: "Kortlek: Capitals." },
      direction: "front-to-back",
      version: "1",
      seriesUrl: SERIES,
      themes: [EDUC],
      keywords: {},
      cards: [{ id: "se", front: { "": "Sweden" }, back: { "": "Stockholm" }, formatVersion: 1 }],
    });
  });

  it("reads a library deck 6 release that describes its series and publisher itself, as a format-5 one", async () => {
    const url = "https://alice.example/solid-memo/main/releases/capitals/v2.ttl";
    const turtle = await readFile(
      `${VOCAB_ROOT}fixtures/library-deck/v6/valid/library-standalone-release.ttl`,
      "utf8",
    );
    const content = toLibraryDeckContent(url, await datasetOf(turtle, url));
    expect(content).toMatchObject({
      url,
      formatVersion: 6,
      title: { en: "Capitals", sv: "Huvudstäder" },
      authors: ["Alice"],
      version: "2",
      seriesUrl: "https://alice.example/solid-memo/main/releases/capitals/v1.ttl#series",
      keywords: { en: ["capitals"], sv: ["huvudstäder"] },
    });
    expect(content.cards.map((card) => card.id)).toEqual(["se", "no"]);
    expect(content).not.toHaveProperty("contact");
  });

  it("reads only the cards and distractors of the release's own document: where it was read, or its canonical URL", async () => {
    const turtle = (base: string) => `
@base <${base}> .
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
${base === DOC ? "" : '<https://elsewhere.example/other.ttl> a sm:Deck ; dcterms:title "Other"@en .'}
<> a sm:Deck ; dcterms:title "Capitals" .
<#se> a sm:Card ; sm:formatVersion 7 ; sm:front "Sweden"@en ; sm:back "Stockholm"@en ;
   sm:distractor <#se-a>, <https://elsewhere.example/x#se-b> .
<#se-a> a sm:Distractor ; sm:distractorText "Oslo"@en .
<https://elsewhere.example/x#se-b> a sm:Distractor ; sm:distractorText "Not its own"@en .
<https://elsewhere.example/x#se> a sm:Card ; sm:formatVersion 7 ; sm:front "Sweden"@en ; sm:back "Not its own"@en .
<https://elsewhere.example/other.ttl#no> a sm:Card ; sm:formatVersion 7 ; sm:front "Norway"@en ; sm:back "Oslo"@en .
`;
    const fetched = "https://localhost.example/decks/capitals/v1.ttl";
    for (const base of [DOC, fetched]) {
      const content = toLibraryDeckContent(fetched, await datasetOf(turtle(base), fetched));
      expect(content.title).toEqual({ en: "Capitals" });
      expect(content.cards).toMatchObject([
        { id: "se", back: { en: "Stockholm" }, distractors: [{ id: "se-a" }] },
      ]);
    }
  });

  it("reads the web page a release's contact names, and none from a contact with only an email", async () => {
    const url = "https://alice.example/solid-memo/main/releases/capitals/v2.ttl";
    const turtle = await readFile(
      `${VOCAB_ROOT}fixtures/library-deck/v6/valid/library-standalone-release.ttl`,
      "utf8",
    );
    const VCARD = "http://www.w3.org/2006/vcard/ns#";
    const withContact = (point: string) =>
      datasetOf(
        `${turtle}\n<> dcat:contactPoint <#contact> .\n<#contact> a <${VCARD}Kind> ; ${point} .\n`,
        url,
      );
    const page = "https://alice.example/issues";
    expect(toLibraryDeckContent(url, await withContact(`<${VCARD}hasURL> <${page}>`)).contact).toBe(
      page,
    );
    expect(
      toLibraryDeckContent(url, await withContact(`<${VCARD}hasEmail> <mailto:a@example.org>`)),
    ).not.toHaveProperty("contact");
  });

  it("reads a contact from its one point, named or blank, with one web page, and none from more (GHSA-g8xv-c484-62vx)", async () => {
    const url = "https://alice.example/solid-memo/main/releases/capitals/v2.ttl";
    const turtle = await readFile(
      `${VOCAB_ROOT}fixtures/library-deck/v6/valid/library-standalone-release.ttl`,
      "utf8",
    );
    const VCARD = "http://www.w3.org/2006/vcard/ns#";
    const contactOf = async (statements: string) =>
      toLibraryDeckContent(url, await datasetOf(`${turtle}\n${statements}\n`, url)).contact;
    const good = "https://good.example/issues";
    const other = "https://other.example/report";
    expect(await contactOf(`<> dcat:contactPoint [ <${VCARD}hasURL> <${good}> ] .`)).toBe(good);
    expect(
      await contactOf(
        `<> dcat:contactPoint [ <${VCARD}hasURL> <${good}> ] , <#contact> .\n<#contact> <${VCARD}hasURL> <${other}> .`,
      ),
    ).toBeUndefined();
    expect(
      await contactOf(
        `<> dcat:contactPoint <#contact> .\n<#contact> <${VCARD}hasURL> <${good}> , <${other}> .`,
      ),
    ).toBeUndefined();
    expect(
      await contactOf(`<> dcat:contactPoint "${good}" .\n<${good}> <${VCARD}hasURL> <${good}> .`),
    ).toBeUndefined();
  });

  it("refuses a release at the guest's pod, or that links to it by an address in it (GHSA-hc3p-fpwj-fvjp)", async () => {
    const url = "https://alice.example/solid-memo/main/releases/capitals/v2.ttl";
    const turtle = await readFile(
      `${VOCAB_ROOT}fixtures/library-deck/v6/valid/library-standalone-release.ttl`,
      "utf8",
    );
    const guest = "https://guest.solid-memo.invalid/";
    const card = `\n<#gx> a solid-memo:Card ; solid-memo:formatVersion 7 ; solid-memo:front "Q"@en ; solid-memo:back "A"@en ;`;
    // Text the reader reads may name any address.
    expect(
      toLibraryDeckContent(
        url,
        await datasetOf(`${turtle}${card} solid-memo:frontNote "See ${guest}"@en .\n`, url),
      ).cards,
    ).toHaveLength(3);
    const notes = `adms:versionNotes "Pictures moved from ${guest}p.png." ;`;
    const noted = turtle.replace('adms:versionNotes "Added Norway." ;', notes);
    expect(noted).not.toBe(turtle);
    expect(toLibraryDeckContent(url, await datasetOf(noted, url)).versionNotes).toBe(
      `Pictures moved from ${guest}p.png.`,
    );
    const refused = `This release links to the guest's study in this browser, which no release may, so Solid Memo does not read it. Ask its creator to check it.\nurl: ${url}`;
    const license = "dcterms:license <https://creativecommons.org/publicdomain/zero/1.0/>";
    for (const linking of [
      `${turtle}${card} solid-memo:frontImage <${guest}p.png> .`,
      `${turtle}${card} solid-memo:backImage <HTTPS://GUEST.solid-memo.invalid:443/p.png> .`,
      `${turtle}${card} dcterms:subject <${guest}a> .`,
      turtle.replace(license, `dcterms:license <${guest}license>`),
      `${turtle}\n<> dcat:theme <${guest}theme> .`,
      `${noted}${card} solid-memo:frontImage <${guest}p.png> .`,
    ]) {
      expect(linking).toMatch(/guest\.solid-memo\.invalid/i);
      const dataset = await datasetOf(`${linking}\n`, url);
      expect(() => toLibraryDeckContent(url, dataset), linking.slice(-80)).toThrow(refused);
    }
    // Read at the guest's pod, or stating it is there (@base).
    const atGuest = turtle.replaceAll("https://alice.example/solid-memo/main/", guest);
    const there = `${guest}releases/capitals/v2.ttl`;
    expect(() => toLibraryDeckContent(there, datasetFrom(there) as Dataset)).toThrow(
      "That is not a Solid Memo deck",
    );
    for (const read of [there, url]) {
      const dataset = await datasetOf(atGuest, read);
      expect(() => toLibraryDeckContent(read, dataset), read).toThrow("which no release may");
    }
    const elsewhere = await datasetOf(turtle, there);
    expect(() => toLibraryDeckContent(there, elsewhere)).toThrow("which no release may");
  });

  it("refuses a deck in a newer format than it writes", () => {
    const dataset = deckDocument(
      thing(DOC, (t) =>
        t.addIri(RDF.type, SM.Deck).addLiteral(SM.formatVersion, integerLiteral(7)),
      ),
    );
    expect(() => toLibraryDeckContent(DOC, dataset)).toThrow(
      `This deck is in a newer format than this version of Solid Memo can read. Use a newer version of Solid Memo instead.\nurl: ${DOC}\nversion: 7\nlatest: 6`,
    );
  });

  describe("a release from before format 3 whose agents' URLs are longer than any term", () => {
    /** The release at `url`, naming `authors` itself. */
    function oldRelease(url: string, authors: readonly string[]): Dataset {
      let release = buildThing(createThing({ url }))
        .addIri(RDF.type, SM.Deck)
        .addStringNoLocale(DCTERMS.title, "Capitals")
        .addStringNoLocale(DCTERMS.description, "Capitals.")
        .addStringNoLocale(SM.direction, "bidirectional")
        .addLiteral(SM.formatVersion, integerLiteral(2));
      for (const author of authors) release = release.addStringNoLocale(DCTERMS.creator, author);
      return setThing(datasetFrom(url), release.build());
    }
    const LONG_RELEASE = `https://solid-memo.com/${"p".repeat(16_340)}`;
    const VARIANTS = [
      { variant: "a long address", url: LONG_RELEASE, authors: (n: number) => namesOf(n, 24) },
      { variant: "long names", url: DOC, authors: longNames },
    ];

    it.each(VARIANTS)("names its authors with $variant", ({ url, authors }) => {
      const named = authors(3);
      expect(toLibraryDeckContent(url, oldRelease(url, named)).authors).toEqual(named);
    });

    it.each(VARIANTS)(
      "takes time that grows with $variant, not their square (GHSA-4mgg-5xpp-3jx5)",
      {
        timeout: 180_000,
      },
      ({ url, authors }) => {
        const ratio = growth(
          (count) => {
            const dataset = oldRelease(url, authors(count));
            // A document is read once, so each run maps a copy of it not read yet.
            return () => toLibraryDeckContent(url, Object.freeze({ ...dataset }));
          },
          240,
          8,
          4,
        );
        expect(ratio).toBeLessThan(4);
      },
    );
  });

  it("names a release's creators from the agents in its document, or by IRI when there is none", () => {
    const RELEASE = "https://solid-memo.com/decks/capitals/v2.ttl";
    const dataset = deckDocument(
      thing(RELEASE, (t) =>
        t
          .addIri(RDF.type, SM.Deck)
          .addStringNoLocale(DCTERMS.title, "Capitals")
          .addStringNoLocale(DCTERMS.description, "Capitals.")
          .addIri(DCTERMS.creator, `${RELEASE}#anton`)
          .addIri(DCTERMS.creator, `${RELEASE}#gone`)
          .addIri(
            "http://purl.org/dc/terms/publisher",
            "https://solid-memo.com/decks/index.ttl#solid-memo",
          )
          .addIri(SM.studyDirection, SM.bidirectional)
          .addIri("http://www.w3.org/ns/dcat#theme", EDUC)
          .addStringNoLocale("http://www.w3.org/ns/dcat#version", "2")
          .addStringNoLocale("http://www.w3.org/ns/adms#versionNotes", "Added Norway.")
          .addIri("http://www.w3.org/ns/dcat#inSeries", SERIES)
          .addIri("http://www.w3.org/ns/dcat#isVersionOf", SERIES)
          .addIri("http://www.w3.org/ns/dcat#distribution", `${RELEASE}#turtle`)
          .addLiteral(SM.formatVersion, integerLiteral(3)),
      ),
      thing(`${RELEASE}#anton`, (t) =>
        t
          .addIri(RDF.type, "http://xmlns.com/foaf/0.1/Agent")
          .addStringNoLocale("http://xmlns.com/foaf/0.1/name", "Anton Wiklund"),
      ),
    );
    expect(toLibraryDeckContent(RELEASE, dataset)).toMatchObject({
      url: RELEASE,
      formatVersion: 3,
      authors: ["Anton Wiklund", `${RELEASE}#gone`],
      direction: "bidirectional",
      version: "2",
      versionNotes: "Added Norway.",
      seriesUrl: SERIES,
    });
  });

  it("reads what a release's card is about, though its format, 4, does not name it", () => {
    const dataset = deckDocument(
      thing(DOC, (t) => t.addIri(RDF.type, SM.Deck).addStringNoLocale(DCTERMS.title, "Capitals")),
      thing(`${DOC}#se`, (t) =>
        t
          .addIri(RDF.type, SM.Card)
          .addUrl(DCTERMS.subject, "http://www.wikidata.org/entity/Q34")
          .addStringWithLocale(SM.front, "Sweden", "en")
          .addStringWithLocale(SM.back, "Stockholm", "en")
          .addLiteral(SM.formatVersion, integerLiteral(4)),
      ),
    );
    expect(toLibraryDeckContent(DOC, dataset).cards).toEqual([
      {
        id: "se",
        front: { en: "Sweden" },
        back: { en: "Stockholm" },
        subjects: ["http://www.wikidata.org/entity/Q34"],
        formatVersion: 4,
      },
    ]);
  });

  it("refuses a card in a newer format than it writes", () => {
    const dataset = deckDocument(
      thing(DOC, (t) => t.addIri(RDF.type, SM.Deck).addStringNoLocale(DCTERMS.title, "Capitals")),
      thing(`${DOC}#se`, (t) =>
        t
          .addIri(RDF.type, SM.Card)
          .addStringNoLocale(SM.front, "Sweden")
          .addStringNoLocale(SM.back, "Stockholm")
          .addLiteral(SM.formatVersion, integerLiteral(8)),
      ),
    );
    expect(() => toLibraryDeckContent(DOC, dataset)).toThrow(
      `A card in this deck is in a newer format than this version of Solid Memo can read. Use a newer version of Solid Memo instead.\ncard: ${DOC}#se\nurl: ${DOC}\nversion: 8\nlatest: 7`,
    );
  });

  it("rejects a document without a deck, or with a deck that does not fit its shape", () => {
    expect(() => toLibraryDeckContent(DOC, deckDocument())).toThrow(
      `That is not a Solid Memo deck, so it cannot be added. Choose another deck.\nurl: ${DOC}`,
    );
    expect(() =>
      toLibraryDeckContent(DOC, deckDocument(thing(DOC, (t) => t.addIri(RDF.type, SM.Deck)))),
    ).toThrow(
      `That is not a Solid Memo deck, so it cannot be added. Choose another deck.\nurl: ${DOC}`,
    );
  });

  it("refuses a release that gives two of its cards and distractors one id", async () => {
    // `before` comes first in the text, so that a subject both a card and a distractor reads as a card.
    const release = (cards: string, before = "") =>
      datasetOf(
        `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
         @prefix dcterms: <http://purl.org/dc/terms/> .
         <> a sm:Deck ; dcterms:title "Capitals" .
         ${before}
         <#x> a sm:Card ; sm:formatVersion 7 ; sm:front "France"@en ; sm:back "Paris"@en ;
           sm:distractor <#dx> .
         <#dx> a sm:Distractor ; sm:formatVersion 1 ; sm:distractorText "Lyon"@en .
         ${cards}`,
        DOC,
      );
    const refused = (id: string) =>
      `This deck gives two of its cards or wrong options the same id, so Solid Memo cannot read it. Ask its creator to check it.\nurl: ${DOC}\nid: ${id}`;
    const card = (url: string, extra = "") =>
      `<${url}> a sm:Card ; sm:formatVersion 7 ; sm:front "Spain"@en ; sm:back "Madrid"@en ${extra}.`;
    // A card at a distractor's id, and one distractor named by two cards.
    for (const [cards, id, before] of [
      ["", "dx", card("#dx")],
      [card("#y", "; sm:distractor <#dx> "), "dx", ""],
    ] as const) {
      const dataset = await release(cards, before);
      expect(() => toLibraryDeckContent(DOC, dataset)).toThrow(refused(id));
    }
    expect(toLibraryDeckContent(DOC, await release(card("#y"))).cards.map((c) => c.id)).toEqual([
      "x",
      "y",
    ]);
  });

  /** A release of `count` cards that all name one distractor, written in `languages` languages. */
  function sharedDistractor(count: number, languages: number): Dataset {
    const distractor = Array.from({ length: languages }, (_, i) => i).reduce(
      (t, i) => t.addStringWithLocale(SM.distractorText, `wrong ${i}`, `en-x-l${i}`),
      buildThing(createThing({ url: `${DOC}#shared` }))
        .addIri(RDF.type, SM.Distractor)
        .addLiteral(SM.formatVersion, integerLiteral(1)),
    );
    const cards = Array.from({ length: count }, (_, i) =>
      thing(`${DOC}#card-${i}`, (t) =>
        t
          .addIri(RDF.type, SM.Card)
          .addLiteral(SM.formatVersion, integerLiteral(7))
          .addStringWithLocale(SM.front, `f${i}`, "en")
          .addStringWithLocale(SM.back, `b${i}`, "en")
          .addIri(SM.distractor, `${DOC}#shared`),
      ),
    );
    return deckDocument(
      thing(DOC, (t) => t.addIri(RDF.type, SM.Deck).addStringNoLocale(DCTERMS.title, "Capitals")),
      distractor.build(),
      ...cards,
    );
  }

  it("gives the cards of a release that name one distractor one object of it", () => {
    const [first, ...rest] = toLibraryCards(DOC, sharedDistractor(3, 2)).map(
      (card) => card.distractors![0],
    );
    expect(first!.text).toEqual({ "en-x-l0": "wrong 0", "en-x-l1": "wrong 1" });
    expect(rest).toHaveLength(2);
    for (const distractor of rest) expect(distractor).toBe(first);
  });

  // Cards naming one distractor of many languages, read many times over: what
  // is held to is the ratio, of CPU time; the clock only stops a test that never ends.
  it("refuses a release whose cards name one distractor, read once however many name it (GHSA-f72p-j39c-w728)", {
    timeout: 180_000,
  }, () => {
    expect(() => toLibraryDeckContent(DOC, sharedDistractor(2, 1))).toThrow(
      expect.objectContaining({ code: "libraryIdsRepeat" }),
    );
    const ratio = growth(
      (count) => {
        const dataset = sharedDistractor(count, count);
        // A document is read once, so each run reads a copy of it not read yet.
        // Refused (libraryIdsRepeat) once its cards are read.
        return () =>
          expect(() => toLibraryDeckContent(DOC, Object.freeze({ ...dataset }))).toThrow();
      },
      100,
      8,
      4,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("toCourseOutline", () => {
  it("reads a release's chapters and steps that fit their shapes, leaving out retired ones and other subjects", async () => {
    const dataset = await datasetOf(
      `
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix schema: <https://schema.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
<#ch-1> a sm:Chapter, schema:Syllabus ; sm:formatVersion 1 ; schema:isPartOf <> ; schema:position 0 ;
   dcterms:title "Linked data"@en, "Länkade data"@sv ; dcterms:description "IRIs."@en ; sm:reviewQuestion <#q-2> .
<#ch-old> a sm:Chapter ; schema:isPartOf <> ; schema:position 1 ; dcterms:title "Old"@en ; owl:deprecated true .
<#ch-broken> a sm:Chapter ; schema:position 2 .
<#ch-1-2> a sm:Step, schema:LearningResource ; schema:isPartOf <#ch-1> ; schema:position 1 ;
   sm:theory "Second."@en ; sm:checkedBy <#q-3> .
<#ch-1-1> a sm:Step ; schema:isPartOf <#ch-1> ; schema:position 0 ; sm:theory "First."@en ; sm:checkedBy <#q-1>, <#q-2> .
<#ch-1-broken> a sm:Step ; schema:isPartOf <#ch-1> ; schema:position 2 ; sm:checkedBy <#q-1> .
<#q-1> a sm:Card ; sm:formatVersion 7 ; sm:front "Q"@en ; sm:back "A"@en .
<#q-2> a sm:Card ; sm:formatVersion 7 ; sm:front "Q2"@en ; sm:back "A2"@en .
<#q-3> a sm:Card ; sm:formatVersion 7 ; sm:front "Q3"@en ; sm:back "A3"@en .
`,
      DOC,
    );
    const outline = toCourseOutline(DOC, dataset);
    // Frozen through: the course decks that name the release share it (domain/course.ts outlineIndexOf).
    const step = outline.chapters[0]!.steps[0]!;
    const chapter = outline.chapters[0]!;
    for (const part of [outline, outline.chapters, chapter, chapter.steps, step, step.questionIds])
      expect(Object.isFrozen(part)).toBe(true);
    expect(Object.isFrozen(chapter.reviewQuestionIds)).toBe(true);
    expect(outline).toEqual({
      releaseUrl: DOC,
      chapters: [
        {
          id: "ch-1",
          url: `${DOC}#ch-1`,
          position: 0,
          title: { en: "Linked data", sv: "Länkade data" },
          description: { en: "IRIs." },
          steps: [
            {
              id: "ch-1-1",
              url: `${DOC}#ch-1-1`,
              position: 0,
              theory: { en: "First." },
              questionIds: ["q-1", "q-2"],
            },
            {
              id: "ch-1-2",
              url: `${DOC}#ch-1-2`,
              position: 1,
              theory: { en: "Second." },
              questionIds: ["q-3"],
            },
          ],
          reviewQuestionIds: ["q-2"],
        },
      ],
    });
  });
  it("reads only the chapters and steps of the release's own document", async () => {
    const dataset = await datasetOf(
      `
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix schema: <https://schema.org/> .
<> a sm:Deck .
<#ch-1> a sm:Chapter ; schema:isPartOf <> ; schema:position 0 ; dcterms:title "Own"@en .
<#ch-1-1> a sm:Step ; schema:isPartOf <#ch-1> ; schema:position 0 ; sm:theory "Own."@en ; sm:checkedBy <#q-1> .
<https://elsewhere.example/x#ch-1-2> a sm:Step ; schema:isPartOf <#ch-1> ; schema:position 1 ;
   sm:theory "Not its own."@en ; sm:checkedBy <#q-1> .
<https://elsewhere.example/x#ch-2> a sm:Chapter ; schema:isPartOf <> ; schema:position 1 ; dcterms:title "Not its own"@en .
<https://elsewhere.example/x#ch-2-1> a sm:Step ; schema:isPartOf <https://elsewhere.example/x#ch-2> ;
   schema:position 0 ; sm:theory "Not its own."@en ; sm:checkedBy <#q-1> .
<#q-1> a sm:Card ; sm:formatVersion 7 ; sm:front "Q"@en ; sm:back "A"@en .
`,
      DOC,
    );
    expect(toCourseOutline(DOC, dataset).chapters).toMatchObject([
      { id: "ch-1", steps: [{ id: "ch-1-1", theory: { en: "Own." } }] },
    ]);
    expect(toCourseOutline(DOC, dataset).chapters[0]!.steps).toHaveLength(1);
  });

  it("reads how a chapter's description and a step's theory are written", async () => {
    const dataset = await datasetOf(
      `
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix schema: <https://schema.org/> .
<#ch-1> a sm:Chapter, schema:Syllabus ; schema:isPartOf <> ; schema:position 0 ; sm:textFormat sm:markdown ;
   dcterms:title "Linked data"@en ; dcterms:description "**IRIs**."@en .
<#ch-1-1> a sm:Step ; schema:isPartOf <#ch-1> ; schema:position 0 ; sm:textFormat sm:markdown ;
   sm:theory """A list:

- one
- two"""@en ; sm:checkedBy <#q-1> .
<#q-1> a sm:Card ; sm:formatVersion 7 ; sm:front "Q"@en ; sm:back "A"@en .
`,
      DOC,
    );
    expect(toCourseOutline(DOC, dataset).chapters).toMatchObject([
      {
        id: "ch-1",
        textFormat: SM.markdown,
        steps: [
          { id: "ch-1-1", textFormat: SM.markdown, theory: { en: "A list:\n\n- one\n- two" } },
        ],
      },
    ]);
  });
  it("asks only the release's cards that fit their shape, leaving out a step left with none", async () => {
    const dataset = await datasetOf(
      `
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix schema: <https://schema.org/> .
<#ch-1> a sm:Chapter ; schema:isPartOf <> ; schema:position 0 ; dcterms:title "Linked data"@en ;
   sm:reviewQuestion <#constructor>, <#q-1>, <#q-broken> .
<#ch-1-1> a sm:Step ; schema:isPartOf <#ch-1> ; schema:position 0 ; sm:theory "First."@en ;
   sm:checkedBy <#q-1>, <#q-missing>, <#__proto__> .
<#ch-1-2> a sm:Step ; schema:isPartOf <#ch-1> ; schema:position 1 ; sm:theory "Second."@en ;
   sm:checkedBy <#constructor> .
<#q-1> a sm:Card ; sm:formatVersion 7 ; sm:front "Q"@en ; sm:back "A"@en .
<#q-broken> a sm:Card ; sm:formatVersion 7 ; sm:back "A"@en .
`,
      DOC,
    );
    expect(toCourseOutline(DOC, dataset).chapters).toMatchObject([
      { id: "ch-1", steps: [{ id: "ch-1-1", questionIds: ["q-1"] }], reviewQuestionIds: ["q-1"] },
    ]);
    expect(toCourseOutline(DOC, dataset).chapters[0]!.steps).toHaveLength(1);
  });
});

describe("a release's card id in the answers CSV", () => {
  it.each([
    [";", "%3B"],
    ["\u061b", "%D8%9B"],
  ])("starts no cell of a reading separated by %s as a formula", async (separator, encoded) => {
    const formula = "=HYPERLINK(CHAR(104)&CHAR(116)&A2)";
    const turtle = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
<#c${separator}${formula}${separator}> a sm:Card ;
  sm:formatVersion 7 ; sm:front "f"@en ; sm:back "b"@en ;
  <http://purl.org/dc/terms/created> "2026-01-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .`;
    const [card] = toLibraryCards(DOC, datasetFromQuads(await parseQuads(turtle, "turtle", DOC)));
    expect(card!.id).toBe(`c${separator}${formula}${separator}`);
    const answer = toAnswer(
      toAnswerThing("https://pod.example/i/history/2026-01.ttl", {
        id: "a1",
        deckUrl: "https://pod.example/i/catalog.ttl#deck",
        cardUrl: `https://pod.example/i/cards.ttl#${card!.id}`,
        direction: "front-to-back",
        grade: 3,
        answeredAt: "2026-01-01T00:00:00.000Z",
        studyDay: "2026-01-01",
        nextIntervalDays: 1,
      }),
    );
    const row = answersCsv([answer!]).split("\r\n")[1]!;
    expect(row).toContain(`#c${encoded}${formula}${encoded},`);
    expect(row).not.toContain(separator);
  });
});

describe("toStandaloneLibraryDeck", () => {
  const url = "https://alice.example/solid-memo/main/releases/capitals/v2.ttl";
  const fixture = () =>
    readFile(`${VOCAB_ROOT}fixtures/library-deck/v6/valid/library-standalone-release.ttl`, "utf8");

  it("lists every source and author of a release within the bound, and says no count", async () => {
    const deck = toStandaloneLibraryDeck(url, await datasetOf(await fixture(), url));
    expect(deck).not.toHaveProperty("sourceCount");
    expect(deck).not.toHaveProperty("authorCount");
  });

  it("lists no more sources, nor authors of a source, than a listing keeps, and says how many sources (GHSA-46q4-pmpc-mj5j)", async () => {
    const source = "https://many.example/0";
    const turtle = `${await fixture()}${manySources(url, source, 5_000)}`;
    const deck = toStandaloneLibraryDeck(url, await datasetOf(turtle, url));
    const before = toStandaloneLibraryDeck(url, await datasetOf(await fixture(), url)).sources;
    expect(deck.sources).toHaveLength(MAX_LISTED_SOURCES);
    expect(deck.sourceCount).toBe(before.length + 5_000);
    const first = deck.sources.find((one) => one.url === source)!;
    expect(first.authors).toEqual(
      Array.from({ length: MAX_DECK_METADATA }, (_, n) => `Author ${n}`),
    );
    expect(first.authorCount).toBe(5_000);
    expect(deck.authors).toHaveLength(MAX_DECK_METADATA);
    expect(deck.authorCount).toBe(5_001);
  });

  it("says how many authors a release from before format 3 names, past the first it reads", async () => {
    const authors = Array.from({ length: MAX_DECK_METADATA + 50 }, (_, n) => `"Author ${n}"`);
    const turtle = `<> a <${SM.Deck}> ; <${SM.formatVersion}> 2 ; <${DCTERMS.title}> "Capitals" ;
      <${SM.direction}> "front-to-back" ; <${DCTERMS.creator}> ${authors.join(", ")} .`;
    const deck = toStandaloneLibraryDeck(url, await datasetOf(turtle, url));
    expect(deck.authors).toEqual(
      Array.from({ length: MAX_DECK_METADATA }, (_, n) => `Author ${n}`),
    );
    expect(deck.authorCount).toBe(MAX_DECK_METADATA + 50);
  });
});
