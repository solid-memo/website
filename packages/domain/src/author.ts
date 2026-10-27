// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/** Who made something, as a deck names them in `dcterms:creator`. */
export interface Author {
  name: string;
  /** Stated when the literal is written "Name <email>". */
  email?: string;
}

/**
 * An address in angle brackets: one "@" with text on both sides, and no
 * whitespace or brackets. Each run excludes "@", so it is matched in one
 * pass.
 */
const ADDRESS = /^[^\s<>@]+@[^\s<>@]+$/;

/** What a regular expression's "." doesn't match: a name stays on one line. */
const LINE_TERMINATOR = /[\n\r\u2028\u2029]/;

/**
 * Read an author literal. "Anton Wiklund <anton@example.com>" gives the
 * name and the address; anything else is a name alone. An address with
 * no name before it is its own name.
 *
 * The literal comes from any release, so it is split by its last "<"
 * rather than by a pattern that backtracks, which took time cubic in a
 * long run of whitespace.
 */
export function parseAuthor(literal: string): Author {
  const text = literal.trim();
  const open = text.lastIndexOf("<");
  if (open === -1 || !text.endsWith(">")) return { name: text };
  const email = text.slice(open + 1, -1);
  const name = text.slice(0, open).trim();
  if (!ADDRESS.test(email) || LINE_TERMINATOR.test(name)) return { name: text };
  return { name: name === "" ? email : name, email };
}
