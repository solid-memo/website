// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Quad, Term } from "@rdfjs/types";
import { growth } from "@solid-memo/domain/testing/growth";
import { jsonLdOf, refuseRemoteContexts as refuseIn } from "./jsonLd";
import { termOf } from "./ntriples";
import { parseQuads } from "./client/resources";

const EX = "https://example.org/ns#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/** The check of a document read with no base of its own. */
const refuseRemoteContexts = (text: string) => refuseIn(text, "");

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

  it("lets plain bases and vocabularies of at most 512 characters together pass (GHSA-3jqf-v8x6-qcc3)", () => {
    const long = `https://pod.example/${"a".repeat(512 - 20)}`;
    for (const context of [
      { "@base": long, "@vocab": long },
      [{ "@base": "https://pod.example/a/" }, { "@base": "b/" }],
      { "@base": "", "@vocab": "#" },
    ]) {
      expect(() =>
        refuseRemoteContexts(JSON.stringify({ "@context": context, "@id": "n" })),
      ).not.toThrow();
    }
  });

  it("refuses a base or a vocabulary that is long or not plain, which the parser walks for every IRI (GHSA-3jqf-v8x6-qcc3)", () => {
    const long = `https://pod.example/${"a".repeat(512 - 19)}`;
    for (const keyword of ["@base", "@vocab"]) {
      const reason = `The file declares a JSON-LD ${keyword} that is not plain, or longer than 512 characters.`;
      for (const context of [
        { [keyword]: long },
        { [keyword]: `https://pod.example/${"../".repeat(10)}` },
        { [keyword]: "https://pod.example/a//b/" },
        // Each resolves against the one before: together, past the bound.
        Array.from({ length: 8 }, () => ({ [keyword]: `${"a".repeat(64)}/` })),
      ]) {
        expect(() =>
          refuseRemoteContexts(JSON.stringify({ "@context": context, "@id": "n" })),
        ).toThrow(expect.objectContaining({ code: "deckFileUnreadable", vars: { reason } }));
      }
    }
  });

  it("lets terms defined as keywords, or as plain IRIs with a scheme, of at most 4096 characters in all pass (GHSA-3jqf-v8x6-qcc3)", () => {
    const long = `https://pod.example/${"a".repeat(512 - 20)}`;
    for (const context of [
      { id: "@id", ex: EX, p: `${EX}p`, q: "urn:q", "@language": "en" },
      // A compact IRI through a prefix no context of the node defines.
      { p: "ex:p", "@vocab": "ex:" },
      // Each term and its IRI, 512 characters: 4096 in all.
      Array.from({ length: 8 }, (_, at) => ({ [`t${at}`]: long.slice(0, -2) })),
    ]) {
      expect(() =>
        refuseRemoteContexts(JSON.stringify({ "@context": context, "@id": "n" })),
      ).not.toThrow();
    }
  });

  it("refuses a term defined as a relative, long or not plain IRI, or contexts past 4096 characters, which the parser gives again at every use (GHSA-3jqf-v8x6-qcc3)", () => {
    const reason =
      "The file defines a JSON-LD term by an IRI that is relative, not plain, or longer than 512 characters, or states contexts of more than 4096 characters.";
    const long = `https://pod.example/${"a".repeat(512 - 19)}`;
    for (const context of [
      { p: "a/" },
      { p: "../" },
      { p: "_:b" },
      { p: long },
      { "@language": "a".repeat(513) },
      { p: `${EX.slice(0, -1)}/../` },
      { p: "https://pod.example/a//b/" },
      // Each within the bound, together past it.
      Array.from({ length: 8 }, (_, at) => ({ [`t${at}`]: long.slice(0, -2) })),
      { [`t${"a".repeat(4096)}`]: EX },
    ]) {
      expect(() =>
        refuseRemoteContexts(JSON.stringify({ "@context": context, "@id": "n" })),
      ).toThrow(expect.objectContaining({ code: "deckFileUnreadable", vars: { reason } }));
    }
  });

  it("counts the document's own base toward the bound, as for Turtle (GHSA-3jqf-v8x6-qcc3)", () => {
    const url = `https://pod.example/${"a".repeat(400 - 20)}`;
    const reason =
      "The file declares a JSON-LD @base that is not plain, or longer than 512 characters.";
    const text = (base: string) => JSON.stringify({ "@context": { "@base": base }, "@id": "n" });
    // An absolute base replaces the document's; a relative one adds to it.
    expect(() => refuseIn(text(`https://pod.example/${"b".repeat(490)}`), url)).not.toThrow();
    expect(() => refuseIn(text(`${"b".repeat(200)}/`), url)).toThrow(
      expect.objectContaining({ code: "deckFileUnreadable", vars: { reason } }),
    );
    expect(() => refuseIn(text("b/"), `https://pod.example/${"a".repeat(512)}`)).toThrow(
      expect.objectContaining({ code: "deckFileUnreadable", vars: { reason } }),
    );
  });

  it("refuses a term, base or vocabulary defined through a term of the node's contexts, which the parser expands with no bound (GHSA-3jqf-v8x6-qcc3)", () => {
    const reason = "The file defines a JSON-LD term, base or vocabulary through another term.";
    for (const context of [
      { a: "b:x/", b: "a:y/" },
      { a: "a:x/" },
      { ex: EX, p: "ex:p" },
      [{ ex: EX }, { "@vocab": "ex:" }],
      { ex: EX, "@base": "ex:a/" },
    ]) {
      expect(() =>
        refuseRemoteContexts(JSON.stringify({ "@context": context, "@id": "n" })),
      ).toThrow(expect.objectContaining({ code: "deckFileUnreadable", vars: { reason } }));
    }
  });

  it("gives the document it checked, a key named twice as JSON.parse keeps it", () => {
    expect(refuseRemoteContexts('{"@context": "https://evil.example/c", "@context": {}}')).toBe(
      '{"@context":{}}',
    );
  });

  it("writes each object's context first, before a key that reads as an integer too", () => {
    const text = '[{"5": "x", "@id": "n", "@context": {"b": "ex:y", "1": "ex:z"}}]';
    expect(refuseRemoteContexts(text)).toBe(
      '[{"@context":{"1":"ex:z","b":"ex:y"},"5":"x","@id":"n"}]',
    );
  });

  it("refuses an RDF-star annotation or triple term, however its keyword is named", () => {
    const refused = expect.objectContaining({
      code: "deckFileUnreadable",
      vars: { reason: "The file states an RDF-star annotation or triple term." },
    });
    const context = { ex: EX };
    for (const document of [
      {
        "@context": context,
        "@graph": [{ "@id": "ex:a", "ex:p": { "@value": "x", "@annotation": { "ex:q": "y" } } }],
      },
      { "@context": { ...context, note: "@annotation" }, "@id": "ex:a", "ex:p": "x" },
      { "@context": context, "@id": { "@id": "ex:a", "ex:p": "x" }, "ex:q": "y" },
      { "@context": context, "@id": ["ex:b", { "@id": "ex:a", "ex:p": "x" }], "ex:q": "y" },
      { "@context": { ...context, id: "@id" }, "@graph": [{ id: [{ "@id": "ex:a" }] }] },
      // The check is the whole document's: an alias given an object elsewhere, or a key in a JSON literal.
      [
        { "@context": { ...context, id: "@id" }, "@id": "ex:a" },
        { "@context": context, "ex:p": { id: {} } },
      ],
      {
        "@context": context,
        "@id": "ex:a",
        "ex:p": { "@type": "@json", "@value": { "@annotation": 1 } },
      },
      [
        {
          "@context": { ...context, id: "@id" },
          "@graph": [{ id: { "@id": "ex:a", "ex:p": "x" } }],
        },
      ],
    ]) {
      expect(() => refuseRemoteContexts(JSON.stringify(document))).toThrow(refused);
    }
    // A node given as an object under a property, or an alias of @id given a string, is no triple term.
    const plain = {
      "@context": { ...context, id: "@id" },
      id: "ex:a",
      "ex:p": { "@id": "ex:b", "ex:q": [{ "@value": "y" }] },
    };
    expect(() => refuseRemoteContexts(JSON.stringify(plain))).not.toThrow();
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
