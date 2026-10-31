// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Quad, Term } from "@rdfjs/types";
import { growth } from "@solid-memo/domain/testing/growth";
import { jsonLdOf, refuseRemoteContexts } from "./jsonLd";
import { termOf } from "./ntriples";
import { parseQuads } from "./client/resources";

const EX = "https://example.org/ns#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

const iri = (value: string) => ({ termType: "NamedNode", value }) as Term;
const blank = (value: string) => ({ termType: "BlankNode", value }) as Term;
const literal = (value: string, language = "", datatype = `${XSD}string`) =>
  ({
    termType: "Literal",
    value,
    language,
    datatype: iri(
      language === "" ? datatype : "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
    ),
  }) as Term;
const quad = (subject: Term, predicate: string, object: Term) =>
  ({ subject, predicate: iri(predicate), object }) as Quad;

/** The triples a JSON-LD text holds, as N-Triples lines, sorted. */
async function triplesOf(text: string): Promise<string[]> {
  const quads = await parseQuads(text, "jsonld", "https://base.example/");
  return quads
    .map((q) => `${termOf(q.subject)} ${termOf(q.predicate)} ${termOf(q.object)} .`)
    .sort();
}

describe("jsonLdOf", () => {
  const quads = [
    quad(iri(`${EX}a`), RDF_TYPE, iri(`${EX}Thing`)),
    quad(iri(`${EX}a`), RDF_TYPE, blank("t")),
    quad(iri(`${EX}a`), `${EX}name`, literal("A")),
    quad(iri(`${EX}a`), `${EX}name`, literal("Ä", "sv")),
    quad(iri(`${EX}a`), `${EX}count`, literal("3", "", `${XSD}integer`)),
    quad(iri(`${EX}a`), `${EX}weird`, literal("x", "", "https://types.example/t")),
    quad(iri(`${EX}a`), `${EX}link`, blank("b")),
    quad(iri(`${EX}a`), `${EX}link`, iri("https://elsewhere.example/a/b")),
    quad(iri(`${EX}a`), `${EX}link`, iri(`${EX}with/slash`)),
    quad(blank("b"), `${EX}name`, literal("B")),
  ];

  it("writes the triples, which read back the same", async () => {
    const text = jsonLdOf(quads, { ex: EX, xsd: XSD });
    const expected = quads.map(
      (q) => `${termOf(q.subject)} ${termOf(q.predicate)} ${termOf(q.object)} .`,
    );
    // Blank nodes get new labels when read: compare the rest.
    const named = (lines: string[]) => lines.map((line) => line.replace(/_:\w+/g, "_:"));
    expect(named(await triplesOf(text))).toEqual(named(expected).sort());
  });

  it("writes compact IRIs where the local name allows, one value bare, several as a sorted list", () => {
    const json = JSON.parse(jsonLdOf(quads, { ex: EX, xsd: XSD }));
    expect(json["@context"]).toEqual({ ex: EX, xsd: XSD });
    const a = json["@graph"].find((node: { "@id": string }) => node["@id"] === `${EX}a`);
    expect(a["@type"]).toBe("ex:Thing");
    expect(a["ex:count"]).toEqual({ "@value": "3", "@type": "xsd:integer" });
    expect(a["ex:weird"]).toEqual({ "@value": "x", "@type": "https://types.example/t" });
    expect(a["ex:name"]).toEqual(["A", { "@value": "Ä", "@language": "sv" }]);
    expect(a["ex:link"]).toEqual([
      { "@id": "_:b" },
      { "@id": "https://elsewhere.example/a/b" },
      { "@id": `${EX}with/slash` },
    ]);
    // A type that is a blank node is no @type: it stays a property.
    expect(a[RDF_TYPE]).toEqual({ "@id": "_:t" });
  });

  it("writes the same triples the same, whatever their order", () => {
    expect(jsonLdOf([...quads].reverse(), { ex: EX })).toBe(jsonLdOf(quads, { ex: EX }));
  });

  it("writes many values of one subject's property in time that grows with them, not their square", () => {
    // Eight times the values must take less than four times as long as an
    // eighth of them done eight times over (testing.md).
    const ratio = growth(
      (count) => {
        const quads = Array.from({ length: count }, (_, i) =>
          quad(iri(`${EX}s`), `${EX}p`, literal(`v${i}`)),
        );
        return () => jsonLdOf(quads, { ex: EX });
      },
      2000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});

describe("refuseRemoteContexts", () => {
  it("lets a context stated in full pass", () => {
    expect(() =>
      refuseRemoteContexts(JSON.stringify([{ "@context": { ex: EX } }, 5, null])),
    ).not.toThrow();
  });

  it("lets a context listed on each node of a top-level array pass", () => {
    const node = { "@context": [{ ex: EX }, { a: `${EX}a` }], "@id": `${EX}n`, a: "x" };
    expect(() => refuseRemoteContexts(JSON.stringify([node, node]))).not.toThrow();
  });

  it("refuses a context below the top level, which the parser applies again at every use", () => {
    const below = {
      reason: "The file states a JSON-LD context below its top level, or lists more than 8.",
    };
    for (const document of [
      // A node's own, below the top level.
      { "@context": { ex: EX }, "@graph": [{ "@context": { q: `${EX}q` }, q: "x" }] },
      [[{ "@context": { ex: EX } }]],
      // More contexts than a file needs, each built from the one before.
      { "@context": Array.from({ length: 9 }, (_, i) => ({ [`t${i}`]: `${EX}t${i}` })) },
    ]) {
      expect(() => refuseRemoteContexts(JSON.stringify(document))).toThrow(
        expect.objectContaining({ code: "deckFileUnreadable", vars: below }),
      );
    }
  });

  it("refuses a term defined by more than an IRI, which may say how the parser reads its values", () => {
    const byObject = { reason: "The file defines a JSON-LD term by more than an IRI." };
    const scoped = { "@id": `${EX}p`, "@context": { t: `${EX}t` } };
    for (const document of [
      // A @graph container, whose values the parser reads in time growing with their square.
      { "@context": { "@vocab": EX, g: { "@container": "@graph" } }, "@id": `${EX}n`, g: [] },
      { "@context": [{ ex: EX }, { g: { "@container": ["@graph", "@set"] } }], "@id": `${EX}n` },
      // A term's scoped context, and a type's.
      { "@context": { p: scoped }, "@id": `${EX}n`, p: { t: "x" } },
      { "@context": [{ ex: EX }, { T: scoped }], "@id": `${EX}n`, "@type": "T" },
      // A context that is no object of terms, or a keyword's value that is no string.
      { "@context": null, "@id": `${EX}n` },
      { "@context": { "@version": 1.1 }, "@id": `${EX}n` },
    ]) {
      expect(() => refuseRemoteContexts(JSON.stringify(document))).toThrow(
        expect.objectContaining({ code: "deckFileUnreadable", vars: byObject }),
      );
    }
  });

  it("lets a context of prefixes and keywords given as strings pass", () => {
    const context = { "@vocab": EX, "@base": EX, "@language": "en", ex: EX, p: `${EX}p` };
    expect(() =>
      refuseRemoteContexts(JSON.stringify({ "@context": context, "@id": "n", p: "x" })),
    ).not.toThrow();
  });

  it("gives the document it checked, a key named twice as JSON.parse keeps it", () => {
    expect(refuseRemoteContexts('{"@context": "https://evil.example/c", "@context": {}}')).toBe(
      '{"@context":{}}',
    );
  });

  it("writes each object's context first, before a key that reads as an integer too", () => {
    const text = '[{"5": "x", "@id": "n", "@context": {"b": "y", "1": "z"}}]';
    expect(refuseRemoteContexts(text)).toBe('[{"@context":{"1":"z","b":"y"},"5":"x","@id":"n"}]');
  });

  it("refuses a document nested deeper than a deck file's before writing it again, which could overflow the stack", () => {
    const depth = 100_000;
    const nested = `{"@context": {}, "a": ${"[".repeat(depth)}1${"]".repeat(depth)}}`;
    expect(() => refuseRemoteContexts(nested)).toThrow(
      expect.objectContaining({
        code: "deckFileUnreadable",
        vars: { reason: "The file nests deeper than 12 levels." },
      }),
    );
  });
});
