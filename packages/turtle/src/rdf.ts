// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { Parser, type Quad, type Quad_Object } from "n3";

/**
 * Small helpers over n3 for the build-time tooling: parsing Turtle into
 * quads (kept in document order, which the generators rely on for
 * stable output) and reading a folder of Turtle files.
 */

export const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
export const RDF_FIRST = "http://www.w3.org/1999/02/22-rdf-syntax-ns#first";
export const RDF_REST = "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest";
export const RDF_NIL = "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil";

export function parseTurtle(turtle: string, baseIRI: string): Quad[] {
  return new Parser({ baseIRI }).parse(turtle);
}

/** The objects of every (subject, predicate) quad, in document order. */
export function objectsOf(
  quads: readonly Quad[],
  subject: string,
  predicate: string,
): Quad_Object[] {
  return quads
    .filter((q) => q.subject.value === subject && q.predicate.value === predicate)
    .map((q) => q.object);
}

/** The subjects typed `type`, each once, in order of first appearance. */
export function subjectsOfType(quads: readonly Quad[], type: string): string[] {
  return [
    ...new Set(
      quads
        .filter((q) => q.predicate.value === RDF_TYPE && q.object.value === type)
        .filter((q) => q.subject.termType === "NamedNode")
        .map((q) => q.subject.value),
    ),
  ];
}

/** The members of an RDF list, given its head node. */
export function listMembers(quads: readonly Quad[], head: Quad_Object): Quad_Object[] {
  const members: Quad_Object[] = [];
  let node = head;
  while (node.value !== RDF_NIL) {
    members.push(...objectsOf(quads, node.value, RDF_FIRST));
    const rest = objectsOf(quads, node.value, RDF_REST)[0];
    if (rest === undefined) break;
    node = rest;
  }
  return members;
}

/** The local name of an IRI: what follows the last `#` or `/`. */
export function localName(iri: string): string {
  return iri.slice(Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/")) + 1);
}

export interface TurtleFile {
  /** Path relative to the folder read, with `/` separators. */
  path: string;
  turtle: string;
}

/** Every `.ttl` file under `dir`, recursively, sorted by path. */
export async function readTurtleTree(dir: string): Promise<TurtleFile[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ttl"))
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .sort();
  return Promise.all(
    paths.map(async (path) => ({
      path,
      turtle: await readFile(join(dir, path), "utf8"),
    })),
  );
}
