// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad, Term } from "@rdfjs/types";
import { describe, expect, it } from "vitest";
import { refuseUnwritable, unwritableTermOf } from "./writableTerms";

const named = (value: string) => ({ termType: "NamedNode", value }) as Term;
const literal = (
  value: string,
  language = "",
  datatype = "http://www.w3.org/2001/XMLSchema#string",
  direction = "",
) => ({ termType: "Literal", value, language, datatype: named(datatype), direction }) as Term;
const quad = (
  object: Term,
  subject: Term = named("https://pod.example/d#s"),
  graph: Term = { termType: "DefaultGraph", value: "" } as Term,
) => ({ subject, predicate: named("https://example.com/ns#p"), object, graph }) as Quad;

describe("unwritableTermOf", () => {
  it.each([
    ["an IRI", named("https://pod.example/d#é?a=%20")],
    ["a blank node", { termType: "BlankNode", value: "b0_x-1.y" } as Term],
    ["a blank node labelled in another script", { termType: "BlankNode", value: "카드1" } as Term],
    [
      "a blank node label with an inner dot and a final dash",
      { termType: "BlankNode", value: "a.b-" } as Term,
    ],
    ["text with anything in it", literal('a> . <b> "c', "en-GB")],
    ["a language tag with subtags of 8 characters", literal("a", "abcdefgh-12345678")],
    ["a literal without a direction", { ...literal("a"), direction: undefined } as Term],
  ])("finds none in %s", (_, term) => {
    expect(unwritableTermOf(quad(term))).toBeUndefined();
  });

  it.each([
    ["an IRI with >", named("https://img.example/a.png#p> . <https://evil.example/s")],
    ["an IRI with a space", named("https://img.example/a b")],
    ["a blank node label with a space", { termType: "BlankNode", value: "b x" } as Term],
    ["a blank node label ending in a dot", { termType: "BlankNode", value: "b." } as Term],
    [
      "a blank node label with a letter Turtle does not read",
      { termType: "BlankNode", value: "aª" } as Term,
    ],
    ["a blank node label with a circled digit", { termType: "BlankNode", value: "x①" } as Term],
    [
      "text typed as in a language without one",
      literal("a", "", "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString"),
    ],
    ["a datatype with >", literal("1", "", "https://t.example/t> . <x")],
    ["a language tag with a space", literal("a", "en . <x")],
    ["a language subtag longer than 8 characters", literal("a", "constructor")],
    ["a later subtag longer than 8 characters", literal("a", "en-123456789")],
    [
      "a base direction",
      literal("a", "ar", "http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString", "rtl"),
    ],
    ["a quoted triple", { termType: "Quad", value: "" } as unknown as Term],
  ])("finds %s", (_, term) => {
    expect(unwritableTermOf(quad(term))).toBe(term);
  });

  it("looks at the subject and the graph too", () => {
    const bad = named("https://pod.example/d#a>b");
    expect(unwritableTermOf(quad(named("https://pod.example/o"), bad))).toBe(bad);
    expect(unwritableTermOf(quad(named("https://pod.example/o"), undefined, bad))).toBe(bad);
  });
});

describe("refuseUnwritable", () => {
  it("throws unwritableTerm naming the first such term, and nothing for none", () => {
    expect(() => refuseUnwritable([quad(named("https://pod.example/o"))])).not.toThrow();
    expect(() =>
      refuseUnwritable([quad(named("https://pod.example/o")), quad(named("a b"))]),
    ).toThrow(
      expect.objectContaining({
        code: "unwritableTerm",
        detail: 'term: {"termType":"NamedNode","value":"a b"}',
      }),
    );
  });
});
