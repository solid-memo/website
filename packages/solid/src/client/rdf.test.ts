// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { rdfContract } from "../testing/contract/rdf";
import type { Subject } from "./interface";
import * as rdf from "./rdf";
import * as resources from "./resources";

rdfContract({ rdf, resources });

const URL_ = "https://pod.example/decks/deck.ttl";
const EX = "https://example.com/ns#";
const XSD = "http://www.w3.org/2001/XMLSchema#";

describe("propertiesOf, of the library's subjects", () => {
  it("names a blank node the library holds nested, with no label, and gives a property with no value none", () => {
    const subject = {
      type: "Subject",
      url: `${URL_}#a`,
      predicates: {
        [`${EX}p`]: {
          namedNodes: ["https://iri.example/x"],
          literals: { [`${XSD}integer`]: ["42"] },
          langStrings: { en: ["hello"] },
          blankNodes: ["_:b0", { predicates: {} } as never],
        },
        [`${EX}q`]: {},
      },
    } as Subject;
    expect(rdf.propertiesOf(subject)).toEqual([
      {
        predicate: `${EX}p`,
        values: [
          { type: "iri", value: "https://iri.example/x" },
          { type: "literal", value: "42", dataType: `${XSD}integer` },
          { type: "langString", value: "hello", language: "en" },
          { type: "blankNode", value: "_:b0" },
          { type: "blankNode", value: "[blank node]" },
        ],
      },
      { predicate: `${EX}q`, values: [] },
    ]);
  });
});
