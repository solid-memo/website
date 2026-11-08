// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { MAX_TERM_CHARACTERS } from "./client/readLimits";
import { TripleLines, triplesOf } from "./ntriples";

const DOC = "https://pod.example/doc.ttl";

describe("triplesOf", () => {
  it("writes every kind of term as Solid Memo's PATCH bodies do", async () => {
    const triples = await triplesOf(
      DOC,
      `<#a> <#p> [ <#q> "x" ] ; <#r> "say \\"hi\\"\\n\\r\\\\"@en , 3 , "plain" , "مرحبا"@ar--rtl .`,
    );
    const lines = [...triples];
    expect(lines).toContain(`<${DOC}#a> <${DOC}#r> "say \\"hi\\"\\n\\r\\\\"@en .`);
    expect(lines).toContain(
      `<${DOC}#a> <${DOC}#r> "3"^^<http://www.w3.org/2001/XMLSchema#integer> .`,
    );
    expect(lines).toContain(`<${DOC}#a> <${DOC}#r> "plain" .`);
    expect(lines).toContain(`<${DOC}#a> <${DOC}#r> "مرحبا"@ar--rtl .`);
    const blank = lines.find((line) => line.startsWith(`<${DOC}#a> <${DOC}#p> _:`))!;
    const node = blank.split(" ")[2]!;
    expect(lines).toContain(`${node} <${DOC}#q> "x" .`);
  });

  it("rejects what does not parse", async () => {
    await expect(triplesOf(DOC, "<#a> <#p")).rejects.toThrow();
  });
});

describe("TripleLines", () => {
  const long = (end: string, start = "") =>
    `<${DOC}#a> <${DOC}#p> "${start}${"x".repeat(MAX_TERM_CHARACTERS)}${end}" .`;

  it("holds each line once, in the order each was first added, as a Set does", () => {
    const lines = new TripleLines(["b", "a", "b"]);
    lines.add("c");
    lines.add("a");
    lines.delete("b");
    lines.delete("d");
    lines.add("b");
    expect([...lines]).toEqual(["a", "c", "b"]);
  });

  it("tells lines past the bound on a term apart wherever they differ", () => {
    const lines = new TripleLines([long("1"), long("2"), long("1", "y"), long("1")]);
    expect([...lines]).toEqual([long("1"), long("2"), long("1", "y")]);
    lines.delete(long("2"));
    expect([...lines]).toEqual([long("1"), long("1", "y")]);
  });

  it("keeps a document's lines once", async () => {
    expect([...(await triplesOf(DOC, "<#a> <#p> 1 . <#a> <#p> 1 ."))]).toHaveLength(1);
  });
});
