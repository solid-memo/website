// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Literal, Quad } from "@rdfjs/types";
import type { Dataset } from "./interface";
import { changesOf, localNameOf } from "./rdf";

/**
 * The SPARQL Update bodies of the PATCH requests the app sends: a saved
 * edit's (resources.ts writeDocument) and an append's (datasets.ts),
 * written by the app rather than by a library. One triple a line, each
 * closed by " .": node-solid-server's parser fails on a triple whose
 * closing "." touches the term before it (`<#a> <#b> 1.}`), and
 * @inrupt/solid-client writes every patch that way.
 */

/**
 * The largest PATCH body sent; a larger edit is a PUT of the whole
 * document. Well under 100 kB: node-solid-server reads a PATCH body of
 * at most that, and past it parses "[object Object]" and fails.
 */
export const MAX_PATCH_BYTES = 64 * 1024;

const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";
const XSD_DECIMAL = "http://www.w3.org/2001/XMLSchema#decimal";

/**
 * The SPARQL Update of a dataset's changes, one triple a line in
 * N-Triples form, every triple closed by " .": what every Solid server
 * parses, node-solid-server's too. Null when the dataset has no change
 * log, or a change has a blank node, which DELETE DATA cannot name.
 *
 * `decimalsAsNumbers` spells each decimal deleted as JavaScript spells
 * its number (`1` for `1.0`, `2.5` for `2.50`): how node-solid-server
 * reads a decimal in the document it patches, though it serves a whole
 * one with `.0` (`1` written, `1.0` served), so a deletion spelled as
 * read is not found there (writeDocument).
 */
export function patchBody(dataset: Dataset, decimalsAsNumbers = false): string | null {
  const changes = changesOf(dataset);
  if (changes === undefined) return null;
  const block = (operation: string, quads: readonly Quad[], asNumbers: boolean): string | null => {
    const triples = quads.map((quad) => tripleLine(quad, asNumbers));
    if (triples.includes(null)) return null;
    return triples.length === 0 ? "" : `${operation} {\n${triples.join("\n")}\n};\n`;
  };
  const deletions = block("DELETE DATA", changes.deletions, decimalsAsNumbers);
  const additions = block("INSERT DATA", changes.additions, false);
  return deletions === null || additions === null ? null : deletions + additions;
}

/** A quad as one N-Triples line, closed by " ."; null for one with a blank node. */
export function tripleLine(quad: Quad, decimalsAsNumbers: boolean): string | null {
  const { subject, predicate, object } = quad;
  if (
    subject.termType !== "NamedNode" ||
    (object.termType !== "NamedNode" && object.termType !== "Literal")
  ) {
    return null;
  }
  return `${iri(subject.value)} ${iri(predicate.value)} ${object.termType === "Literal" ? literal(object, decimalsAsNumbers) : iri(object.value)} .`;
}

function iri(value: string): string {
  const name = localNameOf(value);
  return name === undefined ? `<${value}>` : `<#${name}>`;
}

function literal(term: Literal, decimalsAsNumbers: boolean): string {
  const value =
    decimalsAsNumbers && term.datatype.value === XSD_DECIMAL
      ? String(Number.parseFloat(term.value))
      : term.value;
  const text = `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")}"`;
  if (term.language !== "") return `${text}@${term.language}`;
  return term.datatype.value === XSD_STRING ? text : `${text}^^<${term.datatype.value}>`;
}
