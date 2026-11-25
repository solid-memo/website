// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createSolidInstanceGraphReader } from "./solidInstanceGraphReader";
import { fakePod } from "./testing/fakePod";

const INSTANCE = "https://pod.example/solid-memo/main/";
const CATALOG = `${INSTANCE}catalog.ttl`;
const XSD = "http://www.w3.org/2001/XMLSchema#";

describe("createSolidInstanceGraphReader", () => {
  it("reads a document's statements as they are: IRIs, blank nodes and literals", async () => {
    const pod = fakePod();
    await pod.put(
      CATALOG,
      [
        "@prefix dcterms: <http://purl.org/dc/terms/> .",
        `<#catalog> a <http://www.w3.org/ns/dcat#Catalog> ;`,
        `  dcterms:title "Mine"@en ;`,
        `  dcterms:publisher <https://pod.example/profile/card#me> ;`,
        `  dcterms:extent [ dcterms:description "3" ] ;`,
        `  dcterms:modified "2026-10-19"^^<${XSD}date> .`,
      ].join("\n"),
    );
    const read = await createSolidInstanceGraphReader({ fetch: pod.fetch }).readDocument(CATALOG);
    const catalog = `${CATALOG}#catalog`;
    expect(read).toHaveLength(6);
    expect(read).toEqual(
      expect.arrayContaining([
        {
          subject: catalog,
          predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
          object: { kind: "iri", value: "http://www.w3.org/ns/dcat#Catalog" },
        },
        {
          subject: catalog,
          predicate: "http://purl.org/dc/terms/title",
          object: {
            kind: "literal",
            value: "Mine",
            language: "en",
            datatype: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
          },
        },
        {
          subject: catalog,
          predicate: "http://purl.org/dc/terms/modified",
          object: { kind: "literal", value: "2026-10-19", language: "", datatype: `${XSD}date` },
        },
      ]),
    );
    const extent = read!.find((triple) => triple.predicate === "http://purl.org/dc/terms/extent")!;
    expect(extent.object.kind).toBe("blank");
    expect(read).toContainEqual({
      subject: `_:${extent.object.value}`,
      predicate: "http://purl.org/dc/terms/description",
      object: { kind: "literal", value: "3", language: "", datatype: `${XSD}string` },
    });
  });

  it("reads no document where there is none, and nothing it names", async () => {
    const pod = fakePod();
    await expect(
      createSolidInstanceGraphReader({ fetch: pod.fetch }).readDocument(CATALOG),
    ).resolves.toBeNull();
    expect(pod.requests.map(({ method, url }) => [method, url])).toEqual([["GET", CATALOG]]);
  });

  it("asks again for a document read before with its version, and reads it from what it kept", async () => {
    const pod = fakePod();
    await pod.put(CATALOG, `<#catalog> <http://purl.org/dc/terms/title> "Mine" .`);
    const reader = createSolidInstanceGraphReader({ fetch: pod.fetch });
    const first = await reader.readDocument(CATALOG);
    await expect(reader.readDocument(CATALOG)).resolves.toEqual(first);
    expect(pod.requests.map(({ status }) => status)).toEqual([200, 304]);
  });

  it("fails as the pod refuses", async () => {
    const pod = fakePod();
    pod.failNext("GET", CATALOG, 403);
    await expect(
      createSolidInstanceGraphReader({ fetch: pod.fetch }).readDocument(CATALOG),
    ).rejects.toThrow();
  });
});
