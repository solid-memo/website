// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Literal, Quad } from "@rdfjs/types";
import { describe, expect, it } from "vitest";
import { rdfContract } from "@solid-memo/solid/testing/contract/rdf";
import * as rdf from "./rdf";
import * as resources from "./resources";

rdfContract({ rdf, resources });

describe("getDatetime, as @inrupt/solid-client reads one", () => {
  const at = (value: string) =>
    rdf.getDatetime(
      rdf
        .buildThing(rdf.createThing())
        .addLiteral("https://example.org/p", {
          termType: "Literal",
          value,
          language: "",
          datatype: {
            termType: "NamedNode",
            value: "http://www.w3.org/2001/XMLSchema#dateTime",
          },
        } as never)
        .build(),
      "https://example.org/p",
    );

  it("adds a time zone's offset, where XSD takes it away, as the library does", () => {
    expect(at("2026-01-01T10:00:00+02:00")).toEqual(new Date("2026-01-01T12:00:00Z"));
    expect(at("2026-01-01T10:00:00-05:30")).toEqual(new Date("2026-01-01T04:30:00Z"));
  });
});

const URL_ = "https://pod.example/decks/deck.ttl";
const EX = "https://example.com/ns#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const P = `${EX}p`;

/** A literal of `datatype`, or a language string with `language`. */
function term(value: string, datatype = `${XSD}string`, language = ""): Literal {
  return {
    termType: "Literal",
    value,
    language,
    datatype: { termType: "NamedNode", value: datatype },
  } as unknown as Literal;
}

const langString = (value: string, language: string) =>
  term(value, "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString", language);

/** A quad of the default graph, or of `graph`. */
function quadOf(subject: string, object: Quad["object"], graph?: string): Quad {
  return {
    subject: { termType: "NamedNode", value: subject },
    predicate: { termType: "NamedNode", value: P },
    object,
    graph:
      graph === undefined
        ? { termType: "DefaultGraph", value: "" }
        : { termType: "NamedNode", value: graph },
  } as Quad;
}

describe("getDatetime, of the forms a date-time takes", () => {
  const at = (value: string) => rdf.getDatetime(withLiteral(value, `${XSD}dateTime`), P);

  it("reads one with no time zone as UTC, and a fraction as milliseconds", () => {
    expect(at("2026-01-01T10:00:00")).toEqual(new Date("2026-01-01T10:00:00Z"));
    expect(at("2026-01-01T10:00:00.123Z")).toEqual(new Date("2026-01-01T10:00:00.123Z"));
  });

  it("reads a year of two digits as that year, not as one of the 1900s", () => {
    expect(at("0050-06-01T00:00:00Z")!.getUTCFullYear()).toBe(50);
  });
});

/** A subject made by name holding one literal of `datatype`. */
function withLiteral(value: string, datatype: string) {
  return rdf.buildThing(rdf.createThing()).addLiteral(P, term(value, datatype)).build();
}

describe("datasetFromQuads", () => {
  it("keeps a named graph's quads apart, for toRdfJsDataset alone", () => {
    const named = quadOf(`${URL_}#a`, term("in a graph"), `${URL_}#g`);
    const dataset = rdf.datasetFromQuads([named, quadOf(`${URL_}#b`, term("x"))]);
    expect(rdf.getThingAll(dataset).map((thing) => thing.url)).toEqual([`${URL_}#b`]);
    expect([...rdf.toRdfJsDataset(dataset)].map((one) => one.graph.value)).toEqual([
      "",
      `${URL_}#g`,
    ]);
  });

  it("holds a value given twice once, and refuses an object no triple can have", () => {
    const twice = quadOf(`${URL_}#a`, term("x"));
    expect(
      rdf.getStringNoLocaleAll(rdf.getThing(rdf.datasetFromQuads([twice, twice]), `${URL_}#a`)!, P),
    ).toEqual(["x"]);
    const variable = quadOf(`${URL_}#a`, { termType: "Variable", value: "v" } as Quad["object"]);
    expect(() => rdf.datasetFromQuads([variable])).toThrow(
      "Objects of type [Variable] are not supported.",
    );
  });

  it("gives a property's literals of one datatype together, in the order the first came", () => {
    const dataset = rdf.datasetFromQuads([
      quadOf(`${URL_}#a`, term("1", `${XSD}integer`)),
      quadOf(`${URL_}#a`, term("x")),
      quadOf(`${URL_}#a`, term("2", `${XSD}integer`)),
    ]);
    expect(
      rdf.getLiteralAll(rdf.getThing(dataset, `${URL_}#a`)!, P).map((one) => one.value),
    ).toEqual(["1", "2", "x"]);
  });
});

describe("getThing and createThing", () => {
  it("refuse an IRI that is no URL", () => {
    expect(() => rdf.getThing(rdf.createSolidDataset(), "no url")).toThrow(
      "Expected a valid URL to identify a Thing, but received: [no url].",
    );
    expect(() => rdf.createThing({ url: "no url" })).toThrow("Expected a valid URL");
  });
});

describe("removeThing", () => {
  const thing = rdf
    .buildThing(rdf.createThing({ url: `${URL_}#a` }))
    .addStringNoLocale(P, "x")
    .build();

  it("removes a subject given as text or as itself, its quads deleted", () => {
    const dataset = rdf.withQuads(rdf.datasetAt(URL_), [quadOf(`${URL_}#a`, term("x"))]);
    for (const subject of [`${URL_}#a`, thing]) {
      const removed = rdf.removeThing(dataset, subject);
      expect(rdf.isEmptyDataset(removed)).toBe(true);
      expect(rdf.changesOf(removed)!.deletions.map((one) => one.object.value)).toEqual(["x"]);
    }
  });

  it("finds a subject made by name by its name only when given as text", () => {
    const named = rdf
      .buildThing(rdf.createThing({ name: "a" }))
      .addStringNoLocale(P, "x")
      .build();
    const dataset = rdf.withQuads(rdf.datasetAt(URL_), [quadOf(`${URL_}#a`, term("x"))]);
    expect(rdf.isEmptyDataset(rdf.removeThing(dataset, named.url))).toBe(true);
    expect(rdf.isEmptyDataset(rdf.removeThing(dataset, named))).toBe(false);
    const local = rdf.setThing(rdf.createSolidDataset(), named);
    expect(rdf.isEmptyDataset(rdf.removeThing(local, named))).toBe(true);
  });

  it("changes nothing for a subject the dataset says nothing of", () => {
    const dataset = rdf.datasetAt(URL_);
    expect(rdf.changesOf(rdf.removeThing(dataset, thing))).toEqual({
      additions: [],
      deletions: [],
    });
  });

  it("makes no change of a subject set and then removed, nor of one removed and then set again", () => {
    const added = rdf.setThing(rdf.datasetAt(URL_), thing);
    expect(rdf.changesOf(rdf.removeThing(added, thing))).toEqual({ additions: [], deletions: [] });
    const read = rdf.withQuads(rdf.datasetAt(URL_), [quadOf(`${URL_}#a`, term("x"))]);
    const back = rdf.setThing(rdf.removeThing(read, thing), thing);
    expect(rdf.changesOf(back)).toEqual({ additions: [], deletions: [] });
  });
});

describe("buildThing", () => {
  const subject = () => rdf.buildThing(rdf.createThing({ url: `${URL_}#a` }));

  it("adds a value of each kind, as the getters read it", () => {
    const other = rdf.createThing({ url: `${URL_}#b` });
    const when = new Date("2026-01-01T10:00:00Z");
    const thing = subject()
      .addUrl(`${EX}url`, other)
      .addBoolean(`${EX}yes`, true)
      .addBoolean(`${EX}no`, false)
      .addDatetime(`${EX}when`, when)
      .addInteger(`${EX}count`, 3)
      .addLiteral(`${EX}back`, langString("Stockholm", "EN"))
      .addStringWithLocale(`${EX}back`, "Estocolmo", "es")
      .build();
    expect(rdf.getUrl(thing, `${EX}url`)).toBe(`${URL_}#b`);
    expect(rdf.getBoolean(thing, `${EX}yes`)).toBe(true);
    expect(rdf.getBoolean(thing, `${EX}no`)).toBe(false);
    expect(rdf.getDatetime(thing, `${EX}when`)).toEqual(when);
    expect(rdf.getInteger(thing, `${EX}count`)).toBe(3);
    expect(rdf.getStringByLocaleAll(thing, `${EX}back`)).toEqual(
      new Map([
        ["en", ["Stockholm"]],
        ["es", ["Estocolmo"]],
      ]),
    );
  });

  it("sets a property to one value in place of those it had", () => {
    const thing = subject()
      .addIri(P, `${URL_}#x`)
      .setIri(P, `${URL_}#y`)
      .addInteger(`${EX}count`, 1)
      .setInteger(`${EX}count`, 2)
      .addStringNoLocale(`${EX}front`, "a")
      .setStringNoLocale(`${EX}front`, "b")
      .build();
    expect(rdf.getUrlAll(thing, P)).toEqual([`${URL_}#y`]);
    expect(rdf.getInteger(thing, `${EX}count`)).toBe(2);
    expect(rdf.getStringNoLocaleAll(thing, `${EX}front`)).toEqual(["b"]);
  });

  it("refuses an IRI value that is no URL", () => {
    expect(() => subject().addIri(P, "no url")).toThrow(
      "Expected a valid URL value, but received: [no url].",
    );
  });

  it("removes a language string of its language, whatever the tag's case, and nothing else", () => {
    const thing = subject()
      .addStringWithLocale(P, "Stockholm", "en")
      .addStringWithLocale(P, "Stockholm", "sv")
      .addStringWithLocale(P, "Other", "en")
      .addStringNoLocale(P, "Stockholm")
      .addIri(P, `${URL_}#x`)
      .removeLiteral(P, langString("Stockholm", "EN"))
      .build();
    expect(rdf.getStringByLocaleAll(thing, P)).toEqual(
      new Map([
        ["sv", ["Stockholm"]],
        ["en", ["Other"]],
      ]),
    );
    expect(rdf.getStringNoLocale(thing, P)).toBe("Stockholm");
    expect(rdf.getUrl(thing, P)).toBe(`${URL_}#x`);
  });

  it("removes a literal of its datatype and value, and nothing else", () => {
    const thing = subject()
      .addInteger(P, 1)
      .addInteger(P, 2)
      .addStringNoLocale(P, "1")
      .addStringWithLocale(P, "1", "en")
      .removeLiteral(P, term("1", `${XSD}integer`))
      .removeLiteral(`${EX}none`, term("1"))
      .build();
    expect(rdf.getInteger(thing, P)).toBe(2);
    expect(rdf.getStringNoLocale(thing, P)).toBe("1");
    expect(rdf.getStringByLocaleAll(thing, P).get("en")).toEqual(["1"]);
    expect(rdf.getPropertyAll(thing)).toEqual([P]);
  });

  it("removes an IRI however it is cased, given as text or as a subject, and nothing else", () => {
    const thing = subject()
      .addIri(P, `${URL_}#X`)
      .addIri(P, `${URL_}#y`)
      .addIri(P, `${URL_}#z`)
      .addStringNoLocale(P, `${URL_}#y`)
      .removeUrl(P, `${URL_}#x`)
      .removeUrl(P, rdf.createThing({ url: `${URL_}#y` }))
      .build();
    expect(rdf.getUrlAll(thing, P)).toEqual([`${URL_}#z`]);
    expect(rdf.getStringNoLocale(thing, P)).toBe(`${URL_}#y`);
    expect(rdf.getUrlAll(rdf.removeUrl(thing, P, `${URL_}#z`), P)).toEqual([]);
  });

  it("refuses to remove a subject made by name and not saved yet, which has no URL", () => {
    expect(() => subject().removeUrl(P, rdf.createThing({ name: "a" }))).toThrow(
      "The URL of a Thing that has not been persisted cannot be determined without a base URL.",
    );
  });
});

describe("asUrl", () => {
  it("is a subject's IRI", () => {
    expect(rdf.asUrl(rdf.createThing({ url: `${URL_}#a` }))).toBe(`${URL_}#a`);
  });
});

describe("the getters", () => {
  it("read an IRI to a subject made by name as `#name`, and none when there is none", () => {
    const thing = rdf
      .buildThing(rdf.createThing())
      .addIri(P, rdf.createThing({ name: "b" }))
      .build();
    expect(rdf.getUrl(thing, P)).toBe("#b");
    expect(rdf.getUrl(thing, `${EX}none`)).toBeNull();
    expect(rdf.getStringNoLocale(thing, `${EX}none`)).toBeNull();
  });

  it("read an integer as parseInt does, and none of a text that is no number", () => {
    const integer = (value: string) => rdf.getInteger(withLiteral(value, `${XSD}integer`), P);
    expect(integer("42")).toBe(42);
    expect(integer("abc")).toBeNull();
  });

  it("read a boolean of true, 1, false or 0, and none of any other text", () => {
    const boolean = (value: string) => rdf.getBoolean(withLiteral(value, `${XSD}boolean`), P);
    expect(["true", "1", "false", "0", "yes"].map(boolean)).toEqual([
      true,
      true,
      false,
      false,
      null,
    ]);
  });

  it("give every term of a property: IRIs, literals, then blank nodes", () => {
    const dataset = rdf.datasetFromQuads([
      quadOf(`${URL_}#a`, { termType: "BlankNode", value: "b0" } as Quad["object"]),
      quadOf(`${URL_}#a`, term("x")),
      quadOf(`${URL_}#a`, { termType: "NamedNode", value: `${URL_}#b` } as Quad["object"]),
    ]);
    const terms = rdf.getTermAll(rdf.getThing(dataset, `${URL_}#a`)!, P);
    expect(terms.map((one) => [one.termType, one.value])).toEqual([
      ["NamedNode", `${URL_}#b`],
      ["Literal", "x"],
      ["BlankNode", "b0"],
    ]);
  });

  it("name only the properties that still have a value", () => {
    const thing = rdf
      .buildThing(rdf.createThing())
      .addStringNoLocale(P, "x")
      .addStringNoLocale(`${EX}q`, "y")
      .removeLiteral(`${EX}q`, term("y"))
      .build();
    expect(rdf.getPropertyAll(thing)).toEqual([P]);
  });
});
