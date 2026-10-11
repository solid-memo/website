// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { getSolidDataset, toRdfJsDataset } from "@inrupt/solid-client";
import type { DatasetCore } from "@rdfjs/types";

/**
 * A Turtle document as an RDF/JS dataset, parsed the way the app parses
 * pod documents (through @inrupt/solid-client), for tests of the SHACL
 * modules. `url` is what relative IRIs resolve against.
 */
export async function datasetFromTurtle(turtle: string, url: string): Promise<DatasetCore> {
  return toRdfJsDataset(await getSolidDataset(url, { fetch: turtleFetch(turtle) }));
}

/** A fetch that answers every request with the given Turtle. */
export function turtleFetch(turtle: string): typeof fetch {
  return async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const response = new Response(turtle, {
      status: 200,
      headers: { "Content-Type": "text/turtle" },
    });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };
}
