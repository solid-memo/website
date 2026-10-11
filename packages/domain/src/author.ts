// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/** Who made something, as a deck names them in `dcterms:creator`. */
export interface Author {
  name: string;
  /** Stated when the literal is written "Name <email>". */
  email?: string;
}

/** "Name <email>": a name, then an address in angle brackets. */
const NAME_AND_EMAIL = /^\s*(.*?)\s*<([^\s<>@]+@[^\s<>@]+)>\s*$/;

/**
 * Read an author literal. "Anton Wiklund <anton@example.com>" gives the
 * name and the address; anything else is a name alone. An address with
 * no name before it is its own name.
 */
export function parseAuthor(literal: string): Author {
  const match = literal.match(NAME_AND_EMAIL);
  if (match === null) return { name: literal.trim() };
  const [, name, email] = match;
  return { name: name === "" ? email : name, email };
}
