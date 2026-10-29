// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileStorages } from "./client/resources";
import { readDataset } from "./datasets";
import { createSolidStorageGateway, hasStorageLink } from "./solidStorageGateway";
import { datasetFrom, datasetOfTurtle } from "./testing/datasets";

vi.mock("./datasets", () => ({ readDataset: vi.fn() }));

/** The profile lookup, faked: the storages it finds are each test's. */
const profileStorages = vi.fn<ProfileStorages>();
const WEBID = "https://alice.example/profile/card#me";
const STORAGE_LINK = '<http://www.w3.org/ns/pim/space#Storage>; rel="type"';

function headResponse(linkHeader?: string): Response {
  const headers = new Headers();
  if (linkHeader !== undefined) {
    headers.set("Link", linkHeader);
  }
  return new Response(null, { status: 200, headers });
}

describe("hasStorageLink", () => {
  it("is false without a Link header", () => {
    expect(hasStorageLink(null)).toBe(false);
  });

  it("recognizes a storage type link among several links", () => {
    expect(
      hasStorageLink(`<http://www.w3.org/ns/ldp#Container>; rel="type", ${STORAGE_LINK}`),
    ).toBe(true);
  });

  it("requires rel=type, not just the Storage IRI", () => {
    expect(hasStorageLink('<http://www.w3.org/ns/pim/space#Storage>; rel="describedby"')).toBe(
      false,
    );
  });
});

describe("createSolidStorageGateway", () => {
  beforeEach(() => {
    profileStorages.mockReset();
    vi.mocked(readDataset).mockResolvedValue(datasetFrom("https://alice.example/profile/card"));
  });

  describe("discoverStorages", () => {
    it("returns profile storages when pim:storage triples exist", async () => {
      profileStorages.mockResolvedValue(["https://alice.example/", "https://backup.example/"]);
      const fetch = vi.fn();
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([
        { url: "https://alice.example/", source: "profile" },
        { url: "https://backup.example/", source: "profile" },
      ]);
      expect(fetch).not.toHaveBeenCalled();
      // The WebID document too is read through the fetch given, never the browser's own.
      expect(readDataset).toHaveBeenCalledWith(WEBID, fetch);
      expect(profileStorages).toHaveBeenCalledWith(WEBID, {
        fetch: expect.any(Function),
        webIdProfile: await vi.mocked(readDataset).mock.results[0]!.value,
      });
    });

    it("reads more of the profile as the user in its own places alone, and nothing anywhere else", async () => {
      vi.mocked(readDataset).mockResolvedValue(
        await datasetOfTurtle(
          "https://alice.example/profile/card",
          "<#me> <http://www.w3.org/ns/pim/space#storage> <https://storage.example/alice/> .",
        ),
      );
      profileStorages.mockResolvedValue(["https://alice.example/"]);
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(""));
      await createSolidStorageGateway({ fetch, profileStorages }).discoverStorages(WEBID);
      const profileFetch = profileStorages.mock.calls[0]![1].fetch!;

      // The WebID's origin, and a storage its document names, are the user's.
      await profileFetch("https://alice.example/profile/extended");
      await profileFetch("https://storage.example/alice/profile");
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "https://alice.example/profile/extended",
        "https://storage.example/alice/profile",
      ]);
      // A document the profile links anywhere else is not read at all.
      fetch.mockClear();
      await expect(profileFetch("https://elsewhere.example/doc")).rejects.toThrow(
        "outside the profile's own places",
      );
      await expect(profileFetch("https://storage.example/bob/profile")).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("falls back to the Link-header walk-up when the profile has none", async () => {
      profileStorages.mockResolvedValue([]);
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(headResponse())
        .mockResolvedValueOnce(headResponse())
        .mockResolvedValueOnce(headResponse(STORAGE_LINK));
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([
        { url: "https://alice.example/", source: "linkHeader" },
      ]);
      expect(fetch).toHaveBeenCalledWith("https://alice.example/profile/card", {
        method: "HEAD",
      });
    });

    it("skips candidates whose HEAD request fails", async () => {
      profileStorages.mockResolvedValue([]);
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValueOnce(headResponse(STORAGE_LINK));
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([
        { url: "https://alice.example/profile/", source: "linkHeader" },
      ]);
    });

    it("returns an empty list when nothing advertises a storage", async () => {
      profileStorages.mockResolvedValue([]);
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(headResponse());
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([]);
      // The document, then each ancestor container up to the root.
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "https://alice.example/profile/card",
        "https://alice.example/profile/",
        "https://alice.example/",
      ]);
    });
  });

  describe("probeStorage", () => {
    it("normalizes the URL with a trailing slash and accepts a 200", async () => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(headResponse());
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.probeStorage("https://pod.example")).resolves.toEqual({
        url: "https://pod.example/",
        source: "manual",
      });
      expect(fetch).toHaveBeenCalledWith("https://pod.example/", {
        method: "HEAD",
      });
    });

    it("keeps an existing trailing slash", async () => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(headResponse());
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.probeStorage("https://pod.example/")).resolves.toEqual({
        url: "https://pod.example/",
        source: "manual",
      });
    });

    it("rejects when the storage is not reachable", async () => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response(null, { status: 403 }));
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.probeStorage("https://pod.example/")).rejects.toThrow("status: 403");
    });
  });
});
