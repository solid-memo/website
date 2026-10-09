import {
  getSolidDataset,
  getTurtleParser,
  type Parser,
  type SolidDataset,
} from "@inrupt/solid-client";
import type { Quad } from "@rdfjs/types";

type Graphs = SolidDataset["graphs"];
type Graph = Graphs["default"];
type Objects = Graph[string]["predicates"][string];
type Dataset = Awaited<ReturnType<typeof getSolidDataset>>;

const LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";

/**
 * getSolidDataset, with the dataset built in one pass. @inrupt/solid-client
 * adds each parsed quad by copying (and freezing) the whole graph again,
 * so reading a document takes time in the square of its size: 9 s for a
 * deck of 3,000 cards, where fetching and parsing it take 50 ms. Here
 * solid-client fetches the document and describes it (ETag, ACL, access)
 * as ever, but its parser hands it no quads: they are collected and built
 * into the same frozen structure, once each.
 */
export async function getSolidDatasetLinear(
  url: string,
  options: { fetch: typeof globalThis.fetch },
): Promise<Dataset> {
  const collected: { quads?: Quad[] } = {};
  const described = await getSolidDataset(url, {
    fetch: options.fetch,
    parsers: { "text/turtle": collectingTurtleParser(collected) },
  });
  // A dataset solid-client did not parse with our parser is its own already.
  if (collected.quads === undefined) return described;
  return Object.freeze({ ...described, graphs: graphsOf(collected.quads) });
}

/** solid-client's Turtle parser, whose quads go to `collected` instead of to solid-client. */
function collectingTurtleParser(collected: { quads?: Quad[] }): Parser {
  const parser = getTurtleParser();
  return {
    onQuad: () => undefined,
    onError: (callback) => parser.onError(callback),
    onComplete: (callback) => parser.onComplete(callback),
    parse: (source, resourceInfo) => {
      const quads: Quad[] = [];
      collected.quads = quads;
      parser.onQuad((quad) => quads.push(quad));
      parser.parse(source, resourceInfo);
    },
  };
}

/**
 * The graphs of a SolidDataset holding `quads`, as @inrupt/solid-client's
 * fromRdfJsDataset builds them (each value once, every level frozen),
 * but in time linear in the number of quads.
 */
export function graphsOf(quads: Iterable<Quad>): Graphs {
  const graphs: Record<string, Record<string, { type: "Subject"; url: string; predicates: Record<string, Objects> }>> = {
    default: {},
  };
  const seen = new Set<string>();
  for (const quad of quads) {
    const graphId = quad.graph.termType === "DefaultGraph" ? "default" : quad.graph.value;
    const subjectId = quad.subject.termType === "BlankNode" ? `_:${quad.subject.value}` : quad.subject.value;
    const key = `${graphId} ${subjectId} ${quad.predicate.value} ${termKey(quad.object)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const graph = (graphs[graphId] ??= {});
    const subject = (graph[subjectId] ??= { type: "Subject", url: subjectId, predicates: {} });
    const objects = (subject.predicates[quad.predicate.value] ??= {}) as {
      namedNodes?: string[];
      blankNodes?: string[];
      literals?: Record<string, string[]>;
      langStrings?: Record<string, string[]>;
    };
    const { object } = quad;
    if (object.termType === "NamedNode") {
      (objects.namedNodes ??= []).push(object.value);
    } else if (object.termType === "BlankNode") {
      (objects.blankNodes ??= []).push(`_:${object.value}`);
    } else if (object.termType === "Literal") {
      if (object.datatype.value === LANG_STRING) {
        ((objects.langStrings ??= {})[object.language.toLowerCase()] ??= []).push(object.value);
      } else {
        ((objects.literals ??= {})[object.datatype.value] ??= []).push(object.value);
      }
    } else {
      throw new Error(`Objects of type [${object.termType}] are not supported.`);
    }
  }
  return deepFreeze(graphs) as Graphs;
}

function termKey(term: Quad["object"]): string {
  if (term.termType !== "Literal") return `${term.termType} ${term.value}`;
  return `Literal ${term.datatype.value} ${term.language.toLowerCase()} ${term.value}`;
}

function deepFreeze<T extends object>(value: T): T {
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) deepFreeze(child);
  }
  return Object.freeze(value);
}
