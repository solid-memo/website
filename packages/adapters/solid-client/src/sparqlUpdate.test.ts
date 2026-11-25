// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad, Term } from "@rdfjs/types";
import { describe, expect, it } from "vitest";
import { directionOf, patchBody, tripleLine } from "./sparqlUpdate";

const DOC = "https://pod.example/deck.ttl";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const named = (value: string) => ({ termType: "NamedNode", value }) as Term;
const blank = (value: string) => ({ termType: "BlankNode", value }) as Term;
const literal = (value: string, datatype = `${XSD}string`, language = "", direction = "") =>
  ({ termType: "Literal", value, language, datatype: named(datatype), direction }) as Term;
const quad = (subject: Term, object: Term, predicate = named(`${DOC}#p`)) =>
  ({ subject, predicate, object, graph: { termType: "DefaultGraph", value: "" } }) as Quad;
/** The document's own IRIs by their fragment, as a PATCH of it names them. */
const localNameOf = (iri: string) =>
  iri.startsWith(`${DOC}#`) ? iri.slice(DOC.length + 1) : undefined;

describe("patchBody", () => {
  it("is none without changes, and empty for changes of nothing", () => {
    expect(patchBody(undefined, localNameOf)).toBeNull();
    expect(patchBody({ deletions: [], additions: [] }, localNameOf)).toBe("");
  });

  it("deletes, then inserts, naming the document's own IRIs by fragment and any other in full", () => {
    const body = patchBody(
      {
        deletions: [quad(named(`${DOC}#a`), literal("old"))],
        additions: [quad(named(`${DOC}#a`), named("https://other.example/x"))],
      },
      localNameOf,
    );
    expect(body).toBe(
      'DELETE DATA {\n<#a> <#p> "old" .\n};\nINSERT DATA {\n<#a> <#p> <https://other.example/x> .\n};\n',
    );
  });

  it("is none when a change names a blank node, which it cannot write", () => {
    expect(
      patchBody({ deletions: [], additions: [quad(named(`${DOC}#a`), blank("b"))] }, localNameOf),
    ).toBeNull();
    expect(
      patchBody({ deletions: [quad(blank("b"), literal("x"))], additions: [] }, localNameOf),
    ).toBeNull();
  });

  it("deletes decimals as numbers when asked, as a server that stored them so reads them", () => {
    const changes = {
      deletions: [quad(named(`${DOC}#a`), literal("1.50", `${XSD}decimal`))],
      additions: [quad(named(`${DOC}#a`), literal("1.50", `${XSD}decimal`))],
    };
    expect(patchBody(changes, localNameOf, true)).toBe(
      `DELETE DATA {\n<#a> <#p> "1.5"^^<${XSD}decimal> .\n};\nINSERT DATA {\n<#a> <#p> "1.50"^^<${XSD}decimal> .\n};\n`,
    );
  });
});

describe("tripleLine", () => {
  it("escapes a literal's text, and writes its language and direction, or its datatype", () => {
    const subject = named(`${DOC}#a`);
    expect(tripleLine(quad(subject, literal('a "b"\\\nc\rd')), localNameOf, false)).toBe(
      '<#a> <#p> "a \\"b\\"\\\\\\nc\\rd" .',
    );
    expect(
      tripleLine(quad(subject, literal("مرحبا", `${XSD}string`, "ar", "rtl")), localNameOf, false),
    ).toBe('<#a> <#p> "مرحبا"@ar--rtl .');
    expect(tripleLine(quad(subject, literal("1", `${XSD}integer`)), localNameOf, false)).toBe(
      `<#a> <#p> "1"^^<${XSD}integer> .`,
    );
  });
});

describe("directionOf", () => {
  it("is the direction after two dashes, or nothing for none", () => {
    expect(directionOf({ direction: "ltr" })).toBe("--ltr");
    expect(directionOf({ direction: null })).toBe("");
    expect(directionOf({})).toBe("");
  });
});
