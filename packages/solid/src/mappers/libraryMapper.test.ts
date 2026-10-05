import { describe, expect, it } from "vitest";
import {
  buildThing,
  createThing,
  mockSolidDatasetFrom,
  setThing,
  type SolidDataset,
  type ThingBuilder,
  type ThingPersisted,
} from "@inrupt/solid-client";
import { toLibraryDeckContent, toLibraryDecks } from "./libraryMapper";
import { getSolidDataset } from "@inrupt/solid-client";
import { turtleFetch } from "@solid-memo/shacl/testing/turtle";
import { DCTERMS, RDF, SM } from "../vocab";

const INDEX = "https://solid-memo.com/decks/index.ttl";
const DOC = "https://solid-memo.com/decks/capitals.ttl";
const CANONICAL = "https://solid-memo.com/decks/capitals";
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const SERIES = "https://solid-memo.com/decks/index.ttl#capitals";
const EDUC = "http://publications.europa.eu/resource/authority/data-theme/EDUC";
const FLAG = "https://flagcdn.com/af.svg";

function thing(
  url: string,
  build: (t: ThingBuilder<ThingPersisted>) => ThingBuilder<ThingPersisted>,
) {
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
@prefix sm: <https://pod.solid-memo.com/vocab/v1#> .
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
   dcterms:publisher <#solid-memo> ; dcat:first <capitals/1.ttl> ; dcat:last <capitals/2.ttl> ;
   dcat:hasVersion <capitals/2.ttl>, <capitals/1.ttl>, <capitals/3.ttl> ; dcat:hasCurrentVersion <capitals/2.ttl> .
<capitals/1.ttl> a dcat:Dataset ; dcat:version "1" ; dcterms:issued "2026-09-21T10:00:00Z"^^xsd:dateTime ; adms:versionNotes "First." .
<capitals/3.ttl> a dcat:Dataset .
<capitals/2.ttl> a sm:Deck, dcat:Dataset ; sm:formatVersion 3 ; sm:cardCount 243 ;
   dcterms:title "Capitals" ; dcterms:description "Capitals of the world." ;
   dcterms:creator <capitals/2.ttl#anton>, <capitals/2.ttl#gone> ; dcterms:license <${CC0}> ;
   dcterms:created "2026-09-22T09:49:00.236Z"^^xsd:dateTime ; dcterms:modified "2026-09-27T20:12:13Z"^^xsd:dateTime ;
   dcterms:issued "2026-09-22T10:00:00Z"^^xsd:dateTime ;
   dcterms:publisher <#solid-memo> ; sm:studyDirection sm:bidirectional ;
   dcat:theme <${EDUC}>, <https://pod.solid-memo.com/vocab/topics#geography> ; dcat:keyword "capitals" ;
   dcat:version "2" ; adms:versionNotes "Added Norway." ;
   dcat:inSeries <#capitals> ; dcat:isVersionOf <#capitals> ; dcat:distribution <capitals/2.ttl#turtle> ;
   prov:wasDerivedFrom <${WIKIPEDIA}>, <https://iupac.org/>, <${WIKIDATA}> .
<https://iupac.org/> dcterms:creator "IUPAC" .
<capitals/2.ttl#anton> a foaf:Agent ; foaf:name "Anton" ; foaf:mbox <mailto:anton@example.com> .
<${WIKIPEDIA}> dcterms:title "List of national capitals" ; dcterms:creator "Wikipedia contributors" ; dcterms:license <${BY_SA}> .
<#broken-series> a dcat:DatasetSeries .
<#no-current> a dcat:DatasetSeries, dcat:Dataset ; dcterms:title "N" ; dcterms:description "N." ;
   dcterms:publisher <#solid-memo> ; dcat:first <n/1.ttl> ; dcat:last <n/1.ttl> ;
   dcat:hasVersion <n/1.ttl> ; dcat:hasCurrentVersion <n/1.ttl> .
<n/1.ttl> a dcat:Dataset .
<#undescribed-current> a dcat:DatasetSeries, dcat:Dataset ; dcterms:title "U" ; dcterms:description "U." ;
   dcterms:publisher <#solid-memo> ; dcat:first <u/1.ttl> ; dcat:last <u/1.ttl> ;
   dcat:hasVersion <u/1.ttl> ; dcat:hasCurrentVersion <u/1.ttl> .
`;

describe("toLibraryDecks", () => {
  it("lists each series of the catalogue by its current release, with every release, oldest first", async () => {
    const index = await datasetFromIndex(INDEX_TURTLE);
    expect(toLibraryDecks(index)).toEqual([
      {
        url: "https://solid-memo.com/decks/capitals/2.ttl",
        seriesUrl: SERIES,
        version: "2",
        versionNotes: "Added Norway.",
        releases: [
          { url: "https://solid-memo.com/decks/capitals/1.ttl", version: "1", issued: "2026-09-21T10:00:00.000Z", notes: "First." },
          { url: "https://solid-memo.com/decks/capitals/2.ttl", version: "2", issued: "2026-09-22T10:00:00.000Z", notes: "Added Norway." },
          { url: "https://solid-memo.com/decks/capitals/3.ttl", version: "?" },
        ],
        title: { en: "Capitals" },
        cardCount: 243,
        authors: ["Anton <anton@example.com>", "https://solid-memo.com/decks/capitals/2.ttl#gone"],
        license: CC0,
        description: { en: "Capitals of the world." },
        direction: "bidirectional",
        createdAt: "2026-09-22T09:49:00.236Z",
        modifiedAt: "2026-09-27T20:12:13.000Z",
        themes: [EDUC, "https://pod.solid-memo.com/vocab/topics#geography"],
        keywords: { "": ["capitals"] },
        sources: [
          { url: WIKIPEDIA, title: "List of national capitals", authors: ["Wikipedia contributors"], license: BY_SA },
          { url: "https://iupac.org/", authors: ["IUPAC"] },
          { url: WIKIDATA, authors: [] },
        ],
      },
    ]);
  });

  it("reads a library deck 5 release's keywords per language, as its series states them", async () => {
    const index = await datasetFromIndex(`
@prefix sm: <https://pod.solid-memo.com/vocab/v1#> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
<> a dcat:Catalog ; dcterms:title "Library" ; dcterms:description "Decks." ; dcterms:publisher <#solid-memo> ; dcat:dataset <#capitals> .
<#capitals> a dcat:DatasetSeries, dcat:Dataset ; sm:formatVersion 3 ;
   dcterms:title "Capitals"@en ; dcterms:description "Capitals."@en ; dcat:keyword "capitals"@en, "huvudstäder"@sv ;
   dcterms:publisher <#solid-memo> ; dcat:first <capitals/1.ttl> ; dcat:last <capitals/1.ttl> ;
   dcat:hasVersion <capitals/1.ttl> ; dcat:hasCurrentVersion <capitals/1.ttl> .
<capitals/1.ttl> a sm:Deck, dcat:Dataset ; sm:formatVersion 5 ;
   dcterms:title "Capitals"@en ; dcterms:description "Capitals of the world."@en ;
   dcat:keyword "capitals"@en, "countries"@en, "huvudstäder"@sv, "länder"@sv, "stray" ;
   dcterms:publisher <#solid-memo> ; sm:studyDirection sm:frontToBack ; dcat:theme <${EDUC}> ;
   dcat:version "1" ; dcat:inSeries <#capitals> ; dcat:isVersionOf <#capitals> ; dcat:distribution <capitals/1.ttl#turtle> .
`);
    expect(toLibraryDecks(index)).toEqual([
      expect.objectContaining({ keywords: { en: ["capitals", "countries"], sv: ["huvudstäder", "länder"] } }),
    ]);
  });

  it("keeps the title and description of a deck of format 4 in every language", async () => {
    const index = await datasetFromIndex(`
@prefix sm: <https://pod.solid-memo.com/vocab/v1#> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
<> a dcat:Catalog ; dcterms:title "Library" ; dcterms:description "Decks." ; dcterms:publisher <#solid-memo> ; dcat:dataset <#capitals> .
<#capitals> a dcat:DatasetSeries, dcat:Dataset ; sm:formatVersion 2 ;
   dcterms:title "Capitals"@en, "Huvudstäder"@sv ; dcterms:description "Capitals."@en, "Huvudstäder."@sv ;
   dcterms:publisher <#solid-memo> ; dcat:first <capitals/1.ttl> ; dcat:last <capitals/1.ttl> ;
   dcat:hasVersion <capitals/1.ttl> ; dcat:hasCurrentVersion <capitals/1.ttl> .
<capitals/1.ttl> a sm:Deck, dcat:Dataset ; sm:formatVersion 4 ;
   dcterms:title "Huvudstäder"@sv, "Capitals"@en ; dcterms:description "Capitals of the world."@en, "Världens huvudstäder."@sv ;
   dcterms:publisher <#solid-memo> ; sm:studyDirection sm:frontToBack ; dcat:theme <${EDUC}> ;
   dcat:version "1" ; dcat:inSeries <#capitals> ; dcat:isVersionOf <#capitals> ; dcat:distribution <capitals/1.ttl#turtle> .
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
      INDEX_TURTLE.replace("sm:cardCount 243 ;", "").replace(', <capitals/1.ttl>, <capitals/3.ttl>', ', <capitals/9.ttl>')
        .replace(`dcterms:license <${CC0}> ;`, "").replace('dcterms:created "2026-09-22T09:49:00.236Z"^^xsd:dateTime ; dcterms:modified "2026-09-27T20:12:13Z"^^xsd:dateTime ;', "")
        .replace('adms:versionNotes "Added Norway." ;', ""),
    );
    const [deck] = toLibraryDecks(index);
    expect(deck.cardCount).toBe(0);
    expect(deck.releases.map((r) => r.version)).toEqual(["2", "?"]);
    expect(deck).not.toHaveProperty("license");
    expect(deck).not.toHaveProperty("createdAt");
    expect(deck).not.toHaveProperty("versionNotes");
  });

  it("lists nothing for a document without a catalogue", async () => {
    expect(toLibraryDecks(await datasetFromIndex(`<#x> a <${SM.Card}> .`))).toEqual([]);
  });
});

/** The index as the app reads it, from where it is published. */
function datasetFromIndex(turtle: string) {
  return datasetOf(turtle, INDEX);
}

describe("toLibraryDeckContent", () => {
  function deckDocument(
    ...things: ReturnType<typeof thing>[]
  ): SolidDataset {
    return things.reduce(
      (dataset, t) => setThing(dataset, t),
      mockSolidDatasetFrom(DOC) as SolidDataset,
    );
  }

  it("maps the deck and its well-formed cards, keeping the fragment ids", () => {
    const dataset = deckDocument(
      thing(CANONICAL, (t) =>
        t
          .addIri(RDF.type, SM.Deck)
          .addStringNoLocale(DCTERMS.title, "Capitals")
          .addInteger(SM.formatVersion, 2)
          .addStringNoLocale(DCTERMS.creator, "Anton Wiklund")
          .addIri(DCTERMS.license, CC0)
          .addStringNoLocale(DCTERMS.description, "From Wikipedia.")
          .addStringNoLocale(SM.direction, "bidirectional"),
      ),
      thing(`${CANONICAL}#sweden`, (t) =>
        t
          .addIri(RDF.type, SM.Card)
          .addStringNoLocale(SM.front, "Sweden")
          .addStringNoLocale(SM.back, "Stockholm")
          .addInteger(SM.formatVersion, 1),
      ),
      thing(`${CANONICAL}#afghanistan`, (t) =>
        t
          .addIri(RDF.type, SM.Card)
          .addIri(SM.frontImage, FLAG)
          .addStringNoLocale(SM.back, "Afghanistan")
          .addInteger(SM.formatVersion, 2),
      ),
      thing(`${CANONICAL}#note`, (t) => t.addStringNoLocale(SM.front, "x")),
      thing(`${CANONICAL}#half`, (t) =>
        t.addIri(RDF.type, SM.Card).addStringNoLocale(SM.front, "Norway"),
      ),
      thing(`${CANONICAL}#half-2`, (t) =>
        t
          .addIri(RDF.type, SM.Card)
          .addStringNoLocale(SM.front, "Norway")
          .addInteger(SM.formatVersion, 2),
      ),
      thing(`${CANONICAL}#literal`, (t) =>
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

  it("treats a deck and cards without a version as the first format", () => {
    const dataset = deckDocument(
      thing(CANONICAL, (t) =>
        t.addIri(RDF.type, SM.Deck).addStringNoLocale(DCTERMS.title, "Capitals"),
      ),
      thing(`${CANONICAL}#se`, (t) =>
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

  it("refuses a deck in a newer format than it writes", () => {
    const dataset = deckDocument(
      thing(CANONICAL, (t) =>
        t.addIri(RDF.type, SM.Deck).addInteger(SM.formatVersion, 6),
      ),
    );
    expect(() => toLibraryDeckContent(DOC, dataset)).toThrow(
      `This deck is in a newer format than this version of Solid Memo can read. Reload the page to get the latest version.\nurl: ${DOC}\nversion: 6\nlatest: 5`,
    );
  });

  it("names a release's creators from the agents in its document, or by IRI when there is none", () => {
    const RELEASE = "https://solid-memo.com/decks/capitals/2.ttl";
    const dataset = deckDocument(
      thing(RELEASE, (t) =>
        t
          .addIri(RDF.type, SM.Deck)
          .addStringNoLocale(DCTERMS.title, "Capitals")
          .addStringNoLocale(DCTERMS.description, "Capitals.")
          .addIri(DCTERMS.creator, `${RELEASE}#anton`)
          .addIri(DCTERMS.creator, `${RELEASE}#gone`)
          .addIri("http://purl.org/dc/terms/publisher", "https://solid-memo.com/decks/index.ttl#solid-memo")
          .addIri(SM.studyDirection, SM.bidirectional)
          .addIri("http://www.w3.org/ns/dcat#theme", EDUC)
          .addStringNoLocale("http://www.w3.org/ns/dcat#version", "2")
          .addStringNoLocale("http://www.w3.org/ns/adms#versionNotes", "Added Norway.")
          .addIri("http://www.w3.org/ns/dcat#inSeries", SERIES)
          .addIri("http://www.w3.org/ns/dcat#isVersionOf", SERIES)
          .addIri("http://www.w3.org/ns/dcat#distribution", `${RELEASE}#turtle`)
          .addInteger(SM.formatVersion, 3),
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

  it("refuses a card in a newer format than it writes", () => {
    const dataset = deckDocument(
      thing(CANONICAL, (t) =>
        t.addIri(RDF.type, SM.Deck).addStringNoLocale(DCTERMS.title, "Capitals"),
      ),
      thing(`${CANONICAL}#se`, (t) =>
        t
          .addIri(RDF.type, SM.Card)
          .addStringNoLocale(SM.front, "Sweden")
          .addStringNoLocale(SM.back, "Stockholm")
          .addInteger(SM.formatVersion, 6),
      ),
    );
    expect(() => toLibraryDeckContent(DOC, dataset)).toThrow(
      `A card in this deck is in a newer format than this version of Solid Memo can read. Reload the page to get the latest version.\ncard: ${CANONICAL}#se\nurl: ${DOC}\nversion: 6\nlatest: 5`,
    );
  });

  it("rejects a document without a deck, or with a deck that does not fit its shape", () => {
    expect(() => toLibraryDeckContent(DOC, deckDocument())).toThrow(
      `That is not a Solid Memo deck, so it cannot be added. Choose another deck.\nurl: ${DOC}`,
    );
    expect(() =>
      toLibraryDeckContent(
        DOC,
        deckDocument(thing(CANONICAL, (t) => t.addIri(RDF.type, SM.Deck))),
      ),
    ).toThrow(`That is not a Solid Memo deck, so it cannot be added. Choose another deck.\nurl: ${DOC}`);
  });
});
