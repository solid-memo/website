// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { datasetFromTurtle } from "./testing/turtle";
import type { Literal, Quad } from "@rdfjs/types";
import { createEngine, mapIris, mergeDatasets } from "./engine";
import { subclassCycle, subclassDiamond } from "./testing/subclassTangle";
import { readSiteTurtle, SHAPES_BASE } from "@solid-memo/vocab/tooling/sources";

const SHAPES = `
@prefix sh:  <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex:  <https://example.com/ns#> .
<#shape> a sh:NodeShape ;
    sh:property <#name>, <#age>, <#note> ;
    sh:pattern "^https://" .
<#either> a sh:NodeShape ;
    sh:pattern "^https://" ;
    sh:xone ( [ sh:property [ sh:path ex:age ; sh:minCount 1 ] ] [ sh:property [ sh:path ex:note ; sh:minCount 1 ] ] ) .
<#name> sh:path ex:name ; sh:datatype xsd:string ; sh:minCount 1 ; sh:maxCount 1 ;
    sh:message "One name, as text."@en, "Ett namn, som text."@sv, "One name, as text."@en-gb .
<#age> sh:path ex:age ; sh:datatype xsd:integer ; sh:severity sh:Warning .
<#note> sh:path ex:note ; sh:maxCount 1 ; sh:severity sh:Info .
`;
const SHAPES_URL = "https://example.com/shapes.ttl";
const DATA_URL = "https://example.com/data.ttl";

async function engine() {
  return createEngine(await datasetFromTurtle(SHAPES, SHAPES_URL));
}

describe("createEngine", () => {
  it("returns no violations for a conforming node", async () => {
    const data = await datasetFromTurtle(`<#a> <https://example.com/ns#name> "Ann" .`, DATA_URL);
    expect(
      await (await engine()).validateNode(data, `${DATA_URL}#a`, `${SHAPES_URL}#shape`),
    ).toEqual([]);
  });

  it("maps path, value, message and severity, sorted by path then message", async () => {
    const data = await datasetFromTurtle(
      `@prefix ex: <https://example.com/ns#> .
       <#a> ex:name "Ann", "Anne" ; ex:age "young" ; ex:note "x", "y" .`,
      DATA_URL,
    );
    expect(
      await (await engine()).validateNode(data, `${DATA_URL}#a`, `${SHAPES_URL}#shape`),
    ).toEqual([
      {
        path: "https://example.com/ns#age",
        message: { en: "Value does not have datatype <http://www.w3.org/2001/XMLSchema#integer>" },
        builtIn: true,
        value: "young",
        severity: "warning",
        constraint: "Datatype",
      },
      {
        path: "https://example.com/ns#name",
        message: {
          en: "One name, as text.",
          "en-gb": "One name, as text.",
          sv: "Ett namn, som text.",
        },
        severity: "violation",
        constraint: "MaxCount",
      },
      {
        path: "https://example.com/ns#note",
        message: { en: "More than 1 values" },
        builtIn: true,
        severity: "info",
        constraint: "MaxCount",
      },
    ]);
  });

  it("reports a constraint on the subject itself without a path", async () => {
    const data = await datasetFromTurtle(
      `<http://example.com/plain> <https://example.com/ns#name> "Ann" .`,
      DATA_URL,
    );
    expect(
      await (await engine()).validateNode(data, "http://example.com/plain", `${SHAPES_URL}#shape`),
    ).toEqual([
      {
        message: { en: 'Value does not match pattern "^https://"' },
        builtIn: true,
        value: "http://example.com/plain",
        severity: "violation",
        constraint: "Pattern",
      },
    ]);
  });

  it("names the constraint when the engine has no message for it, sorting pathless results by message", async () => {
    const data = await datasetFromTurtle(
      `<http://example.com/plain> <https://example.com/ns#name> "Ann" .`,
      DATA_URL,
    );
    expect(
      await (await engine()).validateNode(data, "http://example.com/plain", `${SHAPES_URL}#either`),
    ).toEqual([
      {
        message: { en: 'Value does not match pattern "^https://"' },
        builtIn: true,
        value: "http://example.com/plain",
        severity: "violation",
        constraint: "Pattern",
      },
      {
        message: { en: "Xone constraint failed." },
        builtIn: true,
        value: "http://example.com/plain",
        severity: "violation",
        constraint: "Xone",
      },
    ]);
  });

  it("starts every check afresh", async () => {
    const e = await engine();
    const bad = await datasetFromTurtle(`<#a> <https://example.com/ns#age> "x" .`, DATA_URL);
    const good = await datasetFromTurtle(`<#a> <https://example.com/ns#name> "Ann" .`, DATA_URL);
    expect(await e.validateNode(bad, `${DATA_URL}#a`, `${SHAPES_URL}#shape`)).toHaveLength(2);
    expect(await e.validateNode(good, `${DATA_URL}#a`, `${SHAPES_URL}#shape`)).toEqual([]);
  });

  it("gives each of several checks at once its own results, on a fresh engine and on a used one", async () => {
    const e = await engine();
    const data = await datasetFromTurtle(
      `@prefix ex: <https://example.com/ns#> .
       <#named> ex:name "Ann" . <#nameless> ex:age 3 .`,
      DATA_URL,
    );
    const check = async (node: string) =>
      (await e.validateNode(data, `${DATA_URL}#${node}`, `${SHAPES_URL}#shape`)).map(
        (v) => v.constraint,
      );
    expect(await Promise.all([check("named"), check("nameless")])).toEqual([[], ["MinCount"]]);
    expect(await Promise.all([check("nameless"), check("named")])).toEqual([["MinCount"], []]);
  });

  it("goes on checking after a check fails", async () => {
    const e = await engine();
    const good = await datasetFromTurtle(`<#a> <https://example.com/ns#name> "Ann" .`, DATA_URL);
    const failed = e.validateNode(undefined as never, `${DATA_URL}#a`, `${SHAPES_URL}#shape`);
    const next = e.validateNode(good, `${DATA_URL}#a`, `${SHAPES_URL}#shape`);
    await expect(failed).rejects.toThrow();
    expect(await next).toEqual([]);
  });

  it("checks a whole graph against shapes that pick their own targets, sorted by focus node", async () => {
    const targeted = await datasetFromTurtle(
      `@prefix sh: <http://www.w3.org/ns/shacl#> .
       @prefix ex: <https://example.com/ns#> .
       <#person> a sh:NodeShape ; sh:targetClass ex:Person ;
           sh:property [ sh:path ex:name ; sh:minCount 1 ] .`,
      SHAPES_URL,
    );
    const e = createEngine(targeted);
    const data = await datasetFromTurtle(
      `@prefix ex: <https://example.com/ns#> .
       <#b> a ex:Person . <#a> a ex:Person . <#c> a ex:Person ; ex:name "Cy" .`,
      DATA_URL,
    );
    expect(await e.validate(data)).toEqual([
      {
        focusNode: `${DATA_URL}#a`,
        path: "https://example.com/ns#name",
        message: { en: "Less than 1 values" },
        builtIn: true,
        severity: "violation",
        constraint: "MinCount",
      },
      {
        focusNode: `${DATA_URL}#b`,
        path: "https://example.com/ns#name",
        message: { en: "Less than 1 values" },
        builtIn: true,
        severity: "violation",
        constraint: "MinCount",
      },
    ]);
    const good = await datasetFromTurtle(
      `<#a> a <https://example.com/ns#Person> ; <https://example.com/ns#name> "Ann" .`,
      DATA_URL,
    );
    expect(await e.validate(good)).toEqual([]);
  });

  describe.each([
    ["a cycle of them", subclassCycle],
    ["a diamond of them 30 layers deep", subclassDiamond],
  ])("with a document's own rdfs:subClassOf statements, %s", (_, statements) => {
    const EX = "https://example.com/ns#";
    const tangle = statements(`${EX}Person`, (name) => `${EX}${name}`);
    /** A subclass of ex:Person, by the document's statements. */
    const sub = tangle[0][0];
    /** The Turtle of a document: `turtle`, and the statements under ex:Person. */
    const tangled = (turtle: string) =>
      [turtle, ...tangle.map(([s, p, o]) => `<${s}> <${p}> <${o}> .`)].join("\n");

    it("checks a node's class by its own types alone, without following them", async () => {
      const e = createEngine(
        await datasetFromTurtle(
          `@prefix sh: <http://www.w3.org/ns/shacl#> .
           <#person> a sh:NodeShape ; sh:class <${EX}Person> .`,
          SHAPES_URL,
        ),
      );
      const data = await datasetFromTurtle(
        tangled(`<#a> a <${EX}Person> . <#b> a <${sub}> .`),
        DATA_URL,
      );
      expect(await e.validateNode(data, `${DATA_URL}#a`, `${SHAPES_URL}#person`)).toEqual([]);
      expect(await e.validateNode(data, `${DATA_URL}#b`, `${SHAPES_URL}#person`)).toEqual([
        expect.objectContaining({ constraint: "Class", value: `${DATA_URL}#b` }),
      ]);
    }, 10_000);

    it("targets a class's own instances alone, without following them, and leaves the document as it was", async () => {
      const e = createEngine(
        await datasetFromTurtle(
          `@prefix sh: <http://www.w3.org/ns/shacl#> .
           <#person> a sh:NodeShape ; sh:targetClass <${EX}Person> ;
               sh:property [ sh:path <${EX}name> ; sh:minCount 1 ] .`,
          SHAPES_URL,
        ),
      );
      const data = await datasetFromTurtle(
        tangled(`<#a> a <${EX}Person> . <#b> a <${sub}> .`),
        DATA_URL,
      );
      expect((await e.validate(data)).map((v) => [v.focusNode, v.constraint])).toEqual([
        [`${DATA_URL}#a`, "MinCount"],
      ]);
      expect(data.size).toBe(tangle.length + 2);
    }, 10_000);
  });

  it("copies a document without its rdfs:subClassOf statements once for all its subjects, and again once it changes", async () => {
    const EX = "https://example.com/ns#";
    const e = createEngine(
      await datasetFromTurtle(
        `@prefix sh: <http://www.w3.org/ns/shacl#> .
         <#person> a sh:NodeShape ; sh:class <${EX}Person> .`,
        SHAPES_URL,
      ),
    );
    const subjects = Array.from({ length: 200 }, (_, i) => `${DATA_URL}#p${i}`);
    const data = await datasetFromTurtle(
      [
        `<${EX}Student> <http://www.w3.org/2000/01/rdf-schema#subClassOf> <${EX}Person> .`,
        ...subjects.map((s) => `<${s}> a <${EX}Person> .`),
        `<#s> a <${EX}Student> .`,
      ].join("\n"),
      DATA_URL,
    );
    const copied = vi.spyOn(data as Iterable<Quad>, Symbol.iterator);
    for (const subject of subjects) {
      expect(await e.validateNode(data, subject, `${SHAPES_URL}#person`)).toEqual([]);
    }
    expect(copied).toHaveBeenCalledTimes(1);
    const student = `${DATA_URL}#s`;
    expect(await e.validateNode(data, student, `${SHAPES_URL}#person`)).toEqual([
      expect.objectContaining({ constraint: "Class" }),
    ]);
    for (const q of await datasetFromTurtle(`<#s> a <${EX}Person> .`, DATA_URL)) data.add(q);
    expect(await e.validateNode(data, student, `${SHAPES_URL}#person`)).toEqual([]);
    expect(copied).toHaveBeenCalledTimes(2);
  });
});

describe("numeric datatypes", () => {
  const XSD = "http://www.w3.org/2001/XMLSchema#";
  const EX = "https://example.com/ns#";
  const NUMBERS = `
@prefix sh:  <http://www.w3.org/ns/shacl#> .
@prefix xsd: <${XSD}> .
@prefix ex:  <${EX}> .
<#shape> a sh:NodeShape ;
    sh:property [ sh:path ex:decimal ; sh:datatype xsd:decimal ] ,
                [ sh:path ex:float ; sh:datatype xsd:float ] ,
                [ sh:path ex:double ; sh:datatype xsd:double ] .
`;
  /**
   * Which of `values`, each typed `datatype`, the engine finds not to be of
   * it, and how long the check alone took, without building the engine or
   * parsing the data.
   */
  async function check(
    datatype: string,
    values: string[],
  ): Promise<{ refused: string[]; ms: number }> {
    const e = createEngine(await datasetFromTurtle(NUMBERS, SHAPES_URL));
    const data = await datasetFromTurtle(
      `<#a> ${values.map((v) => `<${EX}${datatype}> ${JSON.stringify(v)}^^<${XSD}${datatype}>`).join(" ; ")} .`,
      DATA_URL,
    );
    const started = performance.now();
    const violations = await e.validateNode(data, `${DATA_URL}#a`, `${SHAPES_URL}#shape`);
    const ms = performance.now() - started;
    return { refused: violations.map((v) => v.value!).sort(), ms };
  }

  /** Which of `values`, each typed `datatype`, the engine finds not to be of it. */
  async function refused(datatype: string, values: string[]): Promise<string[]> {
    return (await check(datatype, values)).refused;
  }

  const DECIMALS = ["0", "-1", "+1", "1.5", "-0.25", "1.", ".5", "007.700"];
  const NOT_DECIMALS = ["", ".", "1x", "x1", "1.2.3", "1e5", "+-1", "1 ", "INF"];

  it("takes a decimal with or without a dot or a sign, and nothing else", async () => {
    expect(await refused("decimal", [...DECIMALS, ...NOT_DECIMALS])).toEqual(
      [...NOT_DECIMALS].sort(),
    );
  });

  it.each(["float", "double"])(
    "takes a %s as a decimal with an exponent or none, or INF or NaN, and nothing else",
    async (property) => {
      const valid = [...DECIMALS, "1e5", "1.5E-3", ".5e+2", "-2E0", "INF", "-INF", "+INF", "NaN"];
      const invalid = [...NOT_DECIMALS.filter((v) => v !== "1e5" && v !== "INF"), "1e", "e5"];
      invalid.push("1e5.5", "inf", "nan", "-NaN");
      expect(await refused(property, [...valid, ...invalid])).toEqual(invalid.sort());
    },
  );

  it.each(["decimal", "float", "double"])(
    "checks a long %s that is not one in time linear in its length",
    async (property) => {
      // The library's patterns took time quadratic in a run of digits that
      // then fails to match, far past this budget on this one; a pattern
      // that splits the run one way only takes a tiny part of it.
      const value = `${"1".repeat(100_000)}x`;
      const result = await check(property, [value]);
      expect(result.refused).toEqual([value]);
      expect(result.ms).toBeLessThan(1500);
    },
  );

  it("checks a review state's long ease factor in time linear in its length", async () => {
    const shapeUrl = `${SHAPES_BASE}review-state/v2.ttl`;
    const e = createEngine(await datasetFromTurtle(await readSiteTurtle(shapeUrl), shapeUrl));
    const value = `${"1".repeat(100_000)}x`;
    const data = await datasetFromTurtle(
      `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
       <#card1> a sm:ReviewState ; sm:formatVersion 2 ; sm:intervalDays 1 ; sm:repetitions 1 ;
         sm:easeFactor "${value}"^^<${XSD}decimal> ; sm:due "2026-01-01" .`,
      DATA_URL,
    );
    const started = performance.now();
    const violations = await e.validateNode(data, `${DATA_URL}#card1`, `${shapeUrl}#shape`);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(violations).toContainEqual(
      expect.objectContaining({
        path: "https://solid-memo.com/ns/vocab/v1.ttl#easeFactor",
        constraint: "Datatype",
        value,
      }),
    );
  });
});

describe("mapIris", () => {
  it("maps every IRI, in any position, and leaves literals and blank nodes as they are", async () => {
    const data = await datasetFromTurtle(
      `<#a> <#p> <#b>, "x", _:n . _:n <https://example.com/ns#q> "1"^^<https://example.com/ns#type> .`,
      DATA_URL,
    );
    const moved = mapIris(data, (iri) =>
      iri.replace("https://example.com/", "https://moved.example/"),
    );
    const triples = [...(moved as Iterable<Quad>)].map((q) => [
      q.subject.value,
      q.predicate.value,
      q.object.value,
    ]);
    expect(triples).toEqual(
      expect.arrayContaining([
        [
          "https://moved.example/data.ttl#a",
          "https://moved.example/data.ttl#p",
          "https://moved.example/data.ttl#b",
        ],
        ["https://moved.example/data.ttl#a", "https://moved.example/data.ttl#p", "x"],
      ]),
    );
    const typed = [...(moved as Iterable<Quad>)].find((q) => q.object.value === "1")!;
    expect(typed.subject.termType).toBe("BlankNode");
    expect(typed.predicate.value).toBe("https://moved.example/ns#q");
    expect((typed.object as Literal).datatype.value).toBe("https://example.com/ns#type");
    expect(moved.size).toBe(4);
  });
});

describe("mergeDatasets", () => {
  it("holds the quads of every part", async () => {
    const a = await datasetFromTurtle(`<#a> <#p> "1" .`, DATA_URL);
    const b = await datasetFromTurtle(`<#b> <#p> "2" .`, DATA_URL);
    expect(mergeDatasets(a as Iterable<Quad>, b as Iterable<Quad>).size).toBe(2);
  });
});
