// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad, Term } from "@rdfjs/types";
import { AppError } from "@solid-memo/domain/appError";
import { isWritableIri } from "@solid-memo/domain/webId";

/** The characters a Turtle name may start with (PN_CHARS_U), as ranges of a character class. */
const PN_CHARS_U =
  "A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";

/** The characters a Turtle name may go on with (PN_CHARS). */
const PN_CHARS = `${PN_CHARS_U}\\-0-9\\u00B7\\u0300-\\u036F\\u203F\\u2040`;

/** A blank node label as Turtle reads one after `_:` (BLANK_NODE_LABEL). */
const BLANK_LABEL = new RegExp(`^[${PN_CHARS_U}0-9](?:[${PN_CHARS}.]*[${PN_CHARS}])?$`, "u");

/** The datatypes of text in a language, which Turtle writes as `"…"@tag`, never with `^^`. */
const LANGUAGE_STRINGS = new Set([
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString",
]);

/**
 * A language tag as Turtle reads one after `@` (LANGTAG), its subtags no
 * longer than 8 characters as BCP 47 has them: the parser that reads the
 * pod (n3) refuses a longer one, so a document holding one could no
 * longer be read at all. A tag named like a member of Object.prototype
 * ("constructor") is one of those.
 */
const LANGUAGE = /^[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8})*$/;

/**
 * Whether Turtle can write a term as it is. No writer the app uses (the
 * Solid client library's, patchBody, turtleOf) escapes an IRI, a blank
 * node label or a language tag, and a JSON-LD parser keeps any text in
 * them: written, a `>` in an IRI ends it, and what follows is read as
 * statements no check saw (GHSA-x937-hx25-qfp4). Nor can it write text
 * typed as in a language without one, a base direction or a quoted
 * triple (RDF-star), none of which the app writes.
 */
function isWritable(term: Term): boolean {
  switch (term.termType) {
    case "NamedNode":
      return isWritableIri(term.value);
    case "BlankNode":
      return BLANK_LABEL.test(term.value);
    case "Literal":
      return (
        isWritableIri(term.datatype.value) &&
        (term.language === ""
          ? !LANGUAGE_STRINGS.has(term.datatype.value)
          : LANGUAGE.test(term.language)) &&
        (term.direction ?? "") === ""
      );
    case "Quad":
      return false;
    default:
      return true;
  }
}

/** The first term of a quad Turtle cannot write as it is (isWritable); undefined when there is none. */
export function unwritableTermOf(quad: Quad): Term | undefined {
  return [quad.subject, quad.predicate, quad.object, quad.graph].find((term) => !isWritable(term));
}

/** Throws unwritableTerm, naming the term, for the first quad with a term Turtle cannot write as it is. */
export function refuseUnwritable(quads: Iterable<Quad>): void {
  for (const quad of quads) {
    const term = unwritableTermOf(quad);
    if (term !== undefined) throw new AppError("unwritableTerm", { term: JSON.stringify(term) });
  }
}
