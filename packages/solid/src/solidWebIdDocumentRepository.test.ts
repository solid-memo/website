// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { buildThing, createThing, setThing } from "./client/rdf";
import { getSolidDataset } from "./client/resources";
import { datasetFrom } from "./testing/datasets";
import { createSolidWebIdDocumentRepository } from "./solidWebIdDocumentRepository";

vi.mock("./client/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client/resources")>();
  return { ...actual, getSolidDataset: vi.fn() };
});

describe("createSolidWebIdDocumentRepository", () => {
  it("fetches the WebID document with the injected fetch and maps it", async () => {
    const webId = "https://alice.example/profile/card#me";
    const documentUrl = "https://alice.example/profile/card";
    const dataset = setThing(
      datasetFrom(documentUrl),
      buildThing(createThing({ url: webId }))
        .addStringNoLocale("http://xmlns.com/foaf/0.1/name", "Alice")
        .build(),
    );
    vi.mocked(getSolidDataset).mockResolvedValue(dataset);

    const fetch = vi.fn();
    const repository = createSolidWebIdDocumentRepository({ fetch });
    const document = await repository.fetchWebIdDocument(webId);

    expect(getSolidDataset).toHaveBeenCalledWith(webId, { fetch });
    expect(document.url).toBe(documentUrl);
    expect(document.subjects).toHaveLength(1);
    expect(document.subjects[0].url).toBe(webId);
  });
});
