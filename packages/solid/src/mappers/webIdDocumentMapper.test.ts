// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  buildThing,
  createThing,
  mockSolidDatasetFrom,
  setThing,
  type Thing,
} from "@inrupt/solid-client";
import { toSubject, toWebIdDocument } from "./webIdDocumentMapper";

const SUBJECT = "https://alice.example/profile/card#me";

describe("toSubject", () => {
  it("maps a Thing's url and predicates", () => {
    const thing: Thing = buildThing(createThing({ url: SUBJECT }))
      .addStringNoLocale("http://xmlns.com/foaf/0.1/name", "Alice")
      .addIri("http://www.w3.org/ns/solid/terms#oidcIssuer", "https://issuer.example")
      .build();

    const subject = toSubject(thing);
    expect(subject.url).toBe(SUBJECT);
    expect(subject.properties).toContainEqual({
      predicate: "http://xmlns.com/foaf/0.1/name",
      values: [
        {
          type: "literal",
          value: "Alice",
          dataType: "http://www.w3.org/2001/XMLSchema#string",
        },
      ],
    });
    expect(subject.properties).toContainEqual({
      predicate: "http://www.w3.org/ns/solid/terms#oidcIssuer",
      values: [{ type: "iri", value: "https://issuer.example" }],
    });
  });
});

describe("toWebIdDocument", () => {
  it("maps the source url and all subjects", () => {
    const url = "https://alice.example/profile/card";
    let dataset = mockSolidDatasetFrom(url);
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: SUBJECT }))
        .addStringNoLocale("http://xmlns.com/foaf/0.1/name", "Alice")
        .build(),
    );

    const document = toWebIdDocument(dataset);
    expect(document.url).toBe(url);
    expect(document.subjects).toHaveLength(1);
    expect(document.subjects[0].url).toBe(SUBJECT);
  });
});
