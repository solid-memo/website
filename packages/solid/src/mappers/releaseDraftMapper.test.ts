// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { courseDraft, deckDraft, DRAFT, link, of } from "@solid-memo/domain/testing/releaseDraft";
import { quadsOfTurtle } from "../testing/releaseDrafts";
import {
  draftEntries,
  draftFromQuads,
  draftIriOf,
  draftQuads,
  entryQuads,
  inPlaceIn,
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

describe("inPlaceIn", () => {
  const inPlace = inPlaceIn(CONTAINER, DRAFT);
  const CARDS = `${CONTAINER}cards.ttl`;
  const CHAPTER = `${CONTAINER}chapter-ch-a.ttl`;

  it("takes a subject named as the draft writes it in the document it is in", () => {
    expect(inPlace(DRAFT, DRAFT)).toBe(true);
    expect(inPlace(DRAFT, of("q1"))).toBe(true);
    expect(inPlace(CARDS, `${CARDS}#q2`)).toBe(true);
    expect(inPlace(CHAPTER, `${CHAPTER}#q1`)).toBe(true);
    expect(inPlace(CARDS, `${CONTAINER}notes.ttl#x`)).toBe(true);
    expect(inPlace(CARDS, "https://elsewhere.example/#x")).toBe(true);
  });

  it("does not take one of the draft's documents, or another document's fragment, as one of its subjects (GHSA-8w75-jg23-rxq5)", () => {
    expect(inPlace(DRAFT, CARDS)).toBe(false);
    expect(inPlace(CARDS, CARDS)).toBe(false);
    expect(inPlace(CARDS, DRAFT)).toBe(false);
    expect(inPlace(DRAFT, `${CARDS}#q2`)).toBe(false);
    expect(inPlace(CARDS, `${CHAPTER}#q1`)).toBe(false);
    expect(inPlace(CARDS, of("q2"))).toBe(false);
  });
});

describe("terms and triples", () => {
  it("are plain data both ways", () => {
    const literal = {
      kind: "literal" as const,
      value: "Hej",
      language: "sv",
      datatype: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
    };
    const quad = quadOf("_:b0", "https://p.example/", literal);
    expect(keyOf(quad.subject)).toBe("_:b0");
    expect(termOf(quad.object)).toEqual(literal);
    expect(
      termOf(quadOf(DRAFT, "https://p.example/", { kind: "blank", value: "b1" }).object),
    ).toEqual({ kind: "blank", value: "b1" });
    expect(
      termOf(quadOf(DRAFT, "https://p.example/", { kind: "iri", value: DRAFT }).object),
    ).toEqual({ kind: "iri", value: DRAFT });
    expect(
      tripleKey({ subject: DRAFT, predicate: "p", object: { ...literal, language: "SV" } }),
    ).toBe(tripleKey({ subject: DRAFT, predicate: "p", object: literal }));
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
    expect(draft.root).toMatchObject({
      title: { en: "Solid" },
      studyDirection: "https://solid-memo.com/ns/vocab/v1.ttl#frontToBack",
    });
    expect(draft.agents).toEqual([{ id: "alice", data: { name: "Alice" } }]);
    expect(draft.chapters).toEqual([
      { id: "ch-a", data: { course: DRAFT, position: 0, reviewQuestion: [] } },
    ]);
    expect(draft.steps).toEqual([
      { id: "ch-a-1", data: { chapter: of("ch-a"), checkedBy: [of("q1")] } },
    ]);
    expect(draft.cards).toEqual([
      { id: "q1", data: { front: { en: "Q" }, back: { en: "A" }, distractor: [], subject: [] } },
    ]);
    expect(draft.distractors).toEqual([{ id: "q1-d1", data: { text: { en: "No" } } }]);
    expect(draft.distributions).toEqual([{ id: "turtle", data: { accessUrl: DRAFT } }]);
    const kept = draft.triples.map(
      (triple) => `${triple.subject} ${triple.predicate.split(/[#/]/).at(-1)}`,
    );
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

  it("moves what a card stamped below format 7 is about into its record, which writes it once", async () => {
    const quads = await quadsOfTurtle(
      `${PREFIXES}
<> a solid-memo:Deck , dcat:Dataset ; solid-memo:formatVersion 1 ; dcterms:title "Jobs"@en ;
    solid-memo:studyDirection solid-memo:frontToBack .
<#old> a solid-memo:Card ; solid-memo:formatVersion 4 ; solid-memo:front "Q"@en ; solid-memo:back "A"@en ;
    dcterms:subject <https://data.example/b> , <https://data.example/a> .
<#new> a solid-memo:Card ; solid-memo:formatVersion 7 ; solid-memo:front "Q"@en ; solid-memo:back "A"@en ;
    dcterms:subject <https://data.example/c> .
`,
      DRAFT,
    );
    const draft = draftFromQuads(quads, DRAFT)!;
    const subjects = Object.fromEntries(
      draft.cards.map((node) => [node.id, [...node.data.subject].sort()]),
    );
    expect(subjects).toEqual({
      old: ["https://data.example/a", "https://data.example/b"],
      new: ["https://data.example/c"],
    });
    expect(draft.triples.filter((triple) => triple.predicate.endsWith("/subject"))).toEqual([]);
    const written = draftQuads(draft).filter(
      (quad) => quad.subject.value === of("old") && quad.predicate.value.endsWith("/subject"),
    );
    expect(written.map((quad) => quad.object.value).sort()).toEqual([
      "https://data.example/a",
      "https://data.example/b",
    ]);
  });

  it("keeps the release a draft was published as only at an address a release may have", async () => {
    const releasedAs = async (iri: string) =>
      draftFromQuads(
        await quadsOfTurtle(
          `${PREFIXES}<> a solid-memo:Deck ; solid-memo:formatVersion 1 ; dcterms:title "Solid"@en ;
    solid-memo:studyDirection solid-memo:frontToBack ; solid-memo:releasedAs <${iri}> .`,
          DRAFT,
        ),
        DRAFT,
      )!.root.releasedAs;
    const release = "https://pod.example/solid-memo/a/releases/solid/v1.ttl";
    expect(await releasedAs(release)).toBe(release);
    expect(await releasedAs("javascript:alert(1)")).toBeUndefined();
    expect(
      await releasedAs("https://pod.example/solid-memo/a/releases/solid/v1.ttl?x"),
    ).toBeUndefined();
  });

  it("keeps the release at a release's address of several, whatever their order", async () => {
    const release = "https://pod.example/solid-memo/a/releases/solid/v1.ttl";
    for (const objects of [
      `<javascript:alert(1)>, <${release}>`,
      `<${release}>, <javascript:alert(1)>`,
    ]) {
      const draft = draftFromQuads(
        await quadsOfTurtle(
          `${PREFIXES}<> a solid-memo:Deck ; solid-memo:formatVersion 1 ; dcterms:title "Solid"@en ;
    solid-memo:studyDirection solid-memo:frontToBack ; solid-memo:releasedAs ${objects} .`,
          DRAFT,
        ),
        DRAFT,
      );
      expect(draft!.root.releasedAs).toBe(release);
    }
  });

  it("is null without a root this app can read", async () => {
    expect(
      draftFromQuads(await quadsOfTurtle(`${PREFIXES}<#x> a solid-memo:Card .`, DRAFT), DRAFT),
    ).toBeNull();
    expect(
      draftFromQuads(await quadsOfTurtle(`${PREFIXES}<> a dcat:Dataset .`, DRAFT), DRAFT),
    ).toBeNull();
    expect(
      draftFromQuads(await quadsOfTurtle(`${PREFIXES}<> a solid-memo:Deck .`, DRAFT), DRAFT),
    ).toBeNull();
  });
});

describe("draftFromQuads refusing hidden values (GHSA-32jq-jh7h-r7v4)", () => {
  const ROOT = `<> a solid-memo:Deck , dcat:Dataset ; solid-memo:formatVersion 1 ;
    dcterms:title "Solid"@en ; solid-memo:studyDirection solid-memo:frontToBack`;
  const CARD = `<#q1> a solid-memo:Card ; solid-memo:formatVersion 7 ;
    solid-memo:front "Q"@en ; solid-memo:back "A"@en`;
  const STEP = "<#ch-a-1> a solid-memo:Step , schema:LearningResource ; solid-memo:formatVersion 1";
  /** The draft the Turtle states, read as a draft in the pod is. */
  const read = async (turtle: string) =>
    draftFromQuads(
      await quadsOfTurtle(
        `${PREFIXES}@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
${turtle}`,
        DRAFT,
      ),
      DRAFT,
      { refuseHidden: true },
    );
  const hidden = (subject: string, predicate: string) =>
    expect.objectContaining({ code: "draftHiddenValue", vars: { subject, predicate } });
  const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

  it("reads a draft whose records keep every value their shapes own, whatever it says beyond them", async () => {
    const draft =
      await read(`${ROOT} ; solid-memo:releasedAs <https://pod.example/a/releases/solid/v1.ttl> , <https://pod.example/a/releases/solid/v2.ttl> ;
    dcterms:issued "2026-01-01T00:00:00Z"^^xsd:dateTime , "2026-01-02T00:00:00Z"^^xsd:dateTime ;
    dcterms:modified "2026-01-01T00:00:00Z"^^xsd:dateTime , "later" ;
    solid-memo:formatVersion "one" ; dcat:keyword "a"@en , "b"@en , "a"@sv .
${CARD} ; solid-memo:front "F" ; solid-memo:distractor <#q1-d1> , <#q1-d2> ; <https://other.example/says> "more" , "again" .
<#old> a solid-memo:Card ; solid-memo:formatVersion 4 ; solid-memo:front "Q"@en ; solid-memo:back "A"@en ;
    dcterms:subject <https://data.example/a> , <https://data.example/b> .
${STEP} ; schema:position 1 ; owl:deprecated false .
<#ch-a-2> a solid-memo:Step , schema:LearningResource .
`);
    expect(draft?.cards.map((card) => card.id).sort()).toEqual(["old", "q1"]);
    expect(draft?.steps).toHaveLength(2);
    // Without it, as a release or a draft's listing is read, a value the record drops is not refused.
    expect(
      draftFromQuads(await quadsOfTurtle(`${PREFIXES}${ROOT} .\n${CARD} , "Q2"@en .`, DRAFT), DRAFT)
        ?.cards,
    ).toHaveLength(1);
  });

  it("refuses a second text in a language, of a card the draft sees in one", async () => {
    await expect(read(`${ROOT} .\n${CARD} ; solid-memo:front "HIDDEN"@en .`)).rejects.toEqual(
      hidden(of("q1"), `${SM}front`),
    );
  });

  it("refuses a second value of a field of one, and a value of the wrong kind", async () => {
    await expect(read(`${ROOT} .\n${STEP} ; owl:deprecated true , false .`)).rejects.toEqual(
      hidden(of("ch-a-1"), "http://www.w3.org/2002/07/owl#deprecated"),
    );
    await expect(read(`${ROOT} .\n${STEP} ; schema:position "first" .`)).rejects.toEqual(
      hidden(of("ch-a-1"), "https://schema.org/position"),
    );
    await expect(read(`${ROOT} .\n${CARD} ; solid-memo:frontImage "not an IRI" .`)).rejects.toEqual(
      hidden(of("q1"), `${SM}frontImage`),
    );
    await expect(read(`${ROOT} .\n${CARD} ; solid-memo:formatVersion 8 .`)).rejects.toEqual(
      hidden(of("q1"), `${SM}formatVersion`),
    );
  });

  it("refuses a subject a newer app wrote with the reload message, not as a value to remove", async () => {
    await expect(
      read(`${ROOT} .\n${CARD.replace("formatVersion 7", 'formatVersion "99"^^xsd:integer')} .`),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "writtenByNewerApp",
        vars: { url: of("q1"), version: 99, writes: 7 },
      }),
    );
  });

  it("refuses a value its record reads otherwise than it is stated: an ill-formed number", async () => {
    await expect(
      read(`${ROOT} .\n${CARD.replace("formatVersion 7", 'formatVersion "7junk"^^xsd:integer')} .`),
    ).rejects.toEqual(hidden(of("q1"), `${SM}formatVersion`));
    await expect(
      read(`${ROOT} .\n${STEP} ; schema:position "0junk"^^xsd:integer .`),
    ).rejects.toEqual(hidden(of("ch-a-1"), "https://schema.org/position"));
    await expect(read(`${ROOT} .\n${STEP} ; schema:position "0.9"^^xsd:integer .`)).rejects.toEqual(
      hidden(of("ch-a-1"), "https://schema.org/position"),
    );
    // Two spellings of one value are two statements where its record keeps one.
    await expect(
      read(`${ROOT} .\n${STEP} ; schema:position 1 , "01"^^xsd:integer .`),
    ).rejects.toEqual(hidden(of("ch-a-1"), "https://schema.org/position"));
  });

  it("reads a value stated in another spelling of what its record writes", async () => {
    const draft = await read(`${ROOT} .
${CARD.replace("formatVersion 7", 'formatVersion "+07"^^xsd:integer')} ;
    dcterms:created "2026-01-01T00:00:00Z"^^xsd:dateTime .
${STEP} ; schema:position "-01"^^xsd:integer ; owl:deprecated "1"^^xsd:boolean .
<#ch-a-2> a solid-memo:Step , schema:LearningResource ; schema:position "-0"^^xsd:integer .`);
    expect(draft?.cards[0]?.data).toMatchObject({ created: "2026-01-01T00:00:00.000Z" });
    expect(draft?.steps.map((step) => step.data)).toEqual([
      expect.objectContaining({ position: -1, deprecated: true }),
      expect.objectContaining({ position: -0 }),
    ]);
    // A value its record cannot read is not one it writes.
    for (const created of [
      "yesterday",
      "2026-01-01T01:00:00+01:00",
      "2026-13-01T00:00:00Z",
      "2026-02-30T00:00:00Z",
      "2026-01-01T99:00:00Z",
      "2026-01-01T00:00:60Z",
    ]) {
      await expect(
        read(`${ROOT} .\n${CARD} ; dcterms:created "${created}"^^xsd:dateTime .`),
      ).rejects.toEqual(hidden(of("q1"), "http://purl.org/dc/terms/created"));
    }
    await expect(read(`${ROOT} .\n${STEP} ; owl:deprecated "yes"^^xsd:boolean .`)).rejects.toEqual(
      hidden(of("ch-a-1"), "http://www.w3.org/2002/07/owl#deprecated"),
    );
  });

  it("refuses an IRI outside a field's list, and a predicate the shape forbids", async () => {
    await expect(read(`${ROOT} , solid-memo:sideways .`)).rejects.toEqual(
      hidden(DRAFT, `${SM}studyDirection`),
    );
    await expect(read(`${ROOT} ; dcterms:source <https://data.example/> .`)).rejects.toEqual(
      hidden(DRAFT, "http://purl.org/dc/terms/source"),
    );
  });

  it("refuses what a card stamped below format 7 says it is about that its record drops", async () => {
    await expect(
      read(`${ROOT} .
<#old> a solid-memo:Card ; solid-memo:formatVersion 4 ; solid-memo:front "Q"@en ; solid-memo:back "A"@en ;
    dcterms:subject <https://data.example/a> , "a literal" .`),
    ).rejects.toEqual(hidden(of("old"), "http://purl.org/dc/terms/subject"));
  });
});

describe("draftEntries", () => {
  it("keeps each subject in its document, at that document's IRI, naming the others where they are", () => {
    const entries = draftEntries(courseDraft());
    const chapter = `${CONTAINER}chapter-ch-a.ttl`;
    expect(entries.get(DRAFT)).toMatchObject({
      document: DRAFT,
      subject: DRAFT,
      raw: [{ predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" }, expect.anything()],
    });
    expect(entries.get(of("ch-a-1"))).toMatchObject({
      document: chapter,
      subject: `${chapter}#ch-a-1`,
      shaped: { record: { chapter: `${chapter}#ch-a`, checkedBy: [`${chapter}#q-a-1a`] } },
    });
    expect(entries.get(of("q-loose"))).toMatchObject({
      document: `${CONTAINER}cards.ttl`,
      subject: `${CONTAINER}cards.ttl#q-loose`,
    });
    expect(entries.get(of("compilation"))).toMatchObject({
      document: DRAFT,
      subject: of("compilation"),
    });
    expect(entries.get("https://source.example/")!.raw).toHaveLength(1);
  });

  it("writes a deck's root without the course type, and its subjects as new quads", () => {
    const draft = { ...courseDraft(), course: false };
    const root = draftEntries(draft).get(DRAFT)!;
    expect(root.raw.map((triple) => triple.predicate)).toEqual([
      "http://www.w3.org/ns/prov#wasGeneratedBy",
    ]);
    const quads = entryQuads(draftEntries(draft).get(of("q-a-1a"))!);
    expect(quads.map((quad) => quad.predicate.value)).toContain(
      "https://solid-memo.com/ns/vocab/v1.ttl#distractor",
    );
  });

  it("keeps a blank node with what names it, by its label, and writes a subject with no shape as its statements", () => {
    const draft = courseDraft();
    const entries = draftEntries({
      ...draft,
      triples: [
        ...draft.triples,
        {
          subject: of("q-loose"),
          predicate: "https://p.example/sum",
          object: { kind: "blank", value: "b0" },
        },
        {
          subject: "_:b0",
          predicate: "https://p.example/value",
          object: { kind: "iri", value: of("q-loose") },
        },
      ],
    });
    expect(entries.get("_:b0")).toEqual({
      document: `${CONTAINER}cards.ttl`,
      subject: "_:b0",
      raw: [
        {
          subject: "_:b0",
          predicate: "https://p.example/value",
          object: { kind: "iri", value: `${CONTAINER}cards.ttl#q-loose` },
        },
      ],
    });
    expect(
      entryQuads(entries.get("_:b0")!).map((quad) => [quad.subject.termType, quad.object.value]),
    ).toEqual([["BlankNode", `${CONTAINER}cards.ttl#q-loose`]]);
  });

  it("leaves out a statement that one of its documents is part of something, as a release it was made from may say", () => {
    const IS_PART_OF = "http://purl.org/dc/terms/isPartOf";
    const deck = "https://attacker.example/a/catalog.ttl#deck-x";
    const draft = courseDraft();
    const entries = draftEntries({
      ...draft,
      triples: [
        ...draft.triples,
        link(DRAFT, IS_PART_OF, deck),
        link(DRAFT.replace("https://pod.example/", "https://POD.example:443/"), IS_PART_OF, deck),
        link(of("compilation"), IS_PART_OF, deck),
      ],
    });
    const raw = [...entries.values()].flatMap((entry) =>
      entry.raw.map((triple) => [entry.document, triple.subject, triple.predicate]),
    );
    expect(raw.filter(([, , predicate]) => predicate === IS_PART_OF)).toEqual([
      [DRAFT, of("compilation"), IS_PART_OF],
    ]);
  });

  it("leaves out a statement that its cards or a chapter's document is part of something, though a card names it as a distractor", () => {
    const IS_PART_OF = "http://purl.org/dc/terms/isPartOf";
    const deck = "https://attacker.example/a/catalog.ttl#deck-x";
    const cards = `${CONTAINER}cards.ttl`;
    const chapter = `${CONTAINER}chapter-ch-a.ttl`;
    const draft = courseDraft();
    const named = { "q-loose": cards, "q-a-1a": chapter } as Record<string, string>;
    const entries = draftEntries({
      ...draft,
      cards: draft.cards.map((node) =>
        named[node.id] === undefined
          ? node
          : {
              ...node,
              data: { ...node.data, distractor: [...node.data.distractor, named[node.id]!] },
            },
      ),
      triples: [...draft.triples, link(cards, IS_PART_OF, deck), link(chapter, IS_PART_OF, deck)],
    });
    const raw = [...entries.values()].flatMap((entry) =>
      entry.raw.map((triple) => [entry.document, triple.subject, triple.predicate]),
    );
    expect(raw.filter(([, subject]) => subject === cards || subject === chapter)).toEqual([]);
    expect(raw.filter(([, , predicate]) => predicate === IS_PART_OF)).toEqual([]);
  });

  it("tell an entry that changed from one that did not", () => {
    const before = draftEntries(courseDraft());
    const draft = courseDraft();
    const after = draftEntries({
      ...draft,
      cards: draft.cards.map((node) =>
        node.id === "q-loose" ? { ...node, data: { ...node.data, back: { en: "x" } } } : node,
      ),
    });
    expect(sameEntry(before.get(of("q-a-1a"))!, after.get(of("q-a-1a"))!)).toBe(true);
    expect(sameEntry(before.get(of("q-loose"))!, after.get(of("q-loose"))!)).toBe(false);
    expect(
      sameEntry(before.get(of("compilation"))!, { ...before.get(of("compilation"))!, raw: [] }),
    ).toBe(false);
    expect(
      sameEntry(before.get(of("q-loose"))!, { ...before.get(of("q-loose"))!, document: DRAFT }),
    ).toBe(false);
  });
});

describe("draftQuads", () => {
  it("states the draft at its own IRIs, which read back as the draft", () => {
    const course = courseDraft();
    const quads = draftQuads(course);
    expect(
      quads.every(
        (quad) =>
          quad.subject.value === DRAFT ||
          quad.subject.value.startsWith(`${DRAFT}#`) ||
          quad.subject.value === "https://source.example/",
      ),
    ).toBe(true);
    expect(draftFromQuads(quads, DRAFT)).toEqual(course);
    const deck = deckDraft();
    expect(draftFromQuads(draftQuads(deck), DRAFT)).toEqual(deck);
  });
});
