// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DatasetCore } from "@rdfjs/types";
import { readTurtleDocument } from "../turtleDocument";

/**
 * A Turtle document as an RDF/JS dataset, parsed the way the app parses
 * pod documents (readTurtleDocument), for tests of the SHACL
 * modules. `url` is what relative IRIs resolve against.
 */
export function datasetFromTurtle(turtle: string, url: string): Promise<DatasetCore> {
  return readTurtleDocument(url, turtleFetch(turtle));
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
