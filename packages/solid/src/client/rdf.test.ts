// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  removeThing as libraryRemoveThing,
  type SolidDataset,
  setThing as librarySetThing,
} from "@inrupt/solid-client";
import type { Quad } from "@rdfjs/types";
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

describe("setThing and removeThing, beside the library's own", () => {
  /** A dataset's quads and its changes, each as sorted lines. */
  const stateOf = (dataset: rdf.Dataset) => {
    const lines = (quads: Iterable<Quad>) =>
      [...quads]
        .map((quad) => `${quad.subject.value} ${quad.predicate.value} ${quad.object.value}`)
        .sort();
    const changes = rdf.changesOf(dataset)!;
    return {
      quads: lines(rdf.toRdfJsDataset(dataset)),
      additions: lines(changes.additions),
      deletions: lines(changes.deletions),
    };
  };

  it("hold the subjects and record the changes the library's setThing and removeThing do", async () => {
    const read = await resources.getSolidDatasetLinear(URL_, {
      fetch: async (input) => {
        const response = new Response(
          `<#a> <${EX}p> "a", <${EX}x> ; <${EX}q> [ <${EX}r> "blank" ] .`,
          {
            headers: { "Content-Type": "text/turtle" },
          },
        );
        Object.defineProperty(response, "url", { value: String(input) });
        return response;
      },
    });
    const a = rdf.getThing(read, `${URL_}#a`)!;
    const changed = rdf.buildThing(a).addStringWithLocale(`${EX}p`, "b", "en").build();
    const named = rdf
      .buildThing(rdf.createThing({ name: "n" }))
      .addIri(`${EX}p`, a)
      .build();
    const ours = rdf.removeThing(rdf.setThing(rdf.setThing(read, changed), named), `${URL_}#a`);
    const data = read as unknown as SolidDataset;
    const theirs = libraryRemoveThing(
      librarySetThing(librarySetThing(data, changed as never), named as never),
      `${URL_}#a`,
    );
    expect(stateOf(ours)).toEqual(stateOf(theirs as unknown as rdf.Dataset));
  });
});
