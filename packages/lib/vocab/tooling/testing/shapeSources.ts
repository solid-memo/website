// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readTurtleTree, type TurtleFile } from "@solid-memo/turtle/rdf";
import { SHAPES_BASE, VOCAB_BASE } from "../../src/ns.ts";
import { NS_ROOT } from "../root.ts";
import { readSiteTurtle, SITE_VENDOR } from "../sources.ts";

/**
 * The shapes and the site's documents as the tests of every package read
 * them: from this repository (sources.ts), so a test checks data the way
 * the app does, without the network.
 */

/** Every shape document (ns/shapes/<class>/v<N>.ttl), its path relative to SHAPES_BASE (`card/v1.ttl`), sorted. */
export function readShapeTree(): Promise<TurtleFile[]> {
  return readTurtleTree(`${NS_ROOT}shapes`);
}

/**
 * A fetch for tests that check documents the way the app does: the
 * site's documents read from this repository, at their own address; 404
 * for any other, or one it does not have.
 */
export const shapesFetch: typeof globalThis.fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  const turtle = await readSiteTurtle(url).catch(() => undefined);
  const response =
    turtle === undefined
      ? new Response(`${url} is not published from this repository.`, { status: 404 })
      : new Response(turtle, { headers: { "content-type": "text/turtle" } });
  return Object.defineProperty(response, "url", { value: url });
};

/** What a shape validator is given to find the shapes, the reference data and the profiles. */
export const SHAPE_SOURCES = {
  shapesBaseUrl: SHAPES_BASE,
  vocabBaseUrl: VOCAB_BASE,
  vendorBaseUrl: SITE_VENDOR,
} as const;
