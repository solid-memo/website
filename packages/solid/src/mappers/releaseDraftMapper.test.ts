import { describe, expect, it } from "vitest";
import { courseDraft, deckDraft, DRAFT, of } from "@solid-memo/domain/testing/releaseDraft";
import { quadsOfTurtle } from "../testing/releaseDrafts";
import {
  draftEntries,
  draftFromQuads,
  draftIriOf,
  draftQuads,
  entryQuads,
  keyOf,
  quadOf,
  sameEntry,
  termOf,
  tripleKey,
} from "./releaseDraftMapper";

const CONTAINER = DRAFT.slice(0, -"release.ttl".length);
const PREFIXES = `@prefix solid-memo: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix schema: <https://schema.org/> .
`;

describe("draftIriOf", () => {
  const iriOf = draftIriOf(CONTAINER, DRAFT);

  it("names a fragment of any of the draft's documents as one of its release document", () => {
    expect(iriOf(`${CONTAINER}chapter-ch-a.ttl#q1`)).toBe(of("q1"));
    expect(iriOf(`${CONTAINER}cards.ttl#q2`)).toBe(of("q2"));
    expect(iriOf(`${CONTAINER}cards.ttl`)).toBe(DRAFT);
    expect(iriOf(DRAFT)).toBe(DRAFT);
  });

  it("leaves any other IRI as it is", () => {
    expect(iriOf(`${CONTAINER}notes.ttl#x`)).toBe(`${CONTAINER}notes.ttl#x`);
    expect(iriOf("https://elsewhere.example/#x")).toBe("https://elsewhere.example/#x");
  });
});

describe("terms and triples", () => {
  it("are plain data both ways", () => {
    const literal = { kind: "literal" as const, value: "Hej", language: "sv", datatype: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString" };
    const quad = quadOf("_:b0", "https://p.example/", literal);
    expect(keyOf(quad.subject)).toBe("_:b0");
    expect(termOf(quad.object)).toEqual(literal);
    expect(termOf(quadOf(DRAFT, "https://p.example/", { kind: "blank", value: "b1" }).object)).toEqual({ kind: "blank", value: "b1" });
    expect(termOf(quadOf(DRAFT, "https://p.example/", { kind: "iri", value: DRAFT }).object)).toEqual({ kind: "iri", value: DRAFT });
    expect(tripleKey({ subject: DRAFT, predicate: "p", object: { ...literal, language: "SV" } })).toBe(tripleKey({ subject: DRAFT, predicate: "p", object: literal }));
  });
});

describe("draftFromQuads", () => {
  it("reads the shaped subjects by their shapes, and keeps every other statement as it is", async () => {
    const quads = await quadsOfTurtle(
      `${PREFIXES}
<> a solid-memo:Deck , dcat:Dataset , schema:Course ;
    solid-memo:formatVersion 1 ;
    dcterms:title "Solid"@en ;
    solid-memo:studyDirection solid-memo:frontToBack ;
    prov:wasGeneratedBy <#compilation> .
<#alice> a foaf:Agent ; foaf:name "Alice" .
<#ch-a> a solid-memo:Chapter , schema:Syllabus ; solid-memo:formatVersion 1 ; schema:isPartOf <> ; schema:position 0 .
<#ch-a-1> a solid-memo:Step , schema:LearningResource ; schema:isPartOf <#ch-a> ; solid-memo:checkedBy <#q1> .
<#q1> a solid-memo:Card ; solid-memo:formatVersion 4 ; solid-memo:front "Q"@en ; solid-memo:back "A"@en ; <https://other.example/says> "more" .
<#q1-d1> a solid-memo:Distractor , schema:Answer ; solid-memo:distractorText "No"@en .
<#turtle> a dcat:Distribution ; dcat:accessURL <> .
<#compilation> a prov:Activity .
<#broken> a solid-memo:Card ; solid-memo:frontImage "not an IRI" .
<#both> a solid-memo:Card , solid-memo:Distractor ; solid-memo:back "?"@en .
<https://elsewhere.example/#card> a solid-memo:Card ; solid-memo:back "elsewhere"@en .
`,
      DRAFT,
    );
    const draft = draftFromQuads(quads, DRAFT)!;
    expect(draft.course).toBe(true);
    expect(draft.root).toMatchObject({ title: { en: "Solid" }, studyDirection: "https://solid-memo.com/ns/vocab/v1.ttl#frontToBack" });
    expect(draft.agents).toEqual([{ id: "alice", data: { name: "Alice" } }]);
    expect(draft.chapters).toEqual([{ id: "ch-a", data: { course: DRAFT, position: 0, reviewQuestion: [] } }]);
    expect(draft.steps).toEqual([{ id: "ch-a-1", data: { chapter: of("ch-a"), checkedBy: [of("q1")] } }]);
    expect(draft.cards).toEqual([{ id: "q1", data: { front: { en: "Q" }, back: { en: "A" }, distractor: [] } }]);
    expect(draft.distractors).toEqual([{ id: "q1-d1", data: { text: { en: "No" } } }]);
    expect(draft.distributions).toEqual([{ id: "turtle", data: { accessUrl: DRAFT } }]);
    const kept = draft.triples.map((triple) => `${triple.subject} ${triple.predicate.split(/[#/]/).at(-1)}`);
    expect(kept).toEqual(
      expect.arrayContaining([
        `${DRAFT} wasGeneratedBy`,
        `${of("q1")} says`,
        `${of("compilation")} type`,
        `${of("broken")} type`,
        `${of("broken")} frontImage`,
        `${of("both")} back`,
        "https://elsewhere.example/#card back",
      ]),
    );
    expect(kept).not.toContain(`${DRAFT} type`);
    expect(draft.published).toEqual({ ids: {}, activities: [] });
  });

  it("is null without a root this app can read", async () => {
    expect(draftFromQuads(await quadsOfTurtle(`${PREFIXES}<#x> a solid-memo:Card .`, DRAFT), DRAFT)).toBeNull();
    expect(draftFromQuads(await quadsOfTurtle(`${PREFIXES}<> a dcat:Dataset .`, DRAFT), DRAFT)).toBeNull();
    expect(draftFromQuads(await quadsOfTurtle(`${PREFIXES}<> a solid-memo:Deck .`, DRAFT), DRAFT)).toBeNull();
  });
});

describe("draftEntries", () => {
  it("keeps each subject in its document, at that document's IRI, naming the others where they are", () => {
    const entries = draftEntries(courseDraft());
    const chapter = `${CONTAINER}chapter-ch-a.ttl`;
    expect(entries.get(DRAFT)).toMatchObject({ document: DRAFT, subject: DRAFT, raw: [{ predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" }, expect.anything()] });
    expect(entries.get(of("ch-a-1"))).toMatchObject({
      document: chapter,
      subject: `${chapter}#ch-a-1`,
      shaped: { record: { chapter: `${chapter}#ch-a`, checkedBy: [`${chapter}#q-a-1a`] } },
    });
    expect(entries.get(of("q-loose"))).toMatchObject({ document: `${CONTAINER}cards.ttl`, subject: `${CONTAINER}cards.ttl#q-loose` });
    expect(entries.get(of("compilation"))).toMatchObject({ document: DRAFT, subject: of("compilation") });
    expect(entries.get("https://source.example/")!.raw).toHaveLength(1);
  });

  it("writes a deck's root without the course type, and its subjects as new quads", () => {
    const draft = { ...courseDraft(), course: false };
    const root = draftEntries(draft).get(DRAFT)!;
    expect(root.raw.map((triple) => triple.predicate)).toEqual(["http://www.w3.org/ns/prov#wasGeneratedBy"]);
    const quads = entryQuads(draftEntries(draft).get(of("q-a-1a"))!);
    expect(quads.map((quad) => quad.predicate.value)).toContain("https://solid-memo.com/ns/vocab/v1.ttl#distractor");
  });

  it("keeps a blank node with what names it, by its label, and writes a subject with no shape as its statements", () => {
    const draft = courseDraft();
    const entries = draftEntries({
      ...draft,
      triples: [
        ...draft.triples,
        { subject: of("q-loose"), predicate: "https://p.example/sum", object: { kind: "blank", value: "b0" } },
        { subject: "_:b0", predicate: "https://p.example/value", object: { kind: "iri", value: of("q-loose") } },
      ],
    });
    expect(entries.get("_:b0")).toEqual({
      document: `${CONTAINER}cards.ttl`,
      subject: "_:b0",
      raw: [{ subject: "_:b0", predicate: "https://p.example/value", object: { kind: "iri", value: `${CONTAINER}cards.ttl#q-loose` } }],
    });
    expect(entryQuads(entries.get("_:b0")!).map((quad) => [quad.subject.termType, quad.object.value])).toEqual([["BlankNode", `${CONTAINER}cards.ttl#q-loose`]]);
  });

  it("tell an entry that changed from one that did not", () => {
    const before = draftEntries(courseDraft());
    const draft = courseDraft();
    const after = draftEntries({ ...draft, cards: draft.cards.map((node) => (node.id === "q-loose" ? { ...node, data: { ...node.data, back: { en: "x" } } } : node)) });
    expect(sameEntry(before.get(of("q-a-1a"))!, after.get(of("q-a-1a"))!)).toBe(true);
    expect(sameEntry(before.get(of("q-loose"))!, after.get(of("q-loose"))!)).toBe(false);
    expect(sameEntry(before.get(of("compilation"))!, { ...before.get(of("compilation"))!, raw: [] })).toBe(false);
    expect(sameEntry(before.get(of("q-loose"))!, { ...before.get(of("q-loose"))!, document: DRAFT })).toBe(false);
  });
});

describe("draftQuads", () => {
  it("states the draft at its own IRIs, which read back as the draft", () => {
    const course = courseDraft();
    const quads = draftQuads(course);
    expect(quads.every((quad) => quad.subject.value === DRAFT || quad.subject.value.startsWith(`${DRAFT}#`) || quad.subject.value === "https://source.example/")).toBe(true);
    expect(draftFromQuads(quads, DRAFT)).toEqual(course);
    const deck = deckDraft();
    expect(draftFromQuads(draftQuads(deck), DRAFT)).toEqual(deck);
  });
});
