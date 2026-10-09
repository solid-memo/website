import { describe, expect, it } from "vitest";
import { getJsonLdParser, type WithServerResourceInfo } from "@inrupt/solid-client";
import type { Quad, Term } from "@rdfjs/types";
import { jsonLdOf, refuseRemoteContexts } from "./jsonLd";
import { termOf } from "./ntriples";

const EX = "https://example.org/ns#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

const iri = (value: string) => ({ termType: "NamedNode", value }) as Term;
const blank = (value: string) => ({ termType: "BlankNode", value }) as Term;
const literal = (value: string, language = "", datatype = `${XSD}string`) =>
  ({ termType: "Literal", value, language, datatype: iri(language === "" ? datatype : "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString") }) as Term;
const quad = (subject: Term, predicate: string, object: Term) => ({ subject, predicate: iri(predicate), object }) as Quad;

/** The triples a JSON-LD text holds, as N-Triples lines, sorted. */
async function triplesOf(text: string): Promise<string[]> {
  const parser = getJsonLdParser();
  const lines: string[] = [];
  parser.onQuad((q) => lines.push(`${termOf(q.subject)} ${termOf(q.predicate)} ${termOf(q.object)} .`));
  await new Promise<void>((resolve) => {
    parser.onComplete(resolve);
    parser.parse(text, { internal_resourceInfo: { sourceIri: "https://base.example/", isRawData: false } } as WithServerResourceInfo);
  });
  return lines.sort();
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
    const expected = quads.map((q) => `${termOf(q.subject)} ${termOf(q.predicate)} ${termOf(q.object)} .`);
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
    expect(a["ex:link"]).toEqual([{ "@id": "_:b" }, { "@id": "https://elsewhere.example/a/b" }, { "@id": `${EX}with/slash` }]);
    // A type that is a blank node is no @type: it stays a property.
    expect(a[RDF_TYPE]).toEqual({ "@id": "_:t" });
  });

  it("writes the same triples the same, whatever their order", () => {
    expect(jsonLdOf([...quads].reverse(), { ex: EX })).toBe(jsonLdOf(quads, { ex: EX }));
  });
});

describe("refuseRemoteContexts", () => {
  it("lets a context stated in full pass", () => {
    expect(() => refuseRemoteContexts(JSON.stringify([{ "@context": { ex: EX } }, 5, null]))).not.toThrow();
  });
});
