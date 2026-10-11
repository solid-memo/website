import { describe, expect, it } from "vitest";
import {
  fromRdfJsDataset,
  getSolidDataset,
  getSourceIri,
  getStringNoLocale,
  getThing,
  getThingAll,
  toRdfJsDataset,
} from "@inrupt/solid-client";
import type { Quad } from "@rdfjs/types";
import { getSolidDatasetLinear, graphsOf } from "./linearDataset";

const URL_ = "https://pod.example/decks/deck.ttl";

/** Every kind of value solid-client keeps apart, a value twice, and blank nodes as subject and object. */
const TURTLE = `@prefix ex: <https://example.com/ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<#a> a ex:Card ; ex:front "Sweden" ; ex:back "Stockholm"@EN-gb, "Estocolmo"@es ;
    ex:count 3 ; ex:when "2026-10-01T10:00:00Z"^^xsd:dateTime ; ex:link <#b>, <#c> ;
    ex:note [ ex:text "blank" ] .
<#a> ex:front "Sweden" .
<#b> a ex:Card ; ex:front "Norway" .
`;

function turtleFetch(body: string, init: ResponseInit = {}): typeof globalThis.fetch {
  return async (input) => {
    const response = new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/turtle", ETag: '"v1"' },
      ...init,
    });
    Object.defineProperty(response, "url", { value: String(input) });
    return response;
  };
}

describe("getSolidDatasetLinear", () => {
  it("reads the same dataset as getSolidDataset", async () => {
    // n3 numbers blank nodes across parses, so this document has none (graphsOf's tests do).
    const fetch = turtleFetch(TURTLE.replace(` ;\n    ex:note [ ex:text "blank" ] .`, " ."));
    const expected = await getSolidDataset(URL_, { fetch });
    const actual = await getSolidDatasetLinear(URL_, { fetch });
    expect(actual.graphs).toEqual(expected.graphs);
    expect(actual.internal_resourceInfo).toEqual(expected.internal_resourceInfo);
    expect(getSourceIri(actual)).toBe(URL_);
    expect(getThingAll(actual)).toHaveLength(2);
    expect(getStringNoLocale(getThing(actual, `${URL_}#b`)!, "https://example.com/ns#front")).toBe(
      "Norway",
    );
    expect(Object.isFrozen(actual)).toBe(true);
  });

  it("fails as getSolidDataset does on a document that is not Turtle", async () => {
    await expect(
      getSolidDatasetLinear(URL_, { fetch: turtleFetch("<#a> <#b> .") }),
    ).rejects.toThrow(`Encountered an error parsing the Resource at [${URL_}]`);
  });

  it("fails as getSolidDataset does on a missing document", async () => {
    await expect(
      getSolidDatasetLinear(URL_, { fetch: turtleFetch("", { status: 404 }) }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("graphsOf", () => {
  /** The document's quads as solid-client reads them, so blank nodes are named alike. */
  const quadsOf = async (turtle: string): Promise<Quad[]> => [
    ...toRdfJsDataset(await getSolidDataset(URL_, { fetch: turtleFetch(turtle) })),
  ];

  it("builds what solid-client's fromRdfJsDataset builds, each value once", async () => {
    const quads = await quadsOf(TURTLE);
    const expected = fromRdfJsDataset(
      quads as unknown as Parameters<typeof fromRdfJsDataset>[0],
    ).graphs;
    expect(graphsOf(quads)).toEqual(expected);
    expect(graphsOf([...quads, ...quads])).toEqual(expected);
  });

  it("keeps a named graph apart from the default graph", async () => {
    const [first] = await quadsOf(`<#a> <https://example.com/ns#p> "x" .`);
    const { subject, predicate, object } = first!;
    const graphs = graphsOf([
      {
        subject,
        predicate,
        object,
        graph: { termType: "NamedNode", value: "https://example.com/g" },
      } as Quad,
    ]);
    expect(Object.keys(graphs)).toEqual(["default", "https://example.com/g"]);
    expect(
      graphs["https://example.com/g"]![`${URL_}#a`]!.predicates["https://example.com/ns#p"],
    ).toEqual({
      literals: { "http://www.w3.org/2001/XMLSchema#string": ["x"] },
    });
  });

  it("refuses an object solid-client cannot hold, as solid-client does", async () => {
    const [first] = await quadsOf(`<#a> <https://example.com/ns#p> "x" .`);
    const { subject, predicate, graph } = first!;
    const variable = {
      subject,
      predicate,
      graph,
      object: { termType: "Variable", value: "v" },
    } as Quad;
    expect(() => graphsOf([variable])).toThrow("Objects of type [Variable] are not supported.");
  });

  it("freezes every level", async () => {
    const graphs = graphsOf(await quadsOf(TURTLE));
    const subject = graphs.default[`${URL_}#a`]!;
    const objects = subject.predicates["https://example.com/ns#back"]!;
    expect(
      [
        graphs,
        graphs.default,
        subject,
        subject.predicates,
        objects,
        objects.langStrings,
        objects.langStrings!["en-gb"],
      ].every(Object.isFrozen),
    ).toBe(true);
  });
});
