// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  getSolidDataset,
  getSourceUrl,
  type Parser,
  type SolidDataset,
} from "@inrupt/solid-client";
import type { Quad } from "@rdfjs/types";
import { Parser as N3Parser, type ParserOptions } from "n3";
import { ReadLimitError, type ReadLimits } from "./interface";
import { withBoundedHeaders } from "./linkHeader";
import {
  limitsOf,
  spentOf,
  NO_SIZE_LIMITS,
  pathKeys,
  quadTally,
  type ReadsSpent,
  refusalOf,
  type TextStream,
  writeTurtle,
} from "./readLimits";

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
 * into the same frozen structure, once each. A response read under
 * limits (readLimits.ts) is parsed under them too: past its triples, or
 * the characters of their terms, the read fails with a ReadLimitError
 * before any of it is built. A Turtle text whose base or prefix
 * declarations or IRIs are past what a read takes in fails so too, read
 * under limits or with none (writeTurtle). The library is given the
 * response with its `Link` and `WAC-Allow` headers bounded
 * (linkHeader.ts), read under limits or with none.
 */
export async function getSolidDatasetLinear(
  url: string,
  options: { fetch: typeof globalThis.fetch },
): Promise<Dataset> {
  const collected: Collected = {};
  const described = await getSolidDataset(url, {
    fetch: async (input, init) => {
      const response = await options.fetch(input, init);
      collected.response = response;
      collected.limits = limitsOf(response);
      collected.spent = spentOf(response);
      return withBoundedHeaders(response);
    },
    parsers: { "text/turtle": collectingTurtleParser(collected, url) },
  }).catch((error: unknown) => {
    // The library reports a parser's error as a plain one of its own, and the browser a body's as its own.
    throw collected.refused ?? refusalOf(collected.response) ?? error;
  });
  // solid-client parses what it returns with the parser for its type; ours is the only one it has.
  return Object.freeze({ ...described, graphs: graphsOf(collected.quads!) });
}

/**
 * @inrupt/solid-client's Turtle parser (getTurtleParser), n3's in
 * `text/turtle` with the document's URL as its base, but one that reads
 * no RDF 1.2 triple terms (`<<( s p o )>>`, or a reified triple
 * `<< s p o >>`): a text with one does not parse, as JSON-LD with
 * RDF-star does not (resources.ts). The library's parser reads them
 * nested a thousand deep, building each level, while quadTally counts
 * the triple that holds them once. n3 is told to read none, and the
 * parse fails at the first triple that holds one all the same, as an
 * annotation (`{| ... |}`) or a reifier (`~`) gives, which the option
 * does not keep n3 from reading; after its error it reports nothing more.
 */
export function turtleParser(): Parser {
  const onQuad: ((quad: Quad) => void)[] = [];
  const onError: ((error: unknown) => void)[] = [];
  const onComplete: (() => void)[] = [];
  return {
    onQuad: (callback) => void onQuad.push(callback),
    onError: (callback) => void onError.push(callback),
    onComplete: (callback) => void onComplete.push(callback),
    parse: (source, resourceInfo) => {
      // n3 takes the option; its types do not name it yet.
      const options: ParserOptions & { maxTripleTermDepth: number } = {
        format: "text/turtle",
        baseIRI: getSourceUrl(resourceInfo),
        maxTripleTermDepth: 0,
      };
      let failed = false;
      new N3Parser(options).parse(source, (error, quad) => {
        if (failed) return;
        const failure = error ?? (quad && tripleTermError(quad));
        if (failure) {
          failed = true;
          for (const callback of onError) callback(failure);
        } else if (quad) for (const callback of onQuad) callback(quad);
        else for (const callback of onComplete) callback();
      });
    },
  };
}

/** The error a parse fails with at a triple that holds a triple term; none for any other. */
function tripleTermError(quad: Quad): Error | undefined {
  if (quad.subject.termType !== "Quad" && quad.object.termType !== "Quad") return undefined;
  return new Error("The text states an RDF 1.2 triple term, which is not read.");
}

/** What a read's parser collected: its quads, and the read's response, its limits, what is spent of them and why it refused it, if it did. */
interface Collected {
  response?: Response;
  quads?: Quad[];
  limits?: ReadLimits;
  spent?: ReadsSpent;
  refused?: ReadLimitError;
}

/**
 * The Turtle parser (turtleParser), whose quads go to `collected`
 * instead of to solid-client; one past the limits of the read of `url` (quadTally)
 * fails the parse instead, once, and drops what was kept, as does a
 * base, prefix or IRI past what any read takes in (writeTurtle). The
 * text is written to the parser in parts, so that it reads no further
 * than the part it is in.
 */
function collectingTurtleParser(collected: Collected, url: string): Parser {
  const parser = turtleParser();
  const failed: ((error: Error) => void)[] = [];
  return {
    onQuad: () => undefined,
    onError: (callback) => {
      failed.push(callback);
      parser.onError(callback);
    },
    onComplete: (callback) => parser.onComplete(callback),
    parse: (source, resourceInfo) => {
      const quads: Quad[] = [];
      const past = quadTally(collected.limits, collected.spent);
      let unparsed = false;
      parser.onError(() => {
        unparsed = true;
      });
      collected.quads = quads;
      const refuse = () => {
        // The tally is past limits only under some; the declarations, under none too.
        collected.refused = new ReadLimitError(url, collected.limits ?? NO_SIZE_LIMITS);
        quads.length = 0;
        for (const callback of failed) callback(collected.refused);
      };
      parser.onQuad((quad) => {
        if (collected.refused !== undefined) return;
        if (!past(quad)) return quads.push(quad);
        refuse();
      });
      // solid-client hands the text to n3's parser as it is, which reads a stream as well.
      const parse = (stream: TextStream) => parser.parse(stream as unknown as string, resourceInfo);
      // A text that does not parse is written no further, as one past limits is not.
      const goOn = () => collected.refused === undefined && !unparsed;
      if (!writeTurtle(source, getSourceUrl(resourceInfo), parse, goOn)) refuse();
    },
  };
}

/**
 * The graphs of a SolidDataset holding `quads`, as @inrupt/solid-client's
 * fromRdfJsDataset builds them (each value once, every level frozen),
 * but in time linear in the number of quads. Every map is keyed by the
 * quads' own strings, so none has a prototype: a named graph, subject,
 * datatype or language called `__proto__` is a key like any other, not
 * a way to write onto Object.prototype (GHSA-m4hj-7c28-fq4h). A quad
 * is told from the others by the path of its terms (pathKeys), each a
 * key of its own, as no string of them joined would be held to the
 * bound on a term (MAX_TERM_CHARACTERS).
 */
export function graphsOf(quads: Iterable<Quad>): Graphs {
  const graphs =
    map<Record<string, { type: "Subject"; url: string; predicates: Record<string, Objects> }>>();
  graphs.default = map();
  const keyOf = pathKeys();
  const seen = new Set<number>();
  for (const quad of quads) {
    const graphId = quad.graph.termType === "DefaultGraph" ? "default" : quad.graph.value;
    const subjectId =
      quad.subject.termType === "BlankNode" ? `_:${quad.subject.value}` : quad.subject.value;
    const key = keyOf([graphId, subjectId, quad.predicate.value, ...termParts(quad.object)]);
    if (seen.has(key)) continue;
    seen.add(key);
    const graph = (graphs[graphId] ??= map());
    const subject = (graph[subjectId] ??= { type: "Subject", url: subjectId, predicates: map() });
    const objects = (subject.predicates[quad.predicate.value] ??= map()) as {
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
        ((objects.langStrings ??= map())[object.language.toLowerCase()] ??= []).push(object.value);
      } else {
        ((objects.literals ??= map())[object.datatype.value] ??= []).push(object.value);
      }
    } else {
      throw new Error(`Objects of type [${object.termType}] are not supported.`);
    }
  }
  return deepFreeze(graphs) as Graphs;
}

/** An empty map with no prototype, so that no key reaches Object.prototype. */
function map<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/** An object's parts, each a step of the path that tells its quad from others (graphsOf). */
function termParts(term: Quad["object"]): string[] {
  if (term.termType !== "Literal") return [term.termType, term.value];
  return ["Literal", term.datatype.value, term.language.toLowerCase(), term.value];
}

function deepFreeze<T extends object>(value: T): T {
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null) deepFreeze(child);
  }
  return Object.freeze(value);
}
