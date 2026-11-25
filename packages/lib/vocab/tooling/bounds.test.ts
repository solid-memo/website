// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { parseBounds, termModels, withBounds } from "./bounds.ts";
import { parseShapes, renderDescriptors, renderDomainTypes } from "./shapes.ts";

const HEAD = `
@prefix sh:      <http://www.w3.org/ns/shacl#> .
@prefix sm:      <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix rdfs:    <http://www.w3.org/2000/01/rdf-schema#> .
`;
const LANG = "<http://www.w3.org/1999/02/22-rdf-syntax-ns#langString>";

const THING = `${HEAD}
<#shape> a sh:NodeShape ; sh:name "ThingV1" ; sh:class sm:Thing ;
  sh:property <#formatVersion>, <#title>, <#note>, <#count>, <#link>, <#links>, <#mbox>, <#tags> .
<#formatVersion> sh:path sm:formatVersion ; sh:datatype xsd:integer ; sh:maxCount 1 ; sh:in ( 1 ) .
<#title> sh:path dcterms:title ; sh:datatype xsd:string ; sh:minCount 1 ; sh:maxCount 1 .
<#note> sh:path sm:note ; sh:datatype ${LANG} ; sh:uniqueLang true .
<#count> sh:path sm:count ; sh:datatype xsd:integer ; sh:maxCount 1 .
<#link> sh:path sm:link ; sh:nodeKind sh:IRI ; sh:maxCount 1 .
<#links> sh:path sm:links ; sh:nodeKind sh:IRI .
<#mbox> sh:path sm:mbox ; sh:nodeKind sh:IRI ; sh:maxCount 1 .
<#tags> sh:path sm:tag ; sh:datatype xsd:string .
`;

const BOUNDS = `${HEAD}
<#bounds> a sh:NodeShape ; sh:name "ThingBounds" ;
  sh:property <#title>, <#note>, <#link>, <#links>, <#mbox>, <#tags> .
<#title> sh:path dcterms:title ; sh:maxLength 100 .
<#note> sh:path sm:note ; sh:maxCount 10 ; sh:maxLength 200 .
<#link> sh:path sm:link ; sh:pattern "^https?://" .
<#links> sh:path sm:links ; sh:maxCount 5 ; sh:pattern "^https?://" .
<#mbox> sh:path sm:mbox ; sh:pattern "^mailto:" .
<#tags> sh:path sm:tag ; sh:maxCount 20 ; sh:maxLength 30 .
<#terms> a sh:NodeShape ; sh:name "ThingTerms" ; rdfs:comment "Beside a thing." ;
  sh:property <#place>, <#hosts>, <#when> .
<#place> sh:path sm:place ; sh:datatype xsd:integer ; sh:maxCount 1 .
<#hosts> sh:path sm:host ; sh:datatype xsd:string ; sh:maxCount 3 ; sh:maxLength 9 ; sh:name "hosts" .
<#when> sh:path sm:when ; sh:datatype xsd:dateTime ; sh:maxCount 1 .
`;

const files = (...entries: [string, string][]) =>
  entries.map(([path, turtle]) => ({ path, turtle }));

const shapes = () => parseShapes(files(["thing/v1.ttl", THING]));

describe("parseBounds and withBounds", () => {
  it("bounds every field of a kind, a field of one value reading one", () => {
    const bounds = parseBounds(files(["thing.ttl", BOUNDS]));
    const [model] = withBounds(shapes(), bounds);
    expect(
      model.fields.map(({ name, maxCount, maxLength, iri }) => ({
        name,
        maxCount,
        maxLength,
        iri,
      })),
    ).toEqual([
      { name: "title", maxCount: 1, maxLength: 100, iri: undefined },
      { name: "note", maxCount: 10, maxLength: 200, iri: undefined },
      { name: "count", maxCount: 1, maxLength: undefined, iri: undefined },
      { name: "link", maxCount: 1, maxLength: undefined, iri: "http" },
      { name: "links", maxCount: 5, maxLength: undefined, iri: "http" },
      { name: "mbox", maxCount: 1, maxLength: undefined, iri: "mailbox" },
      { name: "tag", maxCount: 20, maxLength: 30, iri: undefined },
    ]);
  });

  it("reads a kind's terms as a small shape of their own, and a document of terms alone", () => {
    const bounds = parseBounds(
      files(
        ["thing.ttl", BOUNDS],
        [
          "alone.ttl",
          `${HEAD} <#terms> a sh:NodeShape ; sh:name "AloneTerms" ; sh:property <#p> .
           <#p> sh:path sm:p ; sh:nodeKind sh:IRI ; sh:maxCount 2 ; sh:pattern "^https?://" .`,
        ],
      ),
    );
    expect(bounds[1]).toEqual({
      document: "alone.ttl",
      bounds: new Map(),
      terms: {
        name: "AloneTerms",
        comment: "",
        document: "alone.ttl",
        fields: [
          {
            name: "p",
            predicate: "https://solid-memo.com/ns/vocab/v1.ttl#p",
            kind: "iri",
            cardinality: "many",
            maxCount: 2,
            iri: "http",
          },
        ],
      },
    });
    const terms = termModels(bounds);
    expect(terms.map((t) => t.name)).toEqual(["AloneTerms", "ThingTerms"]);
    const models = withBounds(shapes(), bounds);
    const types = renderDomainTypes(models, terms);
    expect(types).toContain(
      "/** Beside a thing. */\nexport interface ThingTerms {\n  readonly place?: number;\n  readonly hosts: readonly string[];\n  readonly when?: string;\n}",
    );
    const descriptors = renderDescriptors(models, terms);
    expect(descriptors).toContain(
      `import type { ShapeDescriptor, TermsDescriptor } from "./shapeDescriptor.ts";`,
    );
    expect(descriptors).toContain("  AloneTerms,\n  ThingTerms,\n} from");
    expect(descriptors).toContain(`export const THING_TERMS: TermsDescriptor<ThingTerms> = {
  name: "ThingTerms",
  document: "thing.ttl",
  fields: [
    { name: "place", predicate: "https://solid-memo.com/ns/vocab/v1.ttl#place", kind: "integer", cardinality: "optional", maxCount: 1 },
    { name: "hosts", predicate: "https://solid-memo.com/ns/vocab/v1.ttl#host", kind: "string", cardinality: "many", maxCount: 3, maxLength: 9 },`);
    expect(descriptors).toContain(
      `    { name: "link", predicate: "https://solid-memo.com/ns/vocab/v1.ttl#link", kind: "iri", cardinality: "optional", maxCount: 1, iri: "http" },`,
    );
  });

  it("fails a field without the bounds it needs, naming the document and the shape", () => {
    expect(() =>
      parseBounds(
        files(["thing.ttl", BOUNDS.replace("<#title> sh:path dcterms:title", "<#title> sh:x 1")]),
      ),
    ).toThrow(
      "ns/bounds/thing.ttl: <https://solid-memo.com/ns/bounds/thing.ttl#title> has no sh:path IRI.",
    );
    const dropped = (fragment: string) =>
      parseBounds(files(["thing.ttl", BOUNDS.replace(new RegExp(`<#${fragment}>, `), "")]));
    expect(() => withBounds(shapes(), dropped("title"))).toThrow(
      "ns/bounds/thing.ttl: <http://purl.org/dc/terms/title> of ThingV1 needs sh:maxLength.",
    );
    expect(() => withBounds(shapes(), dropped("note"))).toThrow("of ThingV1 needs sh:maxCount.");
    expect(() => withBounds(shapes(), dropped("link"))).toThrow(
      'of ThingV1 needs an IRI rule: sh:pattern "^https?://" or "^mailto:".',
    );
  });

  it("fails a kind without bounds, bounds of no kind, and a bound on what no version has", () => {
    expect(() => withBounds(shapes(), [])).toThrow(
      'bounds: "thing" has no ns/bounds/ document with <#bounds> sh:name "ThingBounds".',
    );
    expect(() =>
      withBounds(
        shapes(),
        parseBounds(
          files(
            ["thing.ttl", BOUNDS],
            [
              "other.ttl",
              BOUNDS.replace("ThingBounds", "OtherBounds").replace("ThingTerms", "OtherTerms"),
            ],
          ),
        ),
      ),
    ).toThrow('ns/bounds/other.ttl: no shape is of kind "other".');
    const stale = BOUNDS.replace(
      "<#tags> sh:path",
      "<#gone> sh:path sm:gone ; sh:maxCount 1 . <#bounds> sh:property <#gone> . <#tags> sh:path",
    );
    expect(() => withBounds(shapes(), parseBounds(files(["thing.ttl", stale])))).toThrow(
      'ns/bounds/thing.ttl: no version of "thing" has <https://solid-memo.com/ns/vocab/v1.ttl#gone>.',
    );
    const overlap = BOUNDS.replace("<#place> sh:path sm:place", "<#place> sh:path sm:count");
    expect(() => withBounds(shapes(), parseBounds(files(["thing.ttl", overlap])))).toThrow(
      'ns/bounds/thing.ttl: <https://solid-memo.com/ns/vocab/v1.ttl#count> is a field of "thing", not a term beside it.',
    );
  });

  it("rejects documents and property shapes that do not follow the conventions", () => {
    const rejects = (turtle: string, message: string) =>
      expect(() => parseBounds(files(["thing.ttl", `${HEAD}${turtle}`]))).toThrow(message);
    rejects(
      `<#other> a sh:NodeShape .`,
      "ns/bounds/thing.ttl: has neither <#bounds> nor <#terms>.",
    );
    rejects(`<#bounds> sh:name "Things" .`, 'sh:name "Things" is not <Kind>Bounds.');
    rejects(`<#terms> sh:name "Thing" .`, 'sh:name "Thing" is not <Name>Terms.');
    const bound = (property: string) =>
      `<#bounds> sh:name "ThingBounds" ; sh:property <#p> . <#p> sh:path sm:p ; ${property} .`;
    rejects(
      bound('sh:pattern "^ftp:"'),
      'states sh:pattern "^ftp:"; an IRI rule is "^https?://" or "^mailto:".',
    );
    rejects(
      bound("sh:maxCount 0"),
      "states sh:maxCount 0; a bound is a whole number of 1 or more.",
    );
    rejects(
      bound("sh:maxLength 1.5"),
      "states sh:maxLength 1.5; a bound is a whole number of 1 or more.",
    );
    rejects(
      `<#bounds> sh:name "ThingBounds" ; sh:property <#p>, <#q> . <#p> sh:path sm:p ; sh:maxCount 1 . <#q> sh:path sm:p ; sh:maxCount 2 .`,
      "<https://solid-memo.com/ns/vocab/v1.ttl#p> is bounded twice.",
    );
    const term = (property: string) =>
      `<#terms> sh:name "ThingTerms" ; sh:property <#p> . <#p> sh:path sm:p ; ${property} .`;
    rejects(
      term("sh:datatype xsd:string ; sh:minCount 1 ; sh:maxCount 1 ; sh:maxLength 9"),
      "is required; a term is never required.",
    );
    rejects(term("sh:datatype xsd:integer"), "needs sh:maxCount.");
    rejects(
      term("sh:datatype xsd:integer ; sh:maxCount 2"),
      "repeats a integer; only strings and IRIs may repeat.",
    );
    rejects(
      term("sh:datatype xsd:string ; sh:maxCount 2"),
      "<https://solid-memo.com/ns/bounds/thing.ttl#p> needs sh:maxLength.",
    );
    expect(() =>
      parseBounds(files(["a.ttl", BOUNDS], ["b.ttl", BOUNDS.replace("ThingTerms", "OtherTerms")])),
    ).toThrow('bounds: "thing" is bounded twice.');
  });
});
