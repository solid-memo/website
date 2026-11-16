// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { limitsOf, PROFILE_LIMITS, spentOf } from "./client/readLimits";
import type { ProfileStorages } from "./client/resources";
import { readDataset } from "./datasets";
import { createSolidStorageGateway, hasStorageLink } from "./solidStorageGateway";
import { datasetFrom, datasetOfTurtle } from "./testing/datasets";

vi.mock("./datasets", () => ({ readDataset: vi.fn() }));

/** The profile lookup, faked: the storages it finds are each test's. */
const profileStorages = vi.fn<ProfileStorages>();
const CARD = "https://alice.example/profile/card";
const WEBID = `${CARD}#me`;
const STORAGE_LINK = '<http://www.w3.org/ns/pim/space#Storage>; rel="type"';
const LWS_STORAGE = "https://www.w3.org/ns/lws#storage";

/** An LWS storage description of `id`, its root container at `root`. */
function description(id: string, root: string) {
  return {
    "@context": ["https://www.w3.org/ns/cid/v1", "https://www.w3.org/ns/lws/v1"],
    id,
    type: "Storage",
    service: [{ type: "StorageRoot", serviceEndpoint: root }],
  };
}

const ALICE = "https://alice.example/";
const POD_CARD = "https://pod.example/alice/profile/card";
const POD_WEBID = `${POD_CARD}#me`;

/** Alice's WebID document, naming `storages` (pim:storage). */
function cardNaming(...storages: string[]) {
  return datasetOfTurtle(
    CARD,
    storages.map((url) => `<#me> <http://www.w3.org/ns/pim/space#storage> <${url}> .`).join("\n"),
  );
}

/** Alice's WebID document in a pod on an origin that holds other users' pods too, naming no storage. */
function podCard() {
  return datasetOfTurtle(POD_CARD, "<#me> a <http://xmlns.com/foaf/0.1/Person> .");
}

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
    it("takes the storages the WebID document names, and asks no server for one", async () => {
      vi.mocked(readDataset).mockResolvedValue(await cardNaming(ALICE, "https://backup.example/"));
      profileStorages.mockResolvedValue([ALICE, "https://backup.example/"]);
      const fetch = vi.fn();
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([
        { url: ALICE, source: "profile" },
        { url: "https://backup.example/", source: "profile" },
      ]);
      expect(fetch).not.toHaveBeenCalled();
      expect(readDataset).toHaveBeenCalledWith(WEBID, expect.any(Function));
      expect(profileStorages).toHaveBeenCalledWith(WEBID, {
        fetch: expect.any(Function),
        webIdProfile: await vi.mocked(readDataset).mock.results[0]!.value,
      });
    });

    it("takes a storage more of the profile names only inside one already known", async () => {
      vi.mocked(readDataset).mockResolvedValue(await cardNaming(ALICE));
      profileStorages.mockResolvedValue([
        ALICE,
        "https://alice.example/more/",
        "https://alice.example/more/",
        "https://bob.example/",
        "https://alice.example.evil.example/",
      ]);
      const gateway = createSolidStorageGateway({ fetch: vi.fn(), profileStorages });

      await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([
        { url: ALICE, source: "profile" },
        { url: "https://alice.example/more/", source: "profile" },
      ]);
    });

    it("reads more of the profile as the user in the user's own storages alone, and nothing anywhere else", async () => {
      vi.mocked(readDataset).mockResolvedValue(await cardNaming("https://storage.example/alice/"));
      profileStorages.mockResolvedValue([]);
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(""));
      await createSolidStorageGateway({ fetch, profileStorages }).discoverStorages(WEBID);
      const profileFetch = profileStorages.mock.calls[0]![1].fetch!;

      // A storage the WebID document names is the user's.
      await profileFetch("https://storage.example/alice/profile");
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "https://storage.example/alice/profile",
      ]);
      // A document the profile links anywhere else, even on the WebID's own origin, is not read at all.
      fetch.mockClear();
      await expect(profileFetch("https://alice.example/profile/extended")).rejects.toThrow(
        "outside the profile's own places",
      );
      await expect(profileFetch("https://elsewhere.example/doc")).rejects.toThrow();
      await expect(profileFetch("https://storage.example/bob/profile")).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("reads more of the profile in the storage the server shows when the WebID document names none", async () => {
      vi.mocked(readDataset).mockResolvedValue(await podCard());
      profileStorages.mockResolvedValue([
        "https://pod.example/alice/more/",
        "https://pod.example/mallory/",
        "https://evil.example/",
      ]);
      const fetch = vi.fn<typeof globalThis.fetch>(async (input) =>
        String(input) === "https://pod.example/alice/"
          ? headResponse(STORAGE_LINK)
          : headResponse(),
      );
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.discoverStorages(POD_WEBID)).resolves.toEqual([
        { url: "https://pod.example/alice/", source: "linkHeader" },
        { url: "https://pod.example/alice/more/", source: "profile" },
      ]);
      const profileFetch = profileStorages.mock.calls[0]![1].fetch!;
      fetch.mockClear();
      await profileFetch("https://pod.example/alice/shared.ttl");
      await expect(profileFetch("https://pod.example/mallory/shared.ttl")).rejects.toThrow(
        "outside the profile's own places",
      );
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "https://pod.example/alice/shared.ttl",
      ]);
    });

    it("reads more of the profile in the WebID's own pod when no storage is known", async () => {
      vi.mocked(readDataset).mockResolvedValue(await podCard());
      profileStorages.mockResolvedValue(["https://pod.example/alice/", "https://pod.example/"]);
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(headResponse());
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.discoverStorages(POD_WEBID)).resolves.toEqual([
        { url: "https://pod.example/alice/", source: "profile" },
      ]);
      const profileFetch = profileStorages.mock.calls[0]![1].fetch!;
      fetch.mockClear();
      await profileFetch("https://pod.example/alice/settings/more");
      await expect(profileFetch("https://pod.example/mallory/shared.ttl")).rejects.toThrow();
      expect(fetch).toHaveBeenCalledOnce();
    });

    it("takes a storage the WebID document names on another origin, and more of the profile inside it", async () => {
      vi.mocked(readDataset).mockResolvedValue(await cardNaming("https://storage.example/alice/"));
      profileStorages.mockResolvedValue([
        "https://storage.example/alice/",
        "https://storage.example/alice/more/",
        "https://storage.example/bob/",
        ALICE,
      ]);
      const fetch = vi.fn();
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([
        { url: "https://storage.example/alice/", source: "profile" },
        { url: "https://storage.example/alice/more/", source: "profile" },
      ]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("takes each storage once, as a request sends it, so no other spelling leads out of one", async () => {
      vi.mocked(readDataset).mockResolvedValue(
        await cardNaming("https://pod.example/alice/", "https://POD.example/alice/./"),
      );
      profileStorages.mockResolvedValue([
        "https://pod.example/alice/",
        "https://pod.example/alice/../mallory/",
        "https://pod.example/alice/%2e%2e/mallory/",
        "https://pod.example/alice/more/../more/",
        "https://pod.example/alice/more/",
      ]);
      const gateway = createSolidStorageGateway({ fetch: vi.fn(), profileStorages });

      await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([
        { url: "https://pod.example/alice/", source: "profile" },
        { url: "https://pod.example/alice/more/", source: "profile" },
      ]);
    });

    it.each(["https://pod.example/alice#me", "https://pod.example/profile/card#me"])(
      "reads no more of the profile and takes no storage from it when %s names none and the server shows none",
      async (webId) => {
        vi.mocked(readDataset).mockResolvedValue(
          await datasetOfTurtle(
            webId.split("#")[0]!,
            `<${webId}> a <http://xmlns.com/foaf/0.1/Person> .`,
          ),
        );
        profileStorages.mockResolvedValue([
          "https://pod.example/mallory/",
          "https://pod.example/",
          "https://evil.example/",
        ]);
        const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(headResponse());
        const gateway = createSolidStorageGateway({ fetch, profileStorages });

        await expect(gateway.discoverStorages(webId)).resolves.toEqual([]);
        const profileFetch = profileStorages.mock.calls[0]![1].fetch!;
        fetch.mockClear();
        await expect(profileFetch("https://pod.example/mallory/shared.ttl")).rejects.toThrow(
          "outside the profile's own places",
        );
        await expect(profileFetch("https://pod.example/extended.ttl")).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    it("reads the profile's documents through the fetch given, under PROFILE_LIMITS", async () => {
      vi.mocked(readDataset).mockResolvedValue(await cardNaming(ALICE));
      profileStorages.mockResolvedValue([ALICE]);
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => new Response("<#me> <#p> <#o> ."));
      const gateway = createSolidStorageGateway({ fetch, profileStorages });
      await gateway.discoverStorages(WEBID);
      await gateway.discoverStorages(WEBID);
      // The WebID document, never through the browser's own fetch, and through the same fetch each time (datasets.ts).
      const [[, webIdFetch], [, again]] = vi.mocked(readDataset).mock.calls as [
        [string, typeof globalThis.fetch],
        [string, typeof globalThis.fetch],
      ];
      expect(again).toBe(webIdFetch);
      expect(limitsOf(await webIdFetch(CARD))).toBe(PROFILE_LIMITS);
      const profileFetch = profileStorages.mock.calls[0]![1].fetch!;
      const extended = await profileFetch("https://alice.example/settings/extended");
      expect(limitsOf(extended)).toBe(PROFILE_LIMITS);
      // The further documents of one lookup share their limits, and the next lookup's are its own.
      const more = await profileFetch("https://alice.example/settings/more");
      expect(spentOf(more)).toBe(spentOf(extended));
      const next = await profileStorages.mock.calls[1]![1].fetch!(
        "https://alice.example/settings/extended",
      );
      expect(spentOf(next)).not.toBe(spentOf(extended));
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        CARD,
        "https://alice.example/settings/extended",
        "https://alice.example/settings/more",
        "https://alice.example/settings/extended",
      ]);
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
        headers: { Accept: "text/turtle, */*;q=0.1" },
      });
    });

    it("takes the storage a Linked Web Storage server links, as its description names its root", async () => {
      profileStorages.mockResolvedValue([]);
      const asked: [string, RequestInit | undefined][] = [];
      const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
        asked.push([String(input), init]);
        if (init?.method === "HEAD")
          return headResponse(`<https://alice.example/>; rel="${LWS_STORAGE}"`);
        return Response.json(description("https://alice.example/", "https://alice.example/"));
      });
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([
        { url: "https://alice.example/", source: "linkHeader" },
      ]);
      expect(asked).toEqual([
        [CARD, { method: "HEAD", headers: { Accept: "text/turtle, */*;q=0.1" } }],
        ["https://alice.example/", { headers: { Accept: "application/lws+cid" } }],
      ]);
    });

    it("walks on past a linked storage whose description can't be read", async () => {
      profileStorages.mockResolvedValue([]);
      const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
        if (init?.method !== "HEAD") return new Response(null, { status: 500 });
        return String(input) === "https://alice.example/"
          ? headResponse(STORAGE_LINK)
          : headResponse(`<https://alice.example/>; rel="${LWS_STORAGE}"`);
      });
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([
        { url: "https://alice.example/", source: "linkHeader" },
      ]);
    });

    it("walks on past a linked storage whose roots the document is not in", async () => {
      profileStorages.mockResolvedValue([]);
      const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
        if (init?.method !== "HEAD")
          return Response.json(description("https://alice.example/", "https://other.example/"));
        return String(input) === "https://alice.example/"
          ? headResponse(STORAGE_LINK)
          : headResponse(`<https://alice.example/>; rel="${LWS_STORAGE}"`);
      });
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([
        { url: "https://alice.example/", source: "linkHeader" },
      ]);
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

    it("walks up from a container WebID and from one at the origin root", async () => {
      profileStorages.mockResolvedValue([]);
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(headResponse());
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await gateway.discoverStorages("https://alice.example/a/b/?x=1#me");
      await gateway.discoverStorages("https://alice.example/#me");
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "https://alice.example/a/b/",
        "https://alice.example/a/",
        "https://alice.example/",
        "https://alice.example/",
      ]);
    });

    it("skips empty segments and asks nothing above a WebID with no hierarchy", async () => {
      profileStorages.mockResolvedValue([]);
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(headResponse());
      const gateway = createSolidStorageGateway({ fetch, profileStorages });

      await gateway.discoverStorages("https://a.example//card#me");
      await gateway.discoverStorages("urn:x:y");
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        "https://a.example//card",
        "https://a.example/",
        "urn:x:y",
      ]);
    });

    it("asks no more than eight ancestors, nearest first, however deep the WebID", async () => {
      profileStorages.mockResolvedValue([]);
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(headResponse());
      const gateway = createSolidStorageGateway({ fetch, profileStorages });
      // Deep enough that making every ancestor up front, as the walk-up
      // once did, would take the tab's memory.
      const nearest = `https://evil.example/${"a/".repeat(64_000)}`;

      await expect(gateway.discoverStorages(`${nearest}card#me`)).resolves.toEqual([]);
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        `${nearest}card`,
        ...Array.from({ length: 8 }, (_, i) => nearest.slice(0, nearest.length - 2 * i)),
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
