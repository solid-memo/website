// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DatasetCore, Quad } from "@rdfjs/types";
import { Parser, type ParserOptions, Store } from "n3";

/**
 * How n3 parses Turtle in this package: with no RDF 1.2 triple terms
 * (`<<( s p o )>>`, or a reified triple `<< s p o >>`), as JSON-LD is
 * read with no RDF-star (resources.ts). n3 reads them nested a thousand
 * deep by default, building each level, while quadTally counts the
 * triple that holds them once. n3 takes the option; its types do not
 * name it yet.
 */
export const TURTLE_OPTIONS: ParserOptions & { maxTripleTermDepth: number } = {
  format: "text/turtle",
  maxTripleTermDepth: 0,
};

/**
 * The error a parse fails with at a triple that holds a triple term all
 * the same, as an annotation (`{| ... |}`) or a reifier (`~`) gives one,
 * which TURTLE_OPTIONS does not keep n3 from reading; none for any other.
 */
export function tripleTermError(quad: Quad): Error | undefined {
  if (quad.subject.termType !== "Quad" && quad.object.termType !== "Quad") return undefined;
  return new Error("The text states an RDF 1.2 triple term, which is not read.");
}

/** A failed read, with the response's status as Inrupt's FetchError has it. */
class TurtleFetchError extends Error {
  constructor(
    message: string,
    readonly response: Response,
  ) {
    super(message);
    this.name = "FetchError";
  }
  get statusCode(): number {
    return this.response.status;
  }
  get statusText(): string {
    return this.response.statusText;
  }
}

/**
 * The Turtle document at `url`, read through `fetch` and parsed with n3,
 * relative IRIs resolved against the URL the response came from, and
 * no RDF 1.2 triple terms read (TURTLE_OPTIONS, tripleTermError), as
 * resources.ts reads Turtle: the
 * replacement for shacl's src/turtleDocument.ts that names no Inrupt
 * library. It holds no term to the bound on its length (quadTally), so
 * it reads only the app's own shapes, never data from a pod.
 */
export async function readTurtleDocument(
  url: string,
  fetch: typeof globalThis.fetch,
): Promise<DatasetCore> {
  const response = await fetch(url, { headers: { Accept: "text/turtle" } });
  if (!response.ok) {
    const body = await response.clone().text();
    throw new TurtleFetchError(
      `Fetching the Resource at [${url}] failed: [${response.status}] [${response.statusText}] ${body}.`,
      response,
    );
  }
  const baseIRI = response.url || url;
  const quads = new Parser({ ...TURTLE_OPTIONS, baseIRI }).parse(await response.text());
  for (const quad of quads) {
    const error = tripleTermError(quad);
    if (error) throw error;
  }
  return new Store(quads);
}
