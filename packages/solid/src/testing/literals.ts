// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Literal } from "@rdfjs/types";

const XSD = "http://www.w3.org/2001/XMLSchema#";

/** A literal of `datatype` spelled as `value`, for a test to add with addLiteral. */
function typed(value: number, datatype: string): Literal {
  return {
    termType: "Literal",
    value: String(value),
    language: "",
    datatype: { termType: "NamedNode", value: datatype },
  } as Literal;
}

/** An xsd:integer literal of `value`, spelled as JavaScript spells it. */
export function integerLiteral(value: number): Literal {
  return typed(value, `${XSD}integer`);
}

/** An xsd:decimal literal of `value`, spelled as JavaScript spells it. */
export function decimalLiteral(value: number): Literal {
  return typed(value, `${XSD}decimal`);
}
