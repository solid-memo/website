// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { SITE } from "@solid-memo/vocab/tooling/sources";
import { shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { GUEST_ORIGIN, GUEST_SESSION } from "@solid-memo/domain/guest";
import { createLocalStorageUpdateJournal } from "@solid-memo/browser/localStorageUpdateJournal";
import { fakeLocks } from "@solid-memo/browser/testing/fakeLocks";
import { createAppUseCases, createSiteFetch } from "./appUseCases";

/** What each pod adapter was made with, by its factory's name, as the composition wires it. */
const { given, recorded } = vi.hoisted(() => {
  const given = new Map<string, Record<string, typeof globalThis.fetch>>();
  /** A module whose factory `name` is the original, its options recorded. */
  const recorded =
    (name: string) =>
    async (importOriginal: () => Promise<Record<string, unknown>>): Promise<object> => {
      const original = await importOriginal();
      const factory = original[name] as (
        options: Record<string, typeof globalThis.fetch>,
      ) => unknown;
      return {
        ...original,
        [name]: (options: Record<string, typeof globalThis.fetch>) => {
          given.set(name, options);
          return factory(options);
        },
      };
    };
  return { given, recorded };
});
vi.mock(
  "@solid-memo/solid/solidWebIdDocumentRepository",
  recorded("createSolidWebIdDocumentRepository"),
);
vi.mock("@solid-memo/solid/solidStorageGateway", recorded("createSolidStorageGateway"));
vi.mock("@solid-memo/solid/solidInstanceRepository", recorded("createSolidInstanceRepository"));
vi.mock("@solid-memo/solid/solidDeckRepository", recorded("createSolidDeckRepository"));
vi.mock(
  "@solid-memo/solid/solidPreferencesRepository",
  recorded("createSolidPreferencesRepository"),
);
vi.mock(
  "@solid-memo/solid/solidReviewStateRepository",
  recorded("createSolidReviewStateRepository"),
);
vi.mock("@solid-memo/solid/solidRepairRepository", recorded("createSolidRepairRepository"));
vi.mock("@solid-memo/solid/solidInstanceCopier", recorded("createSolidInstanceCopier"));
vi.mock("@solid-memo/solid/solidDigestRepository", recorded("createSolidDigestRepository"));
vi.mock("@solid-memo/solid/solidAnswerLog", recorded("createSolidAnswerLog"));
vi.mock("@solid-memo/solid/localGuestPod", recorded("createLocalGuestPod"));
vi.mock("@solid-memo/solid/solidDeckArchive", recorded("createSolidDeckArchive"));
vi.mock(
  "@solid-memo/solid/solidReleaseDraftRepository",
  recorded("createSolidReleaseDraftRepository"),
);
vi.mock("@solid-memo/solid/solidReleasePublisher", recorded("createSolidReleasePublisher"));
vi.mock("@solid-memo/solid/solidInstanceGraphReader", recorded("createSolidInstanceGraphReader"));

const SERVED = "http://localhost:5173/";

/** The requests that reached the network, each by its address and method. */
let requests: { url: string; method: string }[];

/** A network with only the served site on it, its files read from this repository. */
function servedSiteNetwork(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  requests.push({ url, method: input instanceof Request ? input.method : (init?.method ?? "GET") });
  if (!url.startsWith(SERVED)) return Promise.resolve(new Response("Not found", { status: 404 }));
  return shapesFetch(`${SITE}${url.slice(SERVED.length)}`);
}

/** Lets granted Web Locks run their callbacks, and released ones pass on. */
async function settled(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  requests = [];
  vi.stubGlobal("fetch", vi.fn(servedSiteNetwork));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createSiteFetch", () => {
  const siteFetch = createSiteFetch(SERVED);

  it("reads a document the site publishes from the site the page is served from", async () => {
    const response = await siteFetch(`${SITE}ns/vocab/v1.ttl`);
    expect(response.ok).toBe(true);
    expect(requests).toEqual([{ url: `${SERVED}ns/vocab/v1.ttl`, method: "GET" }]);
  });

  it("keeps a request's method at the served address", async () => {
    await siteFetch(new Request(`${SITE}decks/index.ttl`, { method: "HEAD" }));
    expect(requests).toEqual([{ url: `${SERVED}decks/index.ttl`, method: "HEAD" }]);
  });

  it("passes any other request on as it is", async () => {
    const response = await siteFetch("https://alice.example/profile/card", { method: "PUT" });
    expect(response.status).toBe(404);
    expect(requests).toEqual([{ url: "https://alice.example/profile/card", method: "PUT" }]);
  });
});

describe("createAppUseCases", () => {
  const options = { clientName: "Solid Memo", servedSite: SERVED, ruleset: "test" };

  it("keeps a guest's study in memory, every write checked against the shapes the site publishes", {
    timeout: 30_000,
  }, async () => {
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    expect(await useCases.startGuest("My study")).toEqual(GUEST_SESSION);
    const [instance] = await useCases.listInstances(GUEST_SESSION);
    expect(instance!.url.startsWith(GUEST_ORIGIN)).toBe(true);
    const deck = await useCases.createDeck(instance!.url, { en: "Capitals" });
    await useCases.addCard(deck, { front: { en: "Sweden" }, back: { en: "Stockholm" } });
    expect((await useCases.listCards(deck)).map((card) => card.front)).toEqual([{ en: "Sweden" }]);
    expect((await useCases.checkInstance(instance!.url)).conforms).toBe(true);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(({ url }) => url.startsWith(SERVED))).toBe(true);
  });

  it("drafts a release in the instance, a library release read from the site, another from the pod", {
    timeout: 60_000,
  }, async () => {
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    await useCases.startGuest("My study");
    const [instance] = await useCases.listInstances(GUEST_SESSION);
    await useCases.createDeck(instance!.url, { en: "Capitals" });
    const made = await useCases.createReleaseDraft(instance!.url, {
      kind: "nextVersionOf",
      url: `${SITE}decks/getting-started/v1.ttl`,
    });
    expect(made!.draft).toMatchObject({ name: "getting-started", version: 2, course: true });
    expect((await useCases.checkInstance(instance!.url)).conforms).toBe(true);
    await expect(
      useCases.createReleaseDraft(instance!.url, {
        kind: "nextVersionOf",
        url: `${instance!.url}releases/none/v1.ttl`,
      }),
    ).rejects.toMatchObject({
      code: "releaseUnreadable",
    });
    // A guest publishes nothing: their pod is this browser's.
    await expect(useCases.listPublishedReleases(instance!.url)).resolves.toEqual([]);
    await expect(
      useCases.publishRelease(made!.draft.url, `${instance!.url}releases/getting-started/v2.ttl`, {
        problems: () => [],
        chunks: () => ({ chunks: 1, empty: 0 }),
      }),
    ).rejects.toMatchObject({
      code: "guestCannotPublish",
    });
  });

  it("reads a guest's instance as a graph from this browser, fetching nothing it names", {
    timeout: 30_000,
  }, async () => {
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    await useCases.startGuest("My study");
    const [instance] = await useCases.listInstances(GUEST_SESSION);
    const library = await useCases.listLibraryDecks();
    const capitals = library.find((deck) => deck.url.includes("/capitals-of-the-world/"))!;
    await useCases.importLibraryDeck(instance!.url, capitals);
    requests = [];
    const graph = await useCases.readInstanceGraph(instance!.url, GUEST_SESSION.webId);
    expect(graph.nodes.find((node) => node.id === `${instance!.url}catalog.ttl`)).toMatchObject({
      kind: "document",
      found: true,
    });
    expect(graph.nodes.some((node) => node.kind === "outsideLeaf")).toBe(true);
    expect(requests).toEqual([]);
  });

  it("keeps a guest's study in IndexedDB, where the browser has it", {
    timeout: 30_000,
  }, async () => {
    const indexedDB = new IDBFactory();
    await createAppUseCases({ ...options, indexedDB }).startGuest("My study");
    // Another page finds the study the first one left.
    const [instance] = await createAppUseCases({ ...options, indexedDB }).listInstances(
      GUEST_SESSION,
    );
    expect(instance!.name).toBe("My study");
  });

  it("refuses writes to a guest's study another tab is moving, and to its copy, while that move runs", {
    timeout: 30_000,
  }, async () => {
    const locks = fakeLocks();
    Object.defineProperty(navigator, "locks", { value: locks, configurable: true });
    try {
      const useCases = createAppUseCases({ ...options, indexedDB: undefined });
      await useCases.startGuest("My study");
      const [instance] = await useCases.listInstances(GUEST_SESSION);
      // Another tab moves the guest's study into a pod.
      const stop = createLocalStorageUpdateJournal(undefined, new EventTarget(), () => locks).run(
        instance!.url,
      );
      const key = `solid-memo:update:${instance!.url}`;
      const stagingUrl = `${instance!.url.slice(0, -1)}-copy/`;
      const entry = JSON.stringify({ stagingUrl, startedAt: new Date().toISOString() });
      localStorage.setItem(key, entry);
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: entry }));
      await settled();
      await expect(useCases.createDeck(instance!.url, { en: "Capitals" })).rejects.toMatchObject({
        code: "guestStudyBeingMoved",
      });
      // Its copy is no interrupted move, and may not be removed.
      expect(await useCases.findInterruptedGuestMove(instance!)).toBeNull();
      await expect(useCases.removeInterruptedGuestMove(instance!)).rejects.toMatchObject({
        code: "guestStudyBeingMoved",
      });
      // It fails and keeps its entry: it runs no more, so nothing is held.
      stop();
      await settled();
      await useCases.createDeck(instance!.url, { en: "Capitals" });
    } finally {
      localStorage.clear();
      delete (navigator as { locks?: unknown }).locks;
    }
  });

  it("puts every pod adapter's writes behind the pod fence, and lets only the release publisher write an access control", async () => {
    given.clear();
    createAppUseCases({ ...options, indexedDB: undefined });
    expect(given.size).toBe(15);
    const refused = { code: "writeRefused" };
    for (const [name, { fetch }] of given) {
      for (const url of [
        `${GUEST_ORIGIN}profile/card.acl`,
        `${GUEST_ORIGIN}solid-memo/main/decks/deck-1.ttl.ACR`,
        `${GUEST_ORIGIN}solid-memo/main/.meta`,
        `${GUEST_ORIGIN}solid-memo/main/decks/%2e%2e/%2e%2e/profile/card`,
        `${GUEST_ORIGIN}solid-memo/main/decks//deck-1.ttl`,
        `${GUEST_ORIGIN}solid-memo/main/decks/..%2fdeck-1.ttl`,
        "https://Alice.example/profile/card",
      ]) {
        await expect(fetch!(url, { method: "PUT" }), `${name}: ${url}`).rejects.toMatchObject(
          refused,
        );
      }
      // A read is the adapters' to check; a write to a safe address goes on.
      expect((await fetch!(`${GUEST_ORIGIN}profile/card.acl`)).status).toBe(404);
      const safe = await fetch!(`${GUEST_ORIGIN}${name}.ttl`, {
        method: "PUT",
        headers: { "Content-Type": "text/turtle" },
        body: "",
      });
      expect(safe.ok, name).toBe(true);
    }
    // The publisher's access fetch writes a document's own access control, nothing else the fence refuses.
    const { shareFetch } = given.get("createSolidReleasePublisher")!;
    const release = `${GUEST_ORIGIN}solid-memo/main/releases/capitals/v1.ttl`;
    for (const url of [`${release}.acl`, `${release}.acr`]) {
      await expect(shareFetch!(url, { method: "PATCH" })).resolves.toBeInstanceOf(Response);
    }
    for (const url of [
      `${GUEST_ORIGIN}solid-memo/main/releases/.acl`,
      `${release}.meta`,
      `${release}.acl.acl`,
      `${GUEST_ORIGIN}solid-memo/main/releases/%2e%2e/v1.ttl.acl`,
    ]) {
      await expect(shareFetch!(url, { method: "PUT" }), url).rejects.toMatchObject(refused);
    }
    // No refused write left the page.
    expect(requests).toEqual([]);
  });

  it("reads the deck library the site publishes", { timeout: 30_000 }, async () => {
    const decks = await createAppUseCases({ ...options, indexedDB: undefined }).listLibraryDecks();
    expect(decks.length).toBeGreaterThan(0);
    expect(requests[0]!.url).toBe(`${SERVED}decks/index.ttl`);
  });

  it("reads the deck library from the index it is given", async () => {
    const useCases = createAppUseCases({
      ...options,
      indexedDB: undefined,
      libraryIndexUrl: "https://library.example/index.ttl",
    });
    await useCases.listLibraryDecks().catch(() => undefined);
    expect(requests[0]!.url).toBe("https://library.example/index.ttl");
  });
});
