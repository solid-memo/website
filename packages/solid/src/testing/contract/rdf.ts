// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad } from "@rdfjs/types";
import { describe, expect, it } from "vitest";
import { growth } from "@solid-memo/domain/testing/growth";
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
    getInteger,
    getStringNoLocale,
    getThing,
    getThingAll,
    getUrlAll,
    isEmptyDataset,
    localNameOf,
    propertiesOf,
    removeThing,
    removeThings,
    setThing,
    setThings,
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

  describe("setThings and removeThings", () => {
    const lines = (quads: Iterable<Quad>) =>
      [...quads]
        .map(
          ({ subject, predicate, object }) => `${subject.value} ${predicate.value} ${object.value}`,
        )
        .sort();
    /** What a dataset holds, in the order getThingAll gives its subjects, and its changes. */
    const stateOf = (dataset: Rdf.Dataset) => {
      const changes = changesOf(dataset);
      return {
        subjects: getThingAll(dataset).map((subject) => subject.url),
        quads: lines(toRdfJsDataset(dataset)),
        additions: changes === undefined ? undefined : lines(changes.additions),
        deletions: changes === undefined ? undefined : lines(changes.deletions),
      };
    };
    const front = (subject: Rdf.Subject, value: string) =>
      buildThing(subject).addStringNoLocale(`${EX}front`, value).build();

    it("set and remove subjects as setThing and removeThing do, one at a time", async () => {
      const base = await read();
      const a = getThing(base, `${URL_}#a`)!;
      const c = front(createThing({ url: `${URL_}#c` }), "Finland");
      const named = front(createThing({ name: "d" }), "Denmark");
      const set = [front(a, "Sverige"), c, named, front(a, "Suède")];
      const removed = [c, `${URL_}#b`, `${URL_}#absent`, named.url];
      const once = removeThings(setThings(base, set), removed);
      const fold = removed.reduce<Rdf.Dataset>(
        (dataset, subject) => removeThing(dataset, subject),
        set.reduce<Rdf.Dataset>((dataset, subject) => setThing(dataset, subject), base),
      );
      expect(stateOf(once)).toEqual(stateOf(fold));
      expect(getThing(once, `${URL_}#d`)).toBeNull();
      // Edited again: what was removed and is set again, and what was set and is removed, is no change.
      const b = front(createThing({ url: `${URL_}#b` }), "Norway");
      const again = removeThings(setThings(once, [b]), [`${URL_}#a`]);
      expect(stateOf(again)).toEqual(stateOf(removeThing(setThing(fold, b), `${URL_}#a`)));
    });

    it("give the dataset itself for no subject", async () => {
      const base = await read();
      expect(setThings(base, [])).toBe(base);
      expect(removeThings(base, [])).toBe(base);
    });

    it("look for a subject given by its name's IRI as text only in a dataset of a document", () => {
      const named = front(createThing({ name: "d" }), "Denmark");
      const built = setThing(createSolidDataset(), named);
      expect(stateOf(removeThings(built, [named.url]))).toEqual(
        stateOf(removeThing(built, named.url)),
      );
      expect(getThingAll(removeThings(built, [named.url]))).toEqual([]);
    });
  });

  describe("setIriAll and setStringAll", () => {
    const P = `${EX}p`;
    /** A subject with two IRIs, a string, a language string and an integer for P. */
    const mixed = () =>
      buildThing(createThing({ url: `${URL_}#a` }))
        .addIri(P, `${EX}x`)
        .addIri(P, `${EX}y`)
        .addStringNoLocale(P, "plain")
        .addStringWithLocale(P, "tagged", "en")
        .addInteger(P, 7)
        .build();

    it("set the property's IRIs, each once, and keep its other values", () => {
      const set = buildThing(mixed())
        .setIriAll(P, [`${EX}y`, `${EX}z`, `${EX}z`])
        .build();
      expect(getUrlAll(set, P)).toEqual([`${EX}y`, `${EX}z`]);
      expect(getStringNoLocale(set, P)).toBe("plain");
      expect(getStringByLocaleAll(set, P)).toEqual(new Map([["en", ["tagged"]]]));
      expect(getInteger(set, P)).toBe(7);
      expect(getUrlAll(buildThing(mixed()).setIriAll(P, []).build(), P)).toEqual([]);
      const only = buildThing(createThing({ url: `${URL_}#b` })).setIriAll(P, [`${EX}x`]);
      expect(getUrlAll(only.setIriAll(P, []).build(), P)).toEqual([]);
      expect(() => buildThing(mixed()).setIriAll(P, ["not a URL"])).toThrow();
    });

    it("set the property's strings, each once, a language as an add reads it, and keep its other values", () => {
      const set = buildThing(mixed())
        .setStringAll(P, [
          { value: "one", language: "" },
          { value: "one", language: "" },
          { value: "två", language: "SV" },
          { value: "två", language: "sv" },
        ])
        .build();
      expect(getStringNoLocale(set, P)).toBe("one");
      expect(getStringByLocaleAll(set, P)).toEqual(new Map([["sv", ["två"]]]));
      expect(getUrlAll(set, P)).toEqual([`${EX}x`, `${EX}y`]);
      expect(getInteger(set, P)).toBe(7);
      const none = buildThing(mixed()).setStringAll(P, []).build();
      expect(getStringNoLocale(none, P)).toBeNull();
      expect(getStringByLocaleAll(none, P)).toEqual(new Map());
    });

    it("take time that grows with the values, not their square", () => {
      const ratio = growth(
        (count) => {
          const iris = Array.from({ length: count }, (_, i) => `${EX}v${i}`);
          const strings = iris.map((value, i) => ({ value, language: i % 2 === 0 ? "" : "en" }));
          const subject = createThing({ url: `${URL_}#a` });
          return () => buildThing(subject).setIriAll(P, iris).setStringAll(P, strings).build();
        },
        2000,
        8,
      );
      expect(ratio).toBeLessThan(4);
    });
  });

  describe("removeLiteralAll", () => {
    const P = `${EX}p`;
    const DATETIME = `${XSD}dateTime`;
    const literal = (value: string, datatype = DATETIME) =>
      ({
        termType: "Literal",
        value,
        language: "",
        datatype: { termType: "NamedNode", value: datatype },
      }) as never;
    const subject = () =>
      buildThing(createThing({ url: `${URL_}#a` }))
        .addLiteral(P, literal("a"))
        .addLiteral(P, literal("b"))
        .addLiteral(P, literal("c"))
        .addLiteral(P, literal("a", `${XSD}date`))
        .addStringNoLocale(P, "a")
        .addIri(P, `${EX}x`)
        .build();

    it("removes the literals of the datatype named, as removeLiteral does, and keeps the rest", () => {
      const removed = buildThing(subject()).removeLiteralAll(P, DATETIME, ["a", "c", "z"]).build();
      const oneByOne = buildThing(subject())
        .removeLiteral(P, literal("a"))
        .removeLiteral(P, literal("c"))
        .removeLiteral(P, literal("z"))
        .build();
      const terms = (subject: Rdf.Subject) =>
        getLiteralAll(subject, P).map((one) => [one.value, one.datatype.value]);
      expect(terms(removed)).toEqual(terms(oneByOne));
      expect(terms(removed)).toEqual([
        ["b", DATETIME],
        ["a", `${XSD}date`],
        ["a", `${XSD}string`],
      ]);
      expect(getUrlAll(removed, P)).toEqual([`${EX}x`]);
      const all = buildThing(subject()).removeLiteralAll(P, DATETIME, ["a", "b", "c"]).build();
      expect(terms(all)).toEqual([
        ["a", `${XSD}date`],
        ["a", `${XSD}string`],
      ]);
      const none = buildThing(createThing({ url: `${URL_}#b` }))
        .removeLiteralAll(P, DATETIME, ["a"])
        .build();
      expect(propertiesOf(none)).toEqual([]);
    });

    it("takes time that grows with the values, not their square", () => {
      const ratio = growth(
        (count) => {
          const values = Array.from({ length: count }, (_, i) => `v${i}`);
          const builder = buildThing(createThing({ url: `${URL_}#a` }));
          for (const value of values) builder.addLiteral(P, literal(value));
          const full = builder.build();
          return () => buildThing(full).removeLiteralAll(P, DATETIME, values).build();
        },
        2000,
        8,
      );
      expect(ratio).toBeLessThan(4);
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
