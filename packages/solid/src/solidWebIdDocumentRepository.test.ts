// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { buildThing, createThing, setThing } from "./client/rdf";
import { limitsOf, PROFILE_LIMITS } from "./client/readLimits";
import { getSolidDataset } from "./client/resources";
import { datasetFrom } from "./testing/datasets";
import { createSolidWebIdDocumentRepository } from "./solidWebIdDocumentRepository";

vi.mock("./client/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client/resources")>();
  return { ...actual, getSolidDataset: vi.fn() };
});

describe("createSolidWebIdDocumentRepository", () => {
  it("fetches the WebID document with the injected fetch, under PROFILE_LIMITS, and maps it", async () => {
    const webId = "https://alice.example/profile/card#me";
    const documentUrl = "https://alice.example/profile/card";
    const dataset = setThing(
      datasetFrom(documentUrl),
      buildThing(createThing({ url: webId }))
        .addStringNoLocale("http://xmlns.com/foaf/0.1/name", "Alice")
        .build(),
    );
    vi.mocked(getSolidDataset).mockResolvedValue(dataset);

    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("<#me> <#p> <#o> ."));
    const repository = createSolidWebIdDocumentRepository({ fetch });
    const document = await repository.fetchWebIdDocument(webId);

    expect(getSolidDataset).toHaveBeenCalledWith(webId, { fetch: expect.any(Function) });
    const profileFetch = vi.mocked(getSolidDataset).mock.calls[0]![1]!.fetch!;
    expect(limitsOf(await profileFetch(documentUrl))).toBe(PROFILE_LIMITS);
    expect(fetch).toHaveBeenCalledWith(documentUrl, undefined);
    expect(document.url).toBe(documentUrl);
    expect(document.subjects).toHaveLength(1);
    expect(document.subjects[0].url).toBe(webId);
  });
});
