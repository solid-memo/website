// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { quadOf } from "./mappers/releaseDraftMapper";
import { quadsOfTurtle } from "./testing/releaseDrafts";
import { turtleOf } from "./turtleWriter";

const BASE = "https://pod.example/releases/capitals/v1.ttl";
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const PREFIXES = { "solid-memo": SM, xsd: XSD, unused: "https://unused.example/" };

const iri = (value: string) => ({ kind: "iri" as const, value });
const literal = (value: string, datatype = `${XSD}string`, language = "") => ({
  kind: "literal" as const,
  value,
  language,
  datatype,
});
const blank = (value: string) => ({ kind: "blank" as const, value });

describe("turtleOf", () => {
  it("writes the document's own subjects relative to its base, the others by prefix or in full", () => {
    const turtle = turtleOf(
      [
        quadOf(
          `${BASE}#se`,
          `${SM}front`,
          literal("Sweden", "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString", "en"),
        ),
        quadOf(`${BASE}#se`, RDF_TYPE, iri(`${SM}Card`)),
        quadOf(BASE, `${SM}formatVersion`, literal("6", `${XSD}integer`)),
        quadOf(BASE, RDF_TYPE, iri(`${SM}Deck`)),
        quadOf(BASE, RDF_TYPE, iri("http://www.w3.org/ns/dcat#Dataset")),
        quadOf(BASE, "https://other.example/says", iri("https://other.example/a%20b")),
      ],
      { base: BASE, prefixes: PREFIXES, order: [BASE] },
    );
    expect(turtle).toBe(`@base <${BASE}> .

@prefix solid-memo: <${SM}> .

<>
    a solid-memo:Deck ,
      <http://www.w3.org/ns/dcat#Dataset> ;
    solid-memo:formatVersion 6 ;
    <https://other.example/says> <https://other.example/a%20b> .

<#se>
    a solid-memo:Card ;
    solid-memo:front "Sweden"@en .
`);
  });

  it.each([
    [
      "an IRI",
      quadOf(BASE, `${SM}image`, iri("https://img.example/a#p> . <https://evil.example/s")),
    ],
    ["a predicate", quadOf(BASE, "https://other.example/p> <https://evil.example/o", literal("x"))],
    ["a datatype", quadOf(BASE, `${SM}a`, literal("1", "https://other.example/t> . <x"))],
    [
      "a blank node's label",
      quadOf(BASE, `${SM}checksum`, blank("b x> . <https://evil.example/s")),
    ],
    [
      "a language tag",
      quadOf(
        BASE,
        `${SM}front`,
        literal("x", "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString", "en . <x"),
      ),
    ],
  ])("refuses %s Turtle cannot write as it is", (_, quad) => {
    expect(() => turtleOf([quad], { base: BASE, prefixes: PREFIXES })).toThrow(
      expect.objectContaining({ code: "unwritableTerm" }),
    );
  });

  it("writes text on one line, escaped, and typed literals with their type", () => {
    const turtle = turtleOf(
      [
        quadOf(BASE, `${SM}a`, literal('Say "hi"\\\nthen\rgo')),
        quadOf(BASE, `${SM}b`, literal("true", `${XSD}boolean`)),
        quadOf(BASE, `${SM}c`, literal("2026-10-10T00:00:00Z", `${XSD}dateTime`)),
        quadOf(BASE, `${SM}d`, literal("x1", `${XSD}integer`)),
        quadOf(BASE, `${SM}e`, literal("maybe", `${XSD}boolean`)),
        quadOf(BASE, `${SM}f`, literal("1", "https://other.example/type")),
      ],
      { base: BASE, prefixes: PREFIXES },
    );
    expect(turtle).toContain(String.raw`solid-memo:a "Say \"hi\"\\\nthen\rgo" ;`);
    expect(turtle).toContain("solid-memo:b true ;");
    expect(turtle).toContain('solid-memo:c "2026-10-10T00:00:00Z"^^xsd:dateTime ;');
    expect(turtle).toContain('solid-memo:d "x1"^^xsd:integer ;');
    expect(turtle).toContain('solid-memo:e "maybe"^^xsd:boolean ;');
    expect(turtle).toContain('solid-memo:f "1"^^<https://other.example/type> .');
  });

  it("writes a blank node named once in place, any other by its label, and reads back as written", async () => {
    const quads = [
      quadOf(BASE, `${SM}checksum`, blank("once")),
      quadOf("_:once", `${SM}value`, literal("abc")),
      quadOf("_:once", `${SM}inner`, blank("deep")),
      quadOf("_:deep", `${SM}value`, literal("def")),
      quadOf(BASE, `${SM}shared`, blank("twice")),
      quadOf(`${BASE}#x`, `${SM}shared`, blank("twice")),
      quadOf("_:twice", `${SM}value`, literal("ghi")),
      quadOf("_:loop1", `${SM}next`, blank("loop2")),
      quadOf("_:loop2", `${SM}next`, blank("loop1")),
      quadOf(BASE, `${SM}empty`, blank("nothing")),
      quadOf("_:root", `${SM}next`, blank("leaf")),
      quadOf("_:leaf", `${SM}value`, literal("jkl")),
      quadOf("_:alone", `${SM}value`, literal("mno")),
    ];
    const turtle = turtleOf(quads, { base: BASE, prefixes: PREFIXES });
    expect(turtle).toContain(
      `solid-memo:checksum [ solid-memo:value "abc" ; solid-memo:inner [ solid-memo:value "def" ] ] ;`,
    );
    expect(turtle).toContain("solid-memo:shared _:twice");
    expect(turtle).toContain("_:twice\n    solid-memo:value");
    expect(turtle).toContain("solid-memo:empty _:nothing");
    expect(turtle).toContain("_:loop1\n    solid-memo:next _:loop2 .");
    expect(turtle).toContain("_:root\n    solid-memo:next _:leaf .");
    expect(turtle).toContain('_:alone\n    solid-memo:value "mno" .');
    const read = await quadsOfTurtle(turtle, BASE);
    expect(read).toHaveLength(quads.length);
  });

  it("writes blank nodes in place 16 deep, any deeper by their labels, so a long chain is written whole", async () => {
    const length = 50_000;
    const quads = [
      quadOf(BASE, `${SM}next`, blank("b0")),
      ...Array.from({ length }, (_, i) => quadOf(`_:b${i}`, `${SM}next`, blank(`b${i + 1}`))),
      quadOf(`_:b${length}`, `${SM}value`, literal("end")),
    ];
    const turtle = turtleOf(quads, { base: BASE, prefixes: PREFIXES });
    expect(turtle).toContain(
      `<>\n    solid-memo:next ${"[ solid-memo:next ".repeat(16)}_:b16${" ]".repeat(16)} .`,
    );
    expect(turtle).toContain("_:b16\n    solid-memo:next _:b17 .");
    expect(turtle).toContain(`_:b${length}\n    solid-memo:value "end" .`);
    const read = await quadsOfTurtle(turtle, BASE);
    expect(read).toHaveLength(quads.length);
  });
});
