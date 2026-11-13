// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad, Term } from "@rdfjs/types";
import { describe, expect, it } from "vitest";
import { renamedCatalog } from "@solid-memo/domain/catalog";
import { deckGroupToRecord } from "@solid-memo/domain/deckGroupRecord";
import type { LangText } from "@solid-memo/domain/langText";
import { attributionText, checkActivityTriples } from "@solid-memo/domain/release/releaseDraft";
import { MAX_TERM_CHARACTERS, termKeyLength } from "./client/readLimits";
import { refuseUnwritable, unwritableTermOf } from "./writableTerms";

const DIR_LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString";
const LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";
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
    ["text with a base direction read from a pod", literal("a", "ar", DIR_LANG_STRING, "rtl")],
    ["text with a left-to-right direction", literal("a", "en-gb", DIR_LANG_STRING, "ltr")],
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
      "text typed as having a base direction without a language",
      literal("a", "", DIR_LANG_STRING, "rtl"),
    ],
    ["text typed as having a base direction without one", literal("a", "ar", DIR_LANG_STRING)],
    [
      "text typed as having a base direction without one at all",
      { ...literal("a", "ar", DIR_LANG_STRING), direction: undefined } as Term,
    ],
    ["a base direction RDF does not have", literal("a", "ar", DIR_LANG_STRING, "up")],
    [
      "a base direction on text typed as in a language only",
      literal("a", "ar", LANG_STRING, "rtl"),
    ],
    ["a base direction on text in no language", literal("a", "", undefined, "rtl")],
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

  it("throws termTooLong for a term longer than any read takes in, as it would be read back", () => {
    const limit = MAX_TERM_CHARACTERS;
    const blank = (length: number) =>
      ({ termType: "BlankNode", value: "b".repeat(length) }) as Term;
    // A text is named in quotes, its quotes and line breaks escaped, an IRI in `<>`; a blank node's label
    // gets a parser's prefix as it is read.
    for (const within of [
      quad(literal("x".repeat(limit - 2))),
      quad(literal(`\n\r"${"x".repeat(limit - 8)}`)),
      quad(named(`https://pod.example/${"i".repeat(limit - 22)}`)),
      quad(named("https://pod.example/o"), blank(limit - 34)),
    ]) {
      expect(() => refuseUnwritable([within])).not.toThrow();
    }
    for (const past of [
      quad(literal("x".repeat(limit - 1))),
      quad(literal("x".repeat(limit - 4), "sv")),
      quad(literal(`\n\r"${"x".repeat(limit - 7)}`)),
      quad(named(`https://pod.example/${"i".repeat(limit - 21)}`)),
      quad(named("https://pod.example/o"), blank(limit - 33)),
      quad(named("https://pod.example/o"), undefined, named("x".repeat(limit + 1))),
    ]) {
      expect(() => refuseUnwritable([past])).toThrow(
        expect.objectContaining({ code: "termTooLong", vars: { limit } }),
      );
    }
  });
});

describe("a default description the app writes for a name as long as a term (GHSA-g598-pfpq-4whv)", () => {
  const GROUP = "https://pod.example/memo/catalog.ttl#group";
  const PUBLISHER = "https://pod.example/profile/card#me";

  it("is writable for a group whose name the read kept, in English or Swedish", () => {
    for (const length of [16_362, 16_363, 16_366, 16_370, 16_378]) {
      const titles: LangText[] = [
        { en: "Group", sv: "å".repeat(length) },
        { en: "g".repeat(length) },
      ];
      for (const title of titles) {
        // As another app may have stored the group: the English-only default description.
        const previous = {
          title,
          description: { en: `Deck group: ${title.en}.` },
          publisher: PUBLISHER,
          dataset: [],
          catalog: [],
        };
        // What a tree edit that touches the group writes.
        const { description } = deckGroupToRecord(
          { group: { url: GROUP, title }, decks: [], groups: [] },
          PUBLISHER,
          previous,
        );
        for (const [language, text] of Object.entries(description)) {
          const term = literal(text ?? "", language);
          expect(termKeyLength(term)).toBeLessThanOrEqual(MAX_TERM_CHARACTERS);
          expect(() => refuseUnwritable([quad(term)])).not.toThrow();
        }
      }
    }
  });

  it("is writable for a catalog whose instance has a name as long as a term", () => {
    const old = "n".repeat(16_370);
    const catalog = {
      title: old,
      description: `Flashcard decks of the Solid Memo instance ${old}.`,
      publisher: { webId: PUBLISHER, name: "Alice" },
    };
    for (const length of [16_330, 16_340, 16_370, 16_381]) {
      const { description } = renamedCatalog(catalog, "m".repeat(length));
      expect(termKeyLength(literal(description))).toBeLessThanOrEqual(MAX_TERM_CHARACTERS);
      expect(() => refuseUnwritable([quad(literal(description))])).not.toThrow();
    }
  });

  it("is writable for a release's check and attribution around texts as long as a term", () => {
    const writable = (text: string, language: string) => {
      const term = literal(text, language);
      expect(termKeyLength(term)).toBeLessThanOrEqual(MAX_TERM_CHARACTERS);
      expect(() => refuseUnwritable([quad(term)])).not.toThrow();
    };
    for (const length of [16_330, 16_350, 16_370, 16_378]) {
      const text = "t".repeat(length);
      for (const language of ["en", "sv"]) {
        for (const check of ["machine", "ai"] as const) {
          const said = checkActivityTriples("https://pod.example/memo/release.ttl#review-1", {
            check,
            label: check === "ai" ? text : "Checks",
            scope: text,
            outcome: text,
            endedAt: "2026-11-13T12:00:00Z",
            language,
          });
          for (const { object } of said)
            if (object.kind === "literal" && object.language !== "")
              writable(object.value, object.language);
        }
        for (const ai of [false, true]) {
          writable(attributionText([text], ai, language), language);
          writable(
            attributionText([text.slice(0, length / 2), text, "Bo"], ai, language),
            language,
          );
        }
      }
    }
  });
});
