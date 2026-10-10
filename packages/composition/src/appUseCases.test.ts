import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { SITE, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { GUEST_ORIGIN, GUEST_SESSION } from "@solid-memo/domain/guest";
import { createLocalStorageUpdateJournal } from "@solid-memo/browser/localStorageUpdateJournal";
import { fakeLocks } from "@solid-memo/browser/testing/fakeLocks";
import { createAppUseCases, createSiteFetch } from "./appUseCases";

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

  it(
    "keeps a guest's study in memory, every write checked against the shapes the site publishes",
    { timeout: 30_000 },
    async () => {
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
    },
  );

  it("drafts a release in the instance, a library release read from the site, another from the pod", { timeout: 60_000 }, async () => {
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    await useCases.startGuest("My study");
    const [instance] = await useCases.listInstances(GUEST_SESSION);
    await useCases.createDeck(instance!.url, { en: "Capitals" });
    const made = await useCases.createReleaseDraft(instance!.url, { kind: "nextVersionOf", url: `${SITE}decks/getting-started/v1.ttl` });
    expect(made!.draft).toMatchObject({ name: "getting-started", version: 2, course: true });
    expect((await useCases.checkInstance(instance!.url)).conforms).toBe(true);
    await expect(useCases.createReleaseDraft(instance!.url, { kind: "nextVersionOf", url: `${instance!.url}releases/none/v1.ttl` })).rejects.toMatchObject({
      code: "releaseUnreadable",
    });
    // A guest publishes nothing: their pod is this browser's.
    await expect(useCases.listPublishedReleases(instance!.url)).resolves.toEqual([]);
    await expect(useCases.publishRelease(made!.draft.url, `${instance!.url}releases/getting-started/v2.ttl`, {
      problems: () => [],
      chunks: () => ({ chunks: 1, empty: 0 }),
    })).rejects.toMatchObject({
      code: "guestCannotPublish",
    });
  });

  it("keeps a guest's study in IndexedDB, where the browser has it", { timeout: 30_000 }, async () => {
    const indexedDB = new IDBFactory();
    await createAppUseCases({ ...options, indexedDB }).startGuest("My study");
    // Another page finds the study the first one left.
    const [instance] = await createAppUseCases({ ...options, indexedDB }).listInstances(GUEST_SESSION);
    expect(instance!.name).toBe("My study");
  });

  it(
    "refuses writes to a guest's study another tab is moving, and to its copy, while that move runs",
    { timeout: 30_000 },
    async () => {
      const locks = fakeLocks();
      Object.defineProperty(navigator, "locks", { value: locks, configurable: true });
      try {
        const useCases = createAppUseCases({ ...options, indexedDB: undefined });
        await useCases.startGuest("My study");
        const [instance] = await useCases.listInstances(GUEST_SESSION);
        // Another tab moves the guest's study into a pod.
        const stop = createLocalStorageUpdateJournal(undefined, new EventTarget(), () => locks).run(instance!.url);
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
    },
  );

  it("reads the deck library the site publishes", { timeout: 30_000 }, async () => {
    const decks = await createAppUseCases({ ...options, indexedDB: undefined }).listLibraryDecks();
    expect(decks.length).toBeGreaterThan(0);
    expect(requests[0]!.url).toBe(`${SERVED}decks/index.ttl`);
  });

  it("reads the deck library from the index it is given", async () => {
    const useCases = createAppUseCases({ ...options, indexedDB: undefined, libraryIndexUrl: "https://library.example/index.ttl" });
    await useCases.listLibraryDecks().catch(() => undefined);
    expect(requests[0]!.url).toBe("https://library.example/index.ttl");
  });
});
