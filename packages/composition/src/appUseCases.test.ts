import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { SITE, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { GUEST_ORIGIN, GUEST_SESSION } from "@solid-memo/domain/guest";
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

  it("keeps a guest's study in IndexedDB, where the browser has it", { timeout: 30_000 }, async () => {
    const indexedDB = new IDBFactory();
    await createAppUseCases({ ...options, indexedDB }).startGuest("My study");
    // Another page finds the study the first one left.
    const [instance] = await createAppUseCases({ ...options, indexedDB }).listInstances(GUEST_SESSION);
    expect(instance!.name).toBe("My study");
  });

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
