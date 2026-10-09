import { describe, expect, it } from "vitest";
import { parseTurtle } from "@solid-memo/turtle/rdf";
import { quadsToReleaseModel, termOf } from "./quadsToReleaseModel.ts";

const URL = "https://solid-memo.com/decks/solid/v2.ttl";
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const LANG = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";
const STRING = "http://www.w3.org/2001/XMLSchema#string";
const en = (value: string) => ({ kind: "literal", value, language: "en", datatype: LANG });
const plain = (value: string) => ({ kind: "literal", value, language: "", datatype: STRING });
const iri = (value: string) => ({ kind: "iri", value });

const TURTLE = `@base <${URL}> .
@prefix solid-memo: <${SM}> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix schema: <https://schema.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

<> a solid-memo:Deck , schema:Course ;
    dcat:version "2" ;
    dcterms:title "Solid"@en ;
    dcat:keyword "pods"@en , [ a dcat:Keyword ] ;
    dcat:prev <v1.ttl> ;
    prov:wasGeneratedBy <#compilation> ;
    prov:wasDerivedFrom <https://solidproject.org/> .

<#compilation> a prov:Activity .
<#review> a prov:Activity .

<#q-1> a solid-memo:Card ;
    solid-memo:textFormat solid-memo:markdown ;
    solid-memo:front "Question"@en ;
    solid-memo:back "Answer"@en , <https://example.com/not-text> ;
    solid-memo:distractor <#q-1-a> , <#named> , "loose" .

<#q-1-a> a solid-memo:Distractor ;
    solid-memo:distractorText "Wrong"@en ;
    owl:deprecated true .

<#named> solid-memo:distractorText "Named"@en .

<#ch-1> a solid-memo:Chapter ;
    dcterms:title "Chapter"@en ;
    schema:isPartOf <> , "not a link" ;
    schema:position 0 ;
    solid-memo:reviewQuestion <#q-1> .

<#s-1> a solid-memo:Step ;
    solid-memo:theory "Theory"@en ;
    schema:isPartOf <#ch-1> ;
    schema:position 0 , <#not-a-position> ;
    solid-memo:checkedBy <#q-1> ;
    owl:deprecated "false" .

<#other> a solid-memo:Deck .
`;

describe("quadsToReleaseModel", () => {
  const model = quadsToReleaseModel(parseTurtle(TURTLE, URL), URL);

  it("reads what the release states of itself", () => {
    expect(model.url).toBe(URL);
    expect(model.decks).toEqual([URL, `${URL}#other`]);
    expect(model.types).toEqual([`${SM}Deck`, "https://schema.org/Course"]);
    expect(model.version).toEqual([plain("2")]);
    expect(model.title).toEqual([en("Solid")]);
    expect(model.keywords).toEqual([en("pods"), { kind: "blank", value: expect.any(String) }]);
    expect(model.prev).toEqual([iri("https://solid-memo.com/decks/solid/v1.ttl")]);
    expect(model.sources).toEqual([iri("https://solidproject.org/")]);
    expect(model.activities).toEqual([
      { iri: `${URL}#compilation`, generating: true },
      { iri: `${URL}#review`, generating: false },
    ]);
  });

  it("reads its cards, chapters, steps and distractors, retired when they state owl:deprecated true", () => {
    expect(model.cards).toEqual([
      {
        iri: `${URL}#q-1`,
        retired: false,
        front: [en("Question")],
        back: [en("Answer")],
        backLabel: [],
        frontNote: [],
        backNote: [],
        distractors: [iri(`${URL}#q-1-a`), iri(`${URL}#named`), plain("loose")],
      },
    ]);
    expect(model.chapters).toEqual([
      {
        iri: `${URL}#ch-1`,
        retired: false,
        title: [en("Chapter")],
        description: [],
        isPartOf: [URL],
        positions: ["0"],
        reviewQuestions: [`${URL}#q-1`],
      },
    ]);
    expect(model.steps).toEqual([
      { iri: `${URL}#s-1`, retired: false, theory: [en("Theory")], isPartOf: [`${URL}#ch-1`], positions: ["0"], checkedBy: [`${URL}#q-1`] },
    ]);
    expect(model.distractors).toEqual([
      { iri: `${URL}#q-1-a`, typed: true, retired: true, text: [en("Wrong")], note: [] },
      { iri: `${URL}#named`, typed: false, retired: false, text: [en("Named")], note: [] },
    ]);
  });

  it("reads every distractor link and text format, of any subject", () => {
    expect(model.distractorLinks.map((link) => link.object.value)).toEqual([`${URL}#q-1-a`, `${URL}#named`, "loose"]);
    expect(model.textFormats).toEqual([{ subject: `${URL}#q-1`, object: iri(`${SM}markdown`) }]);
  });

  it("reads a release that states nothing", () => {
    const empty = quadsToReleaseModel([], URL);
    expect(empty.decks).toEqual([]);
    expect(empty.cards).toEqual([]);
  });
});

it("reads each kind of term", () => {
  const [q] = parseTurtle(`<a> <b> _:x .`, URL);
  expect(termOf(q.object)).toEqual({ kind: "blank", value: q.object.value });
});
