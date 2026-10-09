import { describe, expect, it } from "vitest";
import { parseTurtle } from "./linearDataset";
import { sameStatements } from "./statements";

const DOC = "https://pod.example/a.ttl";
const COPY = "https://pod.example/copy/a.ttl";
const read = (turtle: string, base = DOC) => parseTurtle(`@prefix x: <http://www.w3.org/2001/XMLSchema#> . ${turtle}`, base);
const same = async (a: string, b: string) => sameStatements(await read(a), await read(b));

describe("sameStatements", () => {
  it("holds for documents saying the same however each is written", async () => {
    expect(await same(`<#a> <#p> "x" ; <#q> <#b> .`, `<#a> <#q> <#b> .\n# a comment\n<#a> <#p> "x" .`)).toBe(true);
    expect(await same(`<#a> <#p> "x"@EN-gb .`, `<#a> <#p> "x"@en-GB .`)).toBe(true);
    expect(await same(`<#a> <#p> [ <#q> "y" ] .`, `<#a> <#p> _:other . _:other <#q> "y" .`)).toBe(true);
    expect(await same(`<#a> <#p> "x", "x" .`, `<#a> <#p> "x" .`)).toBe(true);
  });

  it("reads a number or a truth value in any of its spellings", async () => {
    expect(await same(`<#a> <#p> 2.50, -0.0, "007."^^x:decimal, ".5"^^x:decimal, -1.10 .`, `<#a> <#p> 2.5, 0.0, 7.0, 0.5, -1.1 .`)).toBe(true);
    expect(await same(`<#a> <#p> "+0042"^^x:integer, "1"^^x:boolean, "0"^^x:boolean .`, `<#a> <#p> 42, true, false .`)).toBe(true);
    expect(await same(`<#a> <#p> 1.0E2, "INF"^^x:double, "-INF"^^x:float, "NaN"^^x:double .`, `<#a> <#p> 100e0, "Infinity"^^x:double, "-Infinity"^^x:float, "NaN"^^x:double .`)).toBe(true);
    expect(await same(`<#a> <#p> "12"^^x:unsignedByte .`, `<#a> <#p> "012"^^x:unsignedByte .`)).toBe(true);
    // Values that are none of their datatype's are compared as written.
    expect(await same(`<#a> <#p> "1.2.3"^^x:decimal, "lots"^^x:double, "yes"^^x:boolean, "1.5"^^x:integer .`, `<#a> <#p> "1.2.3"^^x:decimal, "lots"^^x:double, "yes"^^x:boolean, "1.5"^^x:integer .`)).toBe(true);
    expect(await same(`<#a> <#p> "1.2.3"^^x:decimal .`, `<#a> <#p> "1.23"^^x:decimal .`)).toBe(false);
  });

  it("fails on a statement more, less or other, or a value of another datatype or language", async () => {
    expect(await same(`<#a> <#p> "x" .`, `<#a> <#p> "x" ; <#q> "y" .`)).toBe(false);
    expect(await same(`<#a> <#p> "x" .`, `<#a> <#p> "y" .`)).toBe(false);
    expect(await same(`<#a> <#p> "2"^^x:integer .`, `<#a> <#p> "2"^^x:decimal .`)).toBe(false);
    expect(await same(`<#a> <#p> "x"@en .`, `<#a> <#p> "x" .`)).toBe(false);
  });

  it("reads the other document's IRIs as mapped", async () => {
    const copy = await read(`<#a> <#p> <other.ttl#b> .`, COPY);
    const mine = await read(`<#a> <#p> <other.ttl#b> .`);
    expect(sameStatements(mine, copy)).toBe(false);
    expect(sameStatements(mine, copy, (iri) => iri.replace("https://pod.example/copy/", "https://pod.example/"))).toBe(true);
  });
});

describe("parseTurtle", () => {
  it("fails on what is no Turtle", async () => {
    await expect(parseTurtle("<#a> <#p", DOC)).rejects.toThrow();
  });
});
