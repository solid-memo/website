// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Quad, Term } from "@rdfjs/types";
import { growth } from "@solid-memo/domain/testing/growth";
import { jsonLdOf, refuseRemoteContexts as refuseIn } from "./jsonLd";
import { termOf } from "./ntriples";
import { MAX_TERM_CHARACTERS } from "./client/readLimits";
import { parseQuads } from "./client/resources";

const EX = "https://example.org/ns#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/** Why a document of too many values that make no triple, or that nest in arrays, is refused. */
const nothingReason =
  "The file has more than 4096 values that state nothing, or that sit in an array in another array.";

/** The check of a document read with no base of its own. */
const refuseRemoteContexts = (text: string) => refuseIn(text, "", null);

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

  it("writes a literal's base direction, which reads back the same", async () => {
    const directional = {
      termType: "Literal",
      value: "مرحبا",
      language: "ar",
      direction: "rtl",
      datatype: iri("http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString"),
    } as Term;
    const text = jsonLdOf([quad(iri(`${EX}a`), `${EX}name`, directional)], { ex: EX });
    expect(JSON.parse(text)["@graph"][0]["ex:name"]).toEqual({
      "@value": "مرحبا",
      "@language": "ar",
      "@direction": "rtl",
    });
    expect(await triplesOf(text)).toEqual([`<${EX}a> <${EX}name> "مرحبا"@ar--rtl .`]);
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

  it("refuses a string or key longer than a term may be, counted as JSON.parse gives it, before parsing", () => {
    const long = {
      reason: `The file has a text or key longer than ${MAX_TERM_CHARACTERS} characters.`,
    };
    const at = "k".repeat(MAX_TERM_CHARACTERS);
    // An escape is one character: a line feed, a quote, a backslash and a `\u` escape alike.
    const escaped = `\\n\\"\\\\\\u00e5${"k".repeat(MAX_TERM_CHARACTERS - 4)}`;
    for (const within of [
      JSON.stringify({ "@id": `${EX}n`, [at]: 1 }),
      JSON.stringify({ "@id": `${EX}n`, [`${EX}p`]: at }),
      `{"@id": "${EX}n", "${escaped}": 1}`,
    ]) {
      expect(() => refuseRemoteContexts(within)).not.toThrow();
    }
    for (const past of [
      // A key the context doesn't map makes no triple to bound.
      JSON.stringify({ "@id": `${EX}n`, [`${at}k`]: 1 }),
      JSON.stringify({ "@id": `${EX}n`, [`${EX}p`]: `${at}k` }),
      `{"@id": "${EX}n", "${escaped}k": 1}`,
      // A string the text ends in.
      `{"@id": "${at}k`,
    ]) {
      expect(() => refuseRemoteContexts(past)).toThrow(
        expect.objectContaining({ code: "deckFileUnreadable", vars: long }),
      );
    }
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
    expect(() => refuseIn(text(`https://pod.example/${"b".repeat(490)}`), url, null)).not.toThrow();
    expect(() => refuseIn(text(`${"b".repeat(200)}/`), url, null)).toThrow(
      expect.objectContaining({ code: "deckFileUnreadable", vars: { reason } }),
    );
    expect(() => refuseIn(text("b/"), `https://pod.example/${"a".repeat(512)}`, null)).toThrow(
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

  it("refuses more values that make no triple than a few thousand, before the parser reads them (GHSA-96cg-w2x5-fpf4)", () => {
    const refused = expect.objectContaining({
      code: "deckFileUnreadable",
      vars: { reason: nothingReason },
    });
    const values = (value: string, count: number) =>
      `{"@context":{"ex":"${EX}"},"@id":"ex:s","ex:p":[${Array(count).fill(value).join(",")}]}`;
    for (const value of ["null", "[]", "{}", '{"@value":null}', '{"@set":[]}']) {
      expect(() => refuseRemoteContexts(values(value, 4_096))).not.toThrow();
      expect(() => refuseRemoteContexts(values(value, 4_097))).toThrow(refused);
      // A file of nothing else, as large as a deck file may be, is refused too.
      expect(() => refuseRemoteContexts(values(value, 100_000))).toThrow(refused);
    }
    // A string, number or boolean where a node belongs states nothing either.
    for (const key of ["@graph", "@included"]) {
      const nodes = (count: number) =>
        `{"@context":{"ex":"${EX}"},"${key}":[${Array(count).fill('"a"').join(",")}]}`;
      expect(() => refuseRemoteContexts(nodes(4_096))).not.toThrow();
      expect(() => refuseRemoteContexts(nodes(4_097))).toThrow(refused);
    }
    expect(() => refuseRemoteContexts(`[${Array(4_097).fill("1").join(",")}]`)).toThrow(refused);
    expect(() =>
      refuseRemoteContexts(
        `{"@graph":{"@id":"${EX}s","${EX}p":[${Array(10_000).fill("true").join(",")}]}}`,
      ),
    ).not.toThrow();
    // The empty array of an `@list`, or of a list in it, is rdf:nil, a triple.
    expect(() => refuseRemoteContexts(values('{"@list":[]}', 10_000))).not.toThrow();
    expect(() => refuseRemoteContexts(values('{"@list":[[[]]]}', 10_000))).not.toThrow();
  });

  it("refuses more values in an array in another array than a few thousand, which take the parser the more time the deeper they nest (GHSA-96cg-w2x5-fpf4)", () => {
    const refused = expect.objectContaining({
      code: "deckFileUnreadable",
      vars: { reason: nothingReason },
    });
    const nested = (key: string, depth: number, count: number) =>
      `{"@context":{"ex":"${EX}"},"@id":"ex:s","${key}":${"[".repeat(depth - 1)}[${Array(count).fill('"a"').join(",")}]${"]".repeat(depth - 1)}}`;
    for (const key of ["@graph", "ex:p", "zz"]) {
      // Each array in another counts, and each value in one.
      expect(() => refuseRemoteContexts(nested(key, 2, 4_096))).not.toThrow();
      expect(() => refuseRemoteContexts(nested(key, 2, 4_097))).toThrow(refused);
      expect(() => refuseRemoteContexts(nested(key, 11, 4_087))).not.toThrow();
      expect(() => refuseRemoteContexts(nested(key, 11, 4_088))).toThrow(refused);
      expect(() => refuseRemoteContexts(nested(key, 11, 1_000_000))).toThrow(refused);
    }
    // In one array, or in an object in an array, they don't count, but where nodes belong.
    expect(() => refuseRemoteContexts(nested("ex:p", 1, 10_000))).not.toThrow();
    expect(() => refuseRemoteContexts(nested("zz", 1, 10_000))).not.toThrow();
    const strings = Array(10_000).fill('"a"').join(",");
    const inObjects = `{"@context":{"ex":"${EX}"},"@id":"ex:s","ex:p":[{"ex:q":[{"ex:q":[${strings}]}]}]}`;
    expect(() => refuseRemoteContexts(inObjects)).not.toThrow();
    // A `@set` object is the array it holds, under an alias too.
    for (const set of ["@set", "s"]) {
      const inSets = `{"@context":{"ex":"${EX}","s":"@set"},"@id":"ex:s","ex:p":[{"${set}":[{"${set}":[${strings}]}]}]}`;
      expect(() => refuseRemoteContexts(inSets)).toThrow(refused);
    }
    // Nor do lists of lists.
    const lists = `{"@context":{"ex":"${EX}"},"@id":"ex:s","ex:p":{"@list":[[[${Array(10_000).fill('"a"').join(",")}]]]}}`;
    expect(() => refuseRemoteContexts(lists)).not.toThrow();
  });

  it("refuses strings where nodes belong in `@set` objects as in arrays, at any depth (GHSA-96cg-w2x5-fpf4)", () => {
    const refused = expect.objectContaining({
      code: "deckFileUnreadable",
      vars: { reason: nothingReason },
    });
    const graph = (depth: number, count: number) =>
      `{"@context":{"ex":"${EX}"},"@graph":${'{"@set":['.repeat(depth)}${Array(count).fill('"a"').join(",")}${"]}".repeat(depth)}}`;
    for (const depth of [1, 2, 5]) {
      // Each string counts, and each `@set` object, and its array, in an array in another.
      const sets = 2 * Math.max(0, depth - 2);
      expect(() => refuseRemoteContexts(graph(depth, 4_096 - sets))).not.toThrow();
      expect(() => refuseRemoteContexts(graph(depth, 4_097 - sets))).toThrow(refused);
      expect(() => refuseRemoteContexts(graph(depth, 1_000_000))).toThrow(refused);
    }
    // A node in a `@set` where nodes belong is one, and states something.
    const nodes = `{"@context":{"ex":"${EX}"},"@graph":{"@set":[${Array(10_000).fill('{"ex:p":"a"}').join(",")}]}}`;
    expect(() => refuseRemoteContexts(nodes)).not.toThrow();
  });

  it("refuses values that take more work than the limits allow for each triple, as too large, the more work the deeper they sit, and counts none with no limits (GHSA-96cg-w2x5-fpf4)", async () => {
    const limits = { bytes: 1024 * 1024, quads: 100, characters: 1024 * 1024 };
    const tooLarge = expect.objectContaining({ code: "deckFileTooLarge", vars: limits });
    const strings = (count: number) => Array.from({ length: count }, (_, at) => `"v${at}"`).join();
    const text = (values: string) => `{"@context":{"ex":"${EX}"},"@id":"ex:s","ex:p":${values}}`;
    // 2,600 in all: 47 for the document, its context, its prefix, the id and the array, then 14 for each
    // string: 8, 4 for a literal, and 2 for the two containers above it.
    expect(() => refuseIn(text(`[${strings(182)}]`), "", limits)).not.toThrow();
    expect(() => refuseIn(text(`[${strings(183)}]`), "", limits)).toThrow(tooLarge);
    expect(() => refuseIn(text(`[${strings(10_000)}]`), "", null)).not.toThrow();
    // In an array in another, 19 each: 4 more for that array, 1 for the container; in a `@set` object in
    // one too, 21.
    expect(() => refuseIn(text(`[[${strings(133)}]]`), "", limits)).not.toThrow();
    expect(() => refuseIn(text(`[[${strings(134)}]]`), "", limits)).toThrow(tooLarge);
    const sets = (count: number) => text(`{"@set":[{"@set":[${strings(count)}]}]}`);
    expect(() => refuseIn(sets(120), "", limits)).not.toThrow();
    expect(() => refuseIn(sets(121), "", limits)).toThrow(tooLarge);
    // A value object is a value, 10, and its value and language 5 each, as keywords' strings, under an alias
    // too; its index takes a literal's work, 15.
    const values = (count: number, value: string, context = "") =>
      `{"@context":{"ex":"${EX}"${context}},"@id":"ex:s","ex:p":[${Array(count).fill(value).join()}]}`;
    const tagged = '{"@value":"a","@language":"en"}';
    expect(() => refuseIn(values(127, tagged), "", limits)).not.toThrow();
    expect(() => refuseIn(values(128, tagged), "", limits)).toThrow(tooLarge);
    const aliased = (count: number) => values(count, '{"v":"a","@language":"en"}', ',"v":"@value"');
    expect(() => refuseIn(aliased(127), "", limits)).not.toThrow();
    expect(() => refuseIn(aliased(128), "", limits)).toThrow(tooLarge);
    const indexed = '{"@value":"a","@index":"i"}';
    expect(() => refuseIn(values(85, indexed), "", limits)).not.toThrow();
    expect(() => refuseIn(values(86, indexed), "", limits)).toThrow(tooLarge);
    // The app's own file takes less work for each triple it states.
    const quads = Array.from({ length: 100 }, (_, at) =>
      quad(iri(`${EX}s${at % 10}`), `${EX}p`, literal(`v${at}`, at % 2 === 0 ? "en" : "")),
    );
    const written = jsonLdOf(quads, { ex: EX });
    expect(() => refuseIn(written, "", limits)).not.toThrow();
    expect(await parseQuads(written, "jsonld", EX)).toHaveLength(100);
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
