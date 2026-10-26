// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad } from "@rdfjs/types";
import { describe, expect, it } from "vitest";
import type * as Rdf from "../../client/rdf";
import type * as Resources from "../../client/resources";

/**
 * An implementation of the RDF and resource modules, as the contract
 * tests take it: what `import * as` of each gives.
 */
export interface DataClient {
  rdf: typeof Rdf;
  resources: typeof Resources;
}

const URL_ = "https://pod.example/decks/deck.ttl";
const EX = "https://example.com/ns#";
const XSD = "http://www.w3.org/2001/XMLSchema#";

const TURTLE = `@prefix ex: <${EX}> .
<#a> ex:front "Sweden" ; ex:back "Stockholm"@EN-gb ; ex:note [ ex:text "blank" ] .
<#b> ex:front "Norway" .
`;

/** A Turtle document's answer, from the URL asked. */
export function turtleAt(turtle: string, init: ResponseInit = {}): typeof globalThis.fetch {
  return async (input) => {
    const response = new Response(turtle, {
      status: 200,
      headers: { "Content-Type": "text/turtle", ETag: '"v1"' },
      ...init,
    });
    Object.defineProperty(response, "url", { value: String(input) });
    return response;
  };
}

function quad(subject: string, object: Quad["object"], predicate = `${EX}p`): Quad {
  return {
    subject: { termType: "NamedNode", value: subject },
    predicate: { termType: "NamedNode", value: predicate },
    object,
    graph: { termType: "DefaultGraph", value: "" },
  } as Quad;
}

const text = (value: string, language = ""): Quad["object"] =>
  ({
    termType: "Literal",
    value,
    language,
    datatype: {
      termType: "NamedNode",
      value:
        language === "" ? `${XSD}string` : "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
    },
  }) as Quad["object"];

/**
 * What the app relies on of the RDF module (client/rdf.ts), beyond its
 * names and types: an implementation passes these, or a caller breaks.
 */
export function rdfContract({ rdf, resources }: DataClient): void {
  const {
    buildThing,
    changesOf,
    createSolidDataset,
    createThing,
    datasetAt,
    datasetFromQuads,
    fromRdfJsDataset,
    getDatetime,
    getDecimal,
    getLiteralAll,
    getStringByLocaleAll,
    getStringNoLocale,
    getThing,
    getThingAll,
    isEmptyDataset,
    localNameOf,
    propertiesOf,
    setThing,
    sourceOf,
    toRdfJsDataset,
    withQuads,
  } = rdf;

  /** The dataset of `turtle` as read from URL_. */
  const read = (turtle = TURTLE) =>
    resources.getSolidDatasetLinear(URL_, { fetch: turtleAt(turtle) });

  /** A subject holding one literal of `datatype`. */
  const withLiteral = (value: string, datatype: string) =>
    buildThing(createThing())
      .addLiteral(`${EX}p`, {
        termType: "Literal",
        value,
        language: "",
        datatype: { termType: "NamedNode", value: datatype },
      } as never)
      .build();

  describe("what the app relies on of the RDF module", () => {
    it("leaves blank-node subjects out of getThingAll, and getThing finds one by its label", async () => {
      const dataset = await read();
      expect(getThingAll(dataset).map((thing) => thing.url)).toEqual([`${URL_}#a`, `${URL_}#b`]);
      const [blank] = [...toRdfJsDataset(dataset)].filter(
        (one) => one.subject.termType === "BlankNode",
      );
      expect(getThing(dataset, `_:${blank!.subject.value}`)).not.toBeNull();
    });

    it("resolves a subject made by name against the document the dataset was read from", async () => {
      const dataset = await read();
      const found = getThing(dataset, createThing({ name: "a" }).url)!;
      expect(found.url).toBe(`${URL_}#a`);
      expect(getThing(createSolidDataset(), createThing({ name: "a" }).url)).toBeNull();
    });

    it("reads a date-time as its unanchored pattern finds one: throwing, or an invalid date", () => {
      const at = (value: string) => getDatetime(withLiteral(value, `${XSD}dateTime`), `${EX}p`);
      expect(at("2026-10-01T10:00:00Z")).toEqual(new Date("2026-10-01T10:00:00Z"));
      expect(at("not a date")).toBeNull();
      expect(() => at("T2026-01-01T00:00:00Z")).toThrow();
      expect(Number.isNaN(at("275761-01-01T00:00:00Z")!.getTime())).toBe(true);
      expect(Number.isNaN(at("-271822-01-01T00:00:00Z")!.getTime())).toBe(true);
    });

    it("gives language tags in lower case, however the document spells them", async () => {
      const quads = [quad(`${URL_}#a`, text("Stockholm", "EN-gb"), `${EX}back`)];
      for (const dataset of [
        await read(),
        datasetFromQuads(quads),
        fromRdfJsDataset(quads as never),
      ]) {
        const thing = getThing(dataset, `${URL_}#a`)!;
        expect([...getStringByLocaleAll(thing, `${EX}back`).keys()]).toEqual(["en-gb"]);
        expect(getLiteralAll(thing, `${EX}back`).map((literal) => literal.language)).toEqual([
          "en-gb",
        ]);
      }
    });

    it("reads a decimal as parseFloat does and writes a number as JavaScript spells it", () => {
      const decimal = (value: string) => getDecimal(withLiteral(value, `${XSD}decimal`), `${EX}p`);
      expect(decimal("2.50")).toBe(2.5);
      expect(decimal("1.0")).toBe(1);
      expect(decimal("abc")).toBeNull();
      const written = (value: number) =>
        getLiteralAll(buildThing(createThing()).addDecimal(`${EX}p`, value).build(), `${EX}p`)[0]!
          .value;
      expect(written(1)).toBe("1");
      expect(written(2.5)).toBe("2.5");
    });
  });

  describe("changesOf", () => {
    it("is undefined for a dataset no change was made to, and lists what setThing added", async () => {
      expect(changesOf(createSolidDataset())).toBeUndefined();
      const thing = buildThing(createThing({ url: `${URL_}#c` }))
        .addStringNoLocale(`${EX}front`, "Finland")
        .build();
      const changes = changesOf(setThing(await read(), thing))!;
      expect(changes.deletions).toEqual([]);
      expect(changes.additions.map((one) => one.object.value)).toEqual(["Finland"]);
    });
  });

  describe("sourceOf", () => {
    it("names the document read, with a key every edit of it keeps and no other read has", async () => {
      const dataset = await read();
      const source = sourceOf(dataset)!;
      expect(source.url).toBe(URL_);
      const edited = setThing(dataset, createThing({ url: `${URL_}#c` }));
      expect(sourceOf(edited)!.key).toBe(source.key);
      expect(sourceOf(await read())!.key).not.toBe(source.key);
    });

    it("is undefined for a dataset built here", () => {
      expect(sourceOf(createSolidDataset())).toBeUndefined();
      expect(sourceOf(datasetFromQuads([]))).toBeUndefined();
    });
  });

  describe("datasetAt", () => {
    it("is empty, of the document at the URL, as a read of it begins", () => {
      const dataset = datasetAt(URL_);
      expect(isEmptyDataset(dataset)).toBe(true);
      expect(sourceOf(dataset)!.url).toBe(URL_);
      expect(changesOf(dataset)).toBeUndefined();
      const named = setThing(dataset, createThing({ name: "a" }));
      expect(getThing(named, `${URL_}#a`)).not.toBeNull();
    });
  });

  describe("datasetFromQuads", () => {
    it("holds the quads and nothing else, with no changes", () => {
      const dataset = datasetFromQuads([quad(`${URL_}#a`, text("Sweden"))]);
      expect(getStringNoLocale(getThing(dataset, `${URL_}#a`)!, `${EX}p`)).toBe("Sweden");
      expect(changesOf(dataset)).toBeUndefined();
      expect(Object.isFrozen(dataset)).toBe(true);
    });
  });

  describe("withQuads", () => {
    it("holds the new quads, from the same document, with no changes", async () => {
      const dataset = await read();
      const replaced = withQuads(dataset, [quad(`${URL_}#c`, text("Finland"))]);
      expect(getThingAll(replaced).map((thing) => thing.url)).toEqual([`${URL_}#c`]);
      expect(sourceOf(replaced)!.key).toBe(sourceOf(dataset)!.key);
      expect(changesOf(replaced)).toEqual({ additions: [], deletions: [] });
      expect(Object.isFrozen(replaced)).toBe(true);
    });
  });

  describe("isEmptyDataset", () => {
    it("tells a dataset of no subject from one of some", async () => {
      expect(isEmptyDataset(createSolidDataset())).toBe(true);
      expect(isEmptyDataset(await read())).toBe(false);
    });
  });

  describe("propertiesOf", () => {
    it("is empty for a subject that says nothing", () => {
      expect(propertiesOf(createThing())).toEqual([]);
    });

    it("gives every property's IRIs, literals, language strings and blank nodes, in that order", () => {
      const subject = `${URL_}#a`;
      const dataset = datasetFromQuads([
        quad(subject, { termType: "BlankNode", value: "b0" } as Quad["object"]),
        quad(subject, text("hello", "en")),
        quad(subject, {
          termType: "Literal",
          value: "42",
          language: "",
          datatype: { termType: "NamedNode", value: `${XSD}integer` },
        } as Quad["object"]),
        quad(subject, { termType: "NamedNode", value: "https://iri.example/x" } as Quad["object"]),
        quad(subject, text("x"), `${EX}q`),
      ]);
      expect(propertiesOf(getThing(dataset, subject)!)).toEqual([
        {
          predicate: `${EX}p`,
          values: [
            { type: "iri", value: "https://iri.example/x" },
            { type: "literal", value: "42", dataType: `${XSD}integer` },
            { type: "langString", value: "hello", language: "en" },
            { type: "blankNode", value: "_:b0" },
          ],
        },
        {
          predicate: `${EX}q`,
          values: [{ type: "literal", value: "x", dataType: `${XSD}string` }],
        },
      ]);
    });
  });

  describe("localNameOf", () => {
    it("names a subject made by name and not saved yet, and nothing else", () => {
      const thing = buildThing(createThing({ name: "new" }))
        .addStringNoLocale(`${EX}front`, "Finland")
        .build();
      const [added] = changesOf(setThing(createSolidDataset(), thing))!.additions;
      expect(localNameOf(added!.subject.value)).toBe("new");
      expect(localNameOf(`${URL_}#new`)).toBeUndefined();
    });
  });
}
