// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { SITE } from "@solid-memo/vocab/tooling/sources";
import { shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { GUEST_ORIGIN, GUEST_SESSION } from "@solid-memo/domain/guest";
import type { DeckRepository } from "@solid-memo/application/ports";
import type { Deck } from "@solid-memo/domain/deck";
import { createLocalStorageUpdateJournal } from "@solid-memo/browser/localStorageUpdateJournal";
import { fakeLocks } from "@solid-memo/browser/testing/fakeLocks";
import { createLocalPod } from "@solid-memo/solid/localPod";
import { createMemoryResourceStore } from "@solid-memo/solid/memoryResourceStore";
import { INSTANCE_READS_TOTAL } from "@solid-memo/solid/client/readLimits";
import { READ_DEADLINE_MS, WHOLE_READ_MS } from "@solid-memo/solid/readDeadline";
import type { DigestRepository } from "@solid-memo/application/ports";
import { createAppUseCases, createSiteFetch } from "./appUseCases";

/**
 * What each pod adapter was made with, by its factory's name, as the
 * composition wires it; and, by the same name, how a test changes what
 * the factory made.
 */
const { given, altered, recorded } = vi.hoisted(() => {
  const given = new Map<string, Record<string, typeof globalThis.fetch>>();
  const altered = new Map<string, (made: object) => object>();
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
          const made = factory(options) as object;
          return altered.get(name)?.(made) ?? made;
        },
      };
    };
  return { given, altered, recorded };
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

/** A budget for the reads outside the user's storages, small enough for a test to spend, while `on`. */
const smallBudget = vi.hoisted(() => ({
  on: false,
  limits: { bytes: 1024 * 1024, quads: 30, characters: 1024 * 1024 },
  /** The options each budget was made with. */
  made: [] as { scope?: unknown; total?: unknown }[],
}));
vi.mock("@solid-memo/solid/client/readLimits", async (importOriginal) => {
  const original = await importOriginal<typeof import("@solid-memo/solid/client/readLimits")>();
  return {
    ...original,
    sharedReadBudget: (options: Parameters<typeof original.sharedReadBudget>[0]) => {
      smallBudget.made.push(options);
      return original.sharedReadBudget(
        smallBudget.on
          ? { ...options, budget: smallBudget.limits, rereads: smallBudget.limits }
          : options,
      );
    },
  };
});

/** The login: who is logged in, and the addresses requested with their credentials. */
const login = vi.hoisted(() => ({
  webId: undefined as string | undefined,
  sent: [] as string[],
  ownStorages: undefined as ((webId: string) => Promise<readonly string[]>) | undefined,
}));
vi.mock("@solid-memo/solid/solidSession", async (importOriginal) => {
  const original = await importOriginal<typeof import("@solid-memo/solid/solidSession")>();
  return {
    ...original,
    createSolidSession: (...args: Parameters<typeof original.createSolidSession>) => {
      login.ownStorages = args[1].ownStorages;
      const session = original.createSolidSession(...args);
      return {
        ...session,
        // The session's own fetch, so a test sees what it sends.
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          login.sent.push(String(input instanceof Request ? input.url : input));
          return session.fetch(input, init);
        },
        webId: () => login.webId,
      };
    },
  };
});

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

/**
 * A pod at `root`, kept in memory, as a server would answer: with the
 * address each response came from; without `storage`, its root is not
 * said to be a storage.
 */
function podAt(root: string, { storage = true } = {}): typeof globalThis.fetch {
  const pod = createLocalPod({
    root,
    store: createMemoryResourceStore(),
    newEtag: () => `"${crypto.randomUUID()}"`,
  });
  return async (input, init) => {
    const answered = await pod(input, init);
    const headers = new Headers(answered.headers);
    if (!storage) headers.delete("Link");
    const response = new Response(answered.body, { status: answered.status, headers });
    Object.defineProperty(response, "url", {
      value: String(input instanceof Request ? input.url : input).replace(/#.*/, ""),
    });
    return response;
  };
}

/** A network with the served site and `pods` on it, each request to a pod recorded with how it was sent. */
function podsNetwork(pods: Record<string, typeof globalThis.fetch>) {
  const sent: { url: string; method: string; credentials?: RequestCredentials }[] = [];
  const network = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const root = Object.keys(pods).find((origin) => url.startsWith(origin));
    if (root === undefined) return servedSiteNetwork(input, init);
    sent.push({
      url,
      method: init?.method ?? (input instanceof Request ? input.method : "GET"),
      credentials: init?.credentials,
    });
    return pods[root]!(input, init);
  });
  vi.stubGlobal("fetch", network);
  return sent;
}

/**
 * A network on which the host at `origin` takes every request and never
 * answers it, the request failing only when it is aborted, as a browser's
 * does; any other is `rest`'s.
 */
function silentAt(origin: string, rest: typeof globalThis.fetch): typeof globalThis.fetch {
  return (input, init) => {
    if (!String(input instanceof Request ? input.url : input).startsWith(origin))
      return rest(input, init);
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });
  };
}

/**
 * A network on which the host at `origin` answers every request with its
 * headers and the start of a body that then never ends, the body failing
 * only when the request is aborted, as a browser's does; any other is
 * `rest`'s.
 */
function stallingAt(origin: string, rest: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    if (!String(input instanceof Request ? input.url : input).startsWith(origin))
      return rest(input, init);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode("@prefix dcat: <http://www.w3.org/ns/dcat#> .\n"),
        );
        init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason));
      },
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "text/turtle" } });
  };
}

/**
 * A server that answers every request with its headers and the start of
 * a Turtle body, then sends a space every few seconds, with no end.
 */
const dripping: typeof globalThis.fetch = async () => {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (sent++ > 0) await new Promise((resolve) => setTimeout(resolve, 5000));
      controller.enqueue(new TextEncoder().encode(sent === 1 ? "<#a> <#b> " : " "));
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/turtle" } });
};

/** Moves fake time a second at a time until every one of `work` is settled, for no more than `ms`. */
async function untilSettled(work: Promise<unknown>[], ms: number): Promise<void> {
  let settled = 0;
  for (const one of work)
    void one.then(
      () => settled++,
      () => settled++,
    );
  for (let passed = 0; settled < work.length && passed < ms; passed += 1000)
    await vi.advanceTimersByTimeAsync(1000);
}

/** Writes `body` to `url` in `pod` as Turtle, as anyone who may write there can. */
async function put(pod: typeof globalThis.fetch, url: string, body: string): Promise<void> {
  await pod(url, { method: "PUT", headers: { "Content-Type": "text/turtle" }, body });
}

/** Lets granted Web Locks run their callbacks, and released ones pass on. */
async function settled(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Keeps each read and write of the digest repository the composition
 * makes, and returns a wait for all of them, those they lead to too:
 * what the digest learns is written back in the background, after the
 * use case that learned it has returned.
 */
function digestWork(): () => Promise<void> {
  const work: Promise<unknown>[] = [];
  const kept = <T>(promise: Promise<T>): Promise<T> => {
    work.push(promise);
    return promise;
  };
  altered.set("createSolidDigestRepository", (made) => {
    const repository = made as DigestRepository;
    const keeping: DigestRepository = {
      readDigest: (instanceUrl) => kept(repository.readDigest(instanceUrl)),
      updateDigest: (instanceUrl, change) => kept(repository.updateDigest(instanceUrl, change)),
    };
    return keeping;
  });
  return async () => {
    for (let seen = -1; seen < work.length; ) {
      seen = work.length;
      await Promise.allSettled(work);
      await settled();
    }
  };
}

beforeEach(() => {
  altered.clear();
  requests = [];
  login.webId = undefined;
  login.sent = [];
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

  it("gives up a read of any other server that has not started to answer by the read deadline", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.stubGlobal("fetch", silentAt("https://silent.example/", servedSiteNetwork));
    const read = expect(siteFetch("https://silent.example/a.ttl")).rejects.toMatchObject({
      code: "podNoAnswer",
      vars: { url: "https://silent.example/a.ttl", seconds: READ_DEADLINE_MS / 1000 },
    });
    await vi.advanceTimersByTimeAsync(READ_DEADLINE_MS);
    await read;
  });
});

describe("createAppUseCases", () => {
  const options = { clientName: "Solid Memo", servedSite: SERVED, ruleset: "test" };

  it("keeps a guest's study in memory, every write checked against the shapes the site publishes", async () => {
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
    const made = await useCases.createReleaseDraft(
      instance!.url,
      {
        kind: "nextVersionOf",
        url: `${SITE}decks/getting-started/v1.ttl`,
      },
      GUEST_SESSION.webId,
    );
    expect(made!.draft).toMatchObject({ name: "getting-started", version: 2, course: true });
    expect((await useCases.checkInstance(instance!.url)).conforms).toBe(true);
    await expect(
      useCases.createReleaseDraft(
        instance!.url,
        {
          kind: "nextVersionOf",
          url: `${instance!.url}releases/none/v1.ttl`,
        },
        GUEST_SESSION.webId,
      ),
    ).rejects.toMatchObject({
      code: "releaseUnreadable",
    });
    expect(requests.some(({ url }) => url.startsWith(GUEST_ORIGIN))).toBe(false);
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

  it("reads a release in the user's own pod as the user, any other as no one", async () => {
    const alice = "https://alice.example/";
    login.webId = `${alice}profile/card#me`;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        String(input).startsWith(`${alice}profile/card`)
          ? Promise.resolve(
              new Response(
                `<${login.webId}> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`,
                {
                  headers: { "Content-Type": "text/turtle" },
                },
              ),
            )
          : servedSiteNetwork(input, init),
      ),
    );
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const nextVersionOf = (url: string) =>
      useCases.createReleaseDraft(`${alice}memo/`, { kind: "nextVersionOf", url }, login.webId!);

    const elsewhere = "https://attacker.example/r.ttl";
    await expect(nextVersionOf(elsewhere)).rejects.toMatchObject({ code: "releaseUnreadable" });
    expect(login.sent).not.toContain(elsewhere);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      elsewhere,
      expect.objectContaining({ credentials: "omit" }),
    );

    const own = `${alice}memo/releases/capitals/v1.ttl`;
    await expect(nextVersionOf(own)).rejects.toMatchObject({ code: "releaseUnreadable" });
    expect(login.sent).toContain(own);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      own,
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("reads the user's own release as no one for its next version in an instance outside their pod", async () => {
    const alice = "https://alice.example/";
    login.webId = `${alice}profile/card#me`;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        String(input).startsWith(`${alice}profile/card`)
          ? Promise.resolve(
              new Response(
                `<${login.webId}> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`,
                { headers: { "Content-Type": "text/turtle" } },
              ),
            )
          : servedSiteNetwork(input, init),
      ),
    );
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const own = `${alice}memo/releases/capitals/v1.ttl`;
    await expect(
      useCases.createReleaseDraft(
        "https://attacker.example/memo/",
        { kind: "nextVersionOf", url: own },
        login.webId,
      ),
    ).rejects.toMatchObject({ code: "releaseUnreadable" });
    expect(login.sent).not.toContain(own);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      own,
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  it("reads the user's own cards as no one for a draft of a deck in an instance outside their pod", async () => {
    const alice = "https://alice.example/";
    login.webId = `${alice}profile/card#me`;
    const own = `${alice}memo/decks/deck-1.ttl`;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        String(input).startsWith(`${alice}profile/card`)
          ? Promise.resolve(
              new Response(
                `<${login.webId}> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`,
                { headers: { "Content-Type": "text/turtle" } },
              ),
            )
          : servedSiteNetwork(input, init),
      ),
    );
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const foreign = "https://attacker.example/memo/";
    // The foreign instance's catalog names a deck whose cards are in Alice's pod.
    const deck: Deck = {
      id: "deck-1",
      url: `${foreign}catalog.ttl#deck-1`,
      title: { en: "Capitals" },
      cardsDocumentUrl: own,
      reviewsDocumentUrl: `${foreign}reviews/deck-1.ttl`,
      createdAt: "2026-11-03T10:00:00.000Z",
      formatVersion: 1,
      direction: "front-to-back",
      authors: [],
    };
    await expect(
      useCases.createReleaseDraft(foreign, { kind: "fromDeck", deck }, login.webId),
    ).rejects.toMatchObject({ code: "noCatalogToUpdate" });
    expect(login.sent).not.toContain(own);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      own,
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  it("reads the user's own cards and progress as no one for a transfer between decks of an instance outside their pod", async () => {
    const alice = "https://alice.example/";
    login.webId = `${alice}profile/card#me`;
    const ownCards = `${alice}memo/decks/deck-1.ttl`;
    const ownReviews = `${alice}memo/reviews/deck-1.ttl`;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        String(input).startsWith(`${alice}profile/card`)
          ? Promise.resolve(
              new Response(
                `<${login.webId}> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`,
                { headers: { "Content-Type": "text/turtle" } },
              ),
            )
          : servedSiteNetwork(input, init),
      ),
    );
    const digestWritten = digestWork();
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const foreign = "https://attacker.example/memo/";
    const deckOf = (id: string, cardsDocumentUrl: string, reviewsDocumentUrl: string): Deck => ({
      id,
      url: `${foreign}catalog.ttl#${id}`,
      title: { en: "Capitals" },
      cardsDocumentUrl,
      reviewsDocumentUrl,
      createdAt: "2026-11-03T10:00:00.000Z",
      formatVersion: 1,
      direction: "front-to-back",
      authors: [],
    });
    // The foreign instance's catalog names a deck whose documents are in Alice's pod.
    const from = deckOf("deck-1", ownCards, ownReviews);
    const to = deckOf("deck-2", `${foreign}decks/deck-2.ttl`, `${foreign}reviews/deck-2.ttl`);
    await expect(
      useCases.transferCards(
        foreign,
        from,
        to,
        ["capital"],
        { mode: "copy", keepProgress: true },
        login.webId,
      ),
    ).resolves.toMatchObject({ missing: ["capital"] });
    // What the digest learned is written back after: until it is, the network stays.
    await digestWritten();
    for (const own of [ownCards, ownReviews]) {
      expect(login.sent).not.toContain(own);
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
        own,
        expect.objectContaining({ credentials: "omit" }),
      );
    }
  });

  it("drafts a guest's own deck from their pod, and never reads it for a deck another instance names there", async () => {
    // The cards each draft was made from, as the deck repository read them.
    const read: string[][] = [];
    altered.set("createSolidDeckRepository", (made) => {
      const repository = made as DeckRepository;
      return {
        ...repository,
        listCards: async (...args: Parameters<DeckRepository["listCards"]>) => {
          const cards = await repository.listCards(...args);
          read.push(cards.map((card) => card.front.en!));
          return cards;
        },
      };
    });
    const indexedDB = new IDBFactory();
    const guest = createAppUseCases({ ...options, indexedDB });
    await guest.startGuest("My study");
    const [instance] = await guest.listInstances(GUEST_SESSION);
    const made = await guest.createDeck(instance!.url, { en: "Capitals" });
    await guest.addCard(made, { front: { en: "Sweden" }, back: { en: "Stockholm" } });
    const drafted = await guest.createReleaseDraft(
      instance!.url,
      { kind: "fromDeck", deck: made },
      GUEST_SESSION.webId,
    );
    expect(drafted!.draft.url.startsWith(instance!.url)).toBe(true);
    expect(read).toEqual([["Sweden"]]);

    // Logged in, in the same browser: another instance's catalog names the guest's cards.
    login.webId = "https://alice.example/profile/card#me";
    const useCases = createAppUseCases({ ...options, indexedDB });
    const foreign = "https://attacker.example/memo/";
    const deck: Deck = {
      ...made,
      url: `${foreign}catalog.ttl#deck-1`,
      reviewsDocumentUrl: `${foreign}reviews/deck-1.ttl`,
    };
    await expect(
      useCases.createReleaseDraft(foreign, { kind: "fromDeck", deck }, login.webId),
    ).rejects.toMatchObject({ code: "deckGone" });
    expect(read).toEqual([["Sweden"]]);
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalledWith(
      made.cardsDocumentUrl,
      expect.anything(),
    );

    // And whatever reached them, the reads as no one have no way to the guest's pod.
    for (const [name, url] of [
      ["createSolidDeckRepository", made.cardsDocumentUrl],
      ["createSolidReviewStateRepository", made.reviewsDocumentUrl],
    ] as const) {
      await given.get(name)!.publicFetch!(url);
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
        url,
        expect.objectContaining({ credentials: "omit" }),
      );
    }
  });

  it("reads a release as no one when the user's own pod cannot be found", async () => {
    login.webId = "https://bob.example/profile/card#me";
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        String(input).startsWith("https://bob.example/")
          ? Promise.reject(new TypeError("Failed to fetch"))
          : servedSiteNetwork(input, init),
      ),
    );
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const elsewhere = "https://attacker.example/r.ttl";
    await expect(
      useCases.createReleaseDraft(
        "https://bob.example/memo/",
        {
          kind: "nextVersionOf",
          url: elsewhere,
        },
        login.webId!,
      ),
    ).rejects.toMatchObject({ code: "releaseUnreadable" });
    expect(login.sent).not.toContain(elsewhere);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      elsewhere,
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  it("reads a release in an instance the user registered as the user when their storages cannot be found", async () => {
    const alice = "https://alice.example/";
    login.webId = `${alice}profile/card#me`;
    altered.set("createSolidStorageGateway", (made) => ({
      ...made,
      discoverStorages: () => Promise.reject(new TypeError("Failed to fetch")),
    }));
    const documents: Record<string, string> = {
      [`${alice}profile/card`]: `<${login.webId}>
        <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${alice}settings/private.ttl>.`,
      [`${alice}settings/private.ttl`]: `<#memo>
        a <http://www.w3.org/ns/solid/terms#TypeRegistration>;
        <http://www.w3.org/ns/solid/terms#forClass> <https://solid-memo.com/ns/vocab/v1.ttl#Instance>;
        <http://www.w3.org/ns/solid/terms#instanceContainer> <${alice}memo/>.`,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input).replace(/#.*/, "");
        const body = documents[url];
        if (body === undefined) return servedSiteNetwork(input, init);
        const response = new Response(body, { headers: { "Content-Type": "text/turtle" } });
        Object.defineProperty(response, "url", { value: url });
        return Promise.resolve(response);
      }),
    );
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    expect((await useCases.listInstances({ webId: login.webId })).map(({ url }) => url)).toEqual([
      `${alice}memo/`,
    ]);
    const own = `${alice}memo/releases/capitals/v1.ttl`;
    await expect(
      useCases.createReleaseDraft(
        `${alice}memo/`,
        { kind: "nextVersionOf", url: own },
        login.webId!,
      ),
    ).rejects.toMatchObject({ code: "releaseUnreadable" });
    expect(login.sent).toContain(own);
  });

  it("sends the user's credentials only into their own pod, reading a deck's documents elsewhere as no one and writing nothing there", async () => {
    const alice = "https://alice.example/";
    login.webId = `${alice}profile/card#me`;
    // A deck from a guest's study, its entry moved into Alice's instance.
    const guest = createAppUseCases({ ...options, indexedDB: undefined });
    await guest.startGuest("My study");
    const [instance] = await guest.listInstances(GUEST_SESSION);
    const made = await guest.createDeck(instance!.url, { en: "Capitals" });
    const entry = `${alice}memo/catalog.ttl#deck-1`;
    const deckAt = (cards: string, reviews: string) => ({
      ...made,
      url: entry,
      cardsDocumentUrl: cards,
      reviewsDocumentUrl: reviews,
    });
    /** A document saying it is the deck's: what anyone who may append to it can state. */
    const owned = (url: string) => `<${url}> <http://purl.org/dc/terms/isPartOf> <${entry}>.`;
    const documents = new Map([
      [
        `${alice}profile/card`,
        `<${login.webId}> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`,
      ],
      ["https://attacker.example/cards.ttl", owned("https://attacker.example/cards.ttl")],
      ["https://attacker.example/reviews.ttl", owned("https://attacker.example/reviews.ttl")],
      [`${alice}memo/decks/deck-1.ttl`, owned(`${alice}memo/decks/deck-1.ttl`)],
      ["https://store.example/", ""],
      [
        "https://store.example/memo/decks/deck-1.ttl",
        owned("https://store.example/memo/decks/deck-1.ttl"),
      ],
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input).replace(/#.*/, "");
        const body = documents.get(url);
        if (body === undefined) return servedSiteNetwork(input, init);
        requests.push({ url, method: init?.method ?? "GET" });
        const response = new Response(body, {
          headers: { "Content-Type": "text/turtle", ETag: '"1"' },
        });
        // As the network answers, with the address it was read from.
        Object.defineProperty(response, "url", { value: url });
        return Promise.resolve(response);
      }),
    );
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const elsewhere = deckAt(
      "https://attacker.example/cards.ttl",
      "https://attacker.example/reviews.ttl",
    );

    expect(await useCases.listCards(elsewhere)).toEqual([]);
    await expect(
      useCases.addCard(elsewhere, { front: { en: "Sweden" }, back: { en: "Stockholm" } }),
    ).rejects.toMatchObject({ code: "deckDocumentUnclaimed" });
    // Removing the deck keeps its documents there, whatever they say: outside the instance's storage, they are not its own.
    await expect(useCases.removeDeck(elsewhere)).resolves.toEqual({ keptDocuments: [] });
    expect(login.sent.filter((url) => url.startsWith("https://attacker.example/"))).toEqual([]);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      "https://attacker.example/cards.ttl",
      expect.objectContaining({ credentials: "omit" }),
    );
    expect(
      requests.filter(
        ({ url, method }) => url.startsWith("https://attacker.example/") && method !== "GET",
      ),
    ).toEqual([]);

    // A deck whose documents are in the user's own pod is read as the user.
    const own = `${alice}memo/decks/deck-1.ttl`;
    expect(await useCases.listCards(deckAt(own, own))).toEqual([]);
    expect(login.sent).toContain(own);
    // So is one in a storage the user entered by hand, once they have.
    const entered = "https://store.example/memo/decks/deck-1.ttl";
    await useCases.listCards(deckAt(entered, entered));
    expect(login.sent).not.toContain(entered);
    await useCases.addManualStorage("https://store.example/");
    await useCases.listCards(deckAt(entered, entered));
    expect(login.sent).toContain(entered);
  });

  it("lists the releases of an instance outside the user's storages as no one, under limits", async () => {
    const alice = "https://alice.example/";
    login.webId = `${alice}profile/card#me`;
    const catalog = "https://elsewhere.example/memo/catalog.ttl";
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.startsWith(`${alice}profile/card`))
          return Promise.resolve(
            new Response(`<${login.webId}> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`, {
              headers: { "Content-Type": "text/turtle" },
            }),
          );
        if (url !== catalog) return servedSiteNetwork(input, init);
        // A catalog that says it is larger than any read outside the user's storages takes in.
        const response = new Response(
          `<${catalog}#catalog> a <http://www.w3.org/ns/dcat#Catalog>.`,
          {
            headers: { "Content-Type": "text/turtle", "Content-Length": "33554433" },
          },
        );
        Object.defineProperty(response, "url", { value: url });
        return Promise.resolve(response);
      }),
    );
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });

    await expect(
      useCases.listPublishedReleases("https://elsewhere.example/memo/"),
    ).rejects.toMatchObject({ name: "ReadLimitError", url: catalog });
    expect(login.sent).not.toContain(catalog);
  });

  it("reads a deck's documents outside the user's storages under limits, in an instance they registered too, and theirs with none", async () => {
    const alice = "https://alice.example/";
    const shared = "https://shared.example/study/";
    login.webId = `${alice}profile/card#me`;
    const guest = createAppUseCases({ ...options, indexedDB: undefined });
    await guest.startGuest("My study");
    const [instance] = await guest.listInstances(GUEST_SESSION);
    const made = await guest.createDeck(instance!.url, { en: "Capitals" });
    const entry = `${alice}memo/catalog.ttl#deck-1`;
    const deckAt = (url: string) => ({
      ...made,
      url: entry,
      cardsDocumentUrl: url,
      reviewsDocumentUrl: url,
    });
    const documents: Record<string, string> = {
      [`${alice}profile/card`]: `<${login.webId}>
        <http://www.w3.org/ns/pim/space#storage> <${alice}>;
        <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${alice}settings/private.ttl>.`,
      // An instance on another server, registered as the user's.
      [`${alice}settings/private.ttl`]: `<#memo>
        a <http://www.w3.org/ns/solid/terms#TypeRegistration>;
        <http://www.w3.org/ns/solid/terms#forClass> <https://solid-memo.com/ns/vocab/v1.ttl#Instance>;
        <http://www.w3.org/ns/solid/terms#instanceContainer> <${shared}>.`,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input).replace(/#.*/, "");
        const elsewhere = ["https://elsewhere.example/", shared].some((at) => url.startsWith(at));
        if (!url.startsWith(alice) && !elsewhere) return servedSiteNetwork(input, init);
        const listed = documents[url];
        const body = listed ?? `<${url}> <http://purl.org/dc/terms/isPartOf> <${entry}>.`;
        // A deck's document that says it is larger than any read outside the user's storages takes in.
        const length: Record<string, string> =
          listed === undefined ? { "Content-Length": "33554433" } : {};
        const response = new Response(body, {
          headers: { "Content-Type": "text/turtle", ...length },
        });
        Object.defineProperty(response, "url", { value: url });
        return Promise.resolve(response);
      }),
    );
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });

    await expect(
      useCases.listCards(deckAt("https://elsewhere.example/cards.ttl")),
    ).rejects.toMatchObject({ name: "ReadLimitError", url: "https://elsewhere.example/cards.ttl" });
    const registered = `${shared}decks/deck-1.ttl`;
    await expect(useCases.listCards(deckAt(registered))).rejects.toMatchObject({
      name: "ReadLimitError",
      url: registered,
    });
    expect(login.sent).toContain(registered);
    expect(await useCases.listCards(deckAt(`${alice}memo/decks/deck-1.ttl`))).toEqual([]);
  });

  it("reads the documents of many decks outside the user's storages within a budget, one of each server for an instance they registered, and sends their writes there whatever is spent", async () => {
    smallBudget.on = true;
    onTestFinished(() => {
      smallBudget.on = false;
    });
    const alice = "https://alice.example/";
    const shared = "https://shared.example/study/";
    login.webId = `${alice}profile/card#me`;
    const guest = createAppUseCases({ ...options, indexedDB: undefined });
    await guest.startGuest("My study");
    const [instance] = await guest.listInstances(GUEST_SESSION);
    const made = await guest.createDeck(instance!.url, { en: "Capitals" });
    const entry = `${alice}memo/catalog.ttl#deck-1`;
    const deckAt = (url: string) => ({
      ...made,
      url: entry,
      cardsDocumentUrl: url,
      reviewsDocumentUrl: url,
    });
    const documents: Record<string, string> = {
      [`${alice}profile/card`]: `<${login.webId}>
        <http://www.w3.org/ns/pim/space#storage> <${alice}>;
        <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${alice}settings/private.ttl>.`,
      // An instance on another server, registered as the user's.
      [`${alice}settings/private.ttl`]: `<#memo>
        a <http://www.w3.org/ns/solid/terms#TypeRegistration>;
        <http://www.w3.org/ns/solid/terms#forClass> <https://solid-memo.com/ns/vocab/v1.ttl#Instance>;
        <http://www.w3.org/ns/solid/terms#instanceContainer> <${shared}>.`,
    };
    const asked: { url: string; method: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input).replace(/#.*/, "");
        const elsewhere = ["https://elsewhere.example/", shared].some((at) => url.startsWith(at));
        if (!url.startsWith(alice) && !elsewhere) return servedSiteNetwork(input, init);
        asked.push({ url, method: init?.method ?? "GET" });
        // Each deck's document well within the limits of one read: twelve triples.
        const triples = Array.from({ length: 11 }, (_, at) => `<#c${at}> <#p> "${at}".`);
        const body =
          documents[url] ??
          [`<${url}> <http://purl.org/dc/terms/isPartOf> <${entry}>.`, ...triples].join("\n");
        const response = new Response(body, { headers: { "Content-Type": "text/turtle" } });
        Object.defineProperty(response, "url", { value: url });
        return Promise.resolve(response);
      }),
    );
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    /** Lists the cards of the decks whose documents are at `urls`, one after another: whether each was read. */
    const listed = async (urls: string[]) => {
      const read: boolean[] = [];
      for (const url of urls)
        read.push(
          await useCases.listCards(deckAt(url)).then(
            () => true,
            (error: unknown) => {
              expect(error).toMatchObject({ name: "ReadLimitError" });
              return false;
            },
          ),
        );
      return read;
    };
    const decks = (at: string) => Array.from({ length: 5 }, (_, deck) => `${at}deck-${deck}.ttl`);

    const foreign = decks("https://elsewhere.example/");
    expect(await listed(foreign)).toEqual([true, true, false, false, false]);
    // Past the budget, the server is not asked.
    expect(asked.filter(({ url }) => url === foreign[4])).toEqual([]);
    // Nor when a deck's cards or states are copied from there: those reads count in the same budget.
    for (const name of ["createSolidDeckRepository", "createSolidReviewStateRepository"])
      await expect(given.get(name)!.publicFetch!(foreign[4]!)).rejects.toMatchObject({
        name: "ReadLimitError",
        limits: smallBudget.limits,
      });
    expect(asked.filter(({ url }) => url === foreign[4])).toEqual([]);
    const registered = decks(`${shared}decks/`);
    expect(await listed(registered)).toEqual([true, true, false, false, false]);
    expect(asked.filter(({ url }) => url === registered[4])).toEqual([]);
    expect(login.sent).toContain(registered[0]);
    // A write to the instance registered elsewhere goes out all the same.
    const write = await given.get("createSolidDeckRepository")!.fetch!(registered[4]!, {
      method: "PUT",
      body: "",
    });
    expect(write.ok).toBe(true);
    expect(asked).toContainEqual({ url: registered[4], method: "PUT" });
    // The user's own storage has no such budget.
    for (let deck = 0; deck < 5; deck++)
      expect(await useCases.listCards(deckAt(`${alice}memo/decks/deck-${deck}.ttl`))).toEqual([]);
  });

  it("holds the reads in the instances registered elsewhere to one total over all their servers", () => {
    smallBudget.made.length = 0;
    createAppUseCases({ ...options, indexedDB: undefined });
    expect(smallBudget.made.find(({ scope }) => scope !== undefined)?.total).toBe(
      INSTANCE_READS_TOTAL,
    );
  });

  it("lets a guest delete their instance, which is in their own storage", async () => {
    const guest = createAppUseCases({ ...options, indexedDB: undefined });
    await guest.startGuest("My study");
    const [instance] = await guest.listInstances(GUEST_SESSION);

    await expect(guest.deleteInstance(GUEST_SESSION, instance!)).resolves.toMatchObject({
      keptFolder: null,
    });

    expect(await guest.listInstances(GUEST_SESSION)).toEqual([]);
  });

  it("keeps a guest's own instance on the list when asked to remove it, so they can go on", async () => {
    const guest = createAppUseCases({ ...options, indexedDB: undefined });
    await guest.startGuest("My study");
    const [instance] = await guest.listInstances(GUEST_SESSION);

    await expect(guest.detachInstance(GUEST_SESSION, instance!)).rejects.toThrow(
      "A guest's own instance",
    );

    expect(await guest.listInstances(GUEST_SESSION)).toEqual([instance]);
    expect((await guest.findGuestStudy())?.instances).toEqual([{ instance, deckCount: 0 }]);
  });

  it("stops sending the user's credentials into an instance on another server once it is removed from their list, and sends it nothing to remove it", async () => {
    const alice = "https://alice.example/";
    const shared = "https://shared.example/study/";
    login.webId = `${alice}profile/card#me`;
    const guest = createAppUseCases({ ...options, indexedDB: undefined });
    await guest.startGuest("My study");
    const [instance] = await guest.listInstances(GUEST_SESSION);
    const made = await guest.createDeck(instance!.url, { en: "Capitals" });
    const deck = {
      ...made,
      url: `${alice}memo/catalog.ttl#deck-1`,
      cardsDocumentUrl: `${shared}decks/deck-1.ttl`,
      reviewsDocumentUrl: `${shared}decks/deck-1.ttl`,
    };
    const index = `${alice}settings/private.ttl`;
    const documents: Record<string, string> = {
      [`${alice}profile/card`]: `<${login.webId}>
        <http://www.w3.org/ns/pim/space#storage> <${alice}>;
        <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${index}>.`,
      [index]: `<#memo>
        a <http://www.w3.org/ns/solid/terms#TypeRegistration>;
        <http://www.w3.org/ns/solid/terms#forClass> <https://solid-memo.com/ns/vocab/v1.ttl#Instance>;
        <http://www.w3.org/ns/solid/terms#instanceContainer> <${shared}>.`,
    };
    const unregistered = `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>.`;
    let seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input).replace(/#.*/, "");
        if (!url.startsWith(alice) && !url.startsWith(shared))
          return servedSiteNetwork(input, init);
        if (url.startsWith(shared)) seen.push(url);
        const method = init?.method ?? "GET";
        if (method !== "GET" && method !== "HEAD") {
          documents[url] = unregistered;
          return Promise.resolve(new Response(null, { status: 205 }));
        }
        const response = new Response(documents[url] ?? "", {
          headers: { "Content-Type": "text/turtle", ETag: '"1"' },
        });
        Object.defineProperty(response, "url", { value: url });
        return Promise.resolve(response);
      }),
    );
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const session = { webId: login.webId };

    await useCases.listCards(deck);
    expect(login.sent).toContain(deck.cardsDocumentUrl);

    seen = [];
    login.sent.length = 0;
    await useCases.detachInstance(session, { url: shared, name: "Shared" });
    expect(seen).toEqual([]);
    expect(await useCases.listInstances(session)).toEqual([]);

    await useCases.listCards(deck);
    expect(seen).toEqual([deck.cardsDocumentUrl]);
    expect(login.sent).not.toContain(deck.cardsDocumentUrl);
  });

  it("studies a deck whose catalog names its documents on another server without the user's credentials there, writing nothing there", {
    timeout: 60_000,
  }, async () => {
    const alice = "https://alice.example/";
    const attacker = "https://attacker.example/";
    const pod = podAt(alice);
    const theirs = podAt(attacker);
    const sent = podsNetwork({ [alice]: pod, [attacker]: theirs });
    login.webId = `${alice}profile/card#me`;
    await put(
      pod,
      `${alice}profile/card`,
      `<${login.webId}> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`,
    );
    const digestWritten = digestWork();
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const session = { webId: login.webId };
    const instance = await useCases.createInstance(session, {
      containerUrl: `${alice}memo/`,
      name: "Main",
      registrationTarget: "private",
    });
    const made = await useCases.createDeck(instance.url, { en: "Capitals" });
    await useCases.addCard(made, { front: { en: "Sweden" }, back: { en: "Stockholm" } });
    // The deck's documents copied to another server, each saying it is the deck's, and the catalog naming them.
    const moved = (text: string) =>
      text
        .replaceAll(made.cardsDocumentUrl, `${attacker}cards.ttl`)
        .replaceAll(made.reviewsDocumentUrl, `${attacker}reviews.ttl`);
    const text = async (url: string) => (await pod(url)).text();
    await put(theirs, `${attacker}cards.ttl`, moved(await text(made.cardsDocumentUrl)));
    const reviews = `<${attacker}reviews.ttl> <http://purl.org/dc/terms/isPartOf> <${made.url}>.`;
    await put(theirs, `${attacker}reviews.ttl`, reviews);
    await put(pod, `${alice}memo/catalog.ttl`, moved(await text(`${alice}memo/catalog.ttl`)));
    login.sent = [];
    sent.length = 0;

    const [deck] = await useCases.listDecks(instance.url);
    expect(deck!.cardsDocumentUrl).toBe(`${attacker}cards.ttl`);
    const [card] = await useCases.listCards(deck!);
    expect(card!.front).toEqual({ en: "Sweden" });
    // Answering writes the answer's state to the reviews document: refused before it is sent.
    const now = new Date();
    const [prompt] = (await useCases.getStudyQueue(instance.url, deck!, now)).newPrompts;
    await expect(useCases.recordReview(instance.url, deck!, prompt!, 4, now)).rejects.toMatchObject(
      { code: "deckDocumentUnclaimed" },
    );
    // Saying they are the deck's makes neither the deck's outside the instance's storage: the data check finds them unclaimed; claiming them is refused too.
    expect((await useCases.checkInstance(instance.url)).unclaimed).toEqual([
      expect.objectContaining({
        documents: [`${attacker}cards.ttl`, `${attacker}reviews.ttl`],
      }),
    ]);
    await expect(useCases.claimDeckDocuments(instance.url, deck!.url)).rejects.toMatchObject({
      code: "claimOutsidePod",
    });
    // An export reads them as no one too.
    await given.get("createSolidDeckArchive")!.fetch(`${attacker}cards.ttl`);

    const there = sent.filter(({ url }) => url.startsWith(attacker));
    expect(there.length).toBeGreaterThan(0);
    expect(there.filter(({ method }) => !["GET", "HEAD"].includes(method))).toEqual([]);
    expect(there.every(({ credentials }) => credentials === "omit")).toBe(true);
    expect(login.sent.filter((url) => url.startsWith(attacker))).toEqual([]);
    // The user's own pod is still theirs.
    expect(login.sent).toContain(`${alice}memo/catalog.ttl`);
    // What the digest learned is written back after, into Alice's pod: until it is, the network stays.
    await digestWritten();
  });

  it("settles the data check within its budget, and the cards' progress, when many decks' documents are on a server that answers and never sends them all", {
    timeout: 180_000,
  }, async () => {
    const alice = "https://alice.example/";
    const slow = "https://slow.example/";
    const pod = podAt(alice);
    podsNetwork({ [alice]: pod, [slow]: dripping });
    login.webId = `${alice}profile/card#me`;
    await put(
      pod,
      `${alice}profile/card`,
      `<${login.webId}> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`,
    );
    const digestWritten = digestWork();
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const instance = await useCases.createInstance(
      { webId: login.webId },
      { containerUrl: `${alice}memo/`, name: "Main", registrationTarget: "private" },
    );
    const kept = await useCases.createDeck(instance.url, { en: "Capitals" });
    await useCases.addCard(kept, { front: { en: "Sweden" }, back: { en: "Stockholm" } });
    // The catalog names the other decks' documents on the slow server: more than are read at once.
    const catalog = `${alice}memo/catalog.ttl`;
    const planted: string[][] = [];
    for (let at = 0; at < 14; at++) {
      const made = await useCases.createDeck(instance.url, { en: `Rivers ${at}` });
      const [cards, reviews] = [`${slow}${at}/cards.ttl`, `${slow}${at}/reviews.ttl`];
      planted.push([cards, reviews]);
      await put(
        pod,
        catalog,
        (await (await pod(catalog)).text())
          .replaceAll(made.cardsDocumentUrl, cards)
          .replaceAll(made.reviewsDocumentUrl, reviews),
      );
    }
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const started = Date.now();
    const check = useCases.checkInstance(instance.url);
    await untilSettled([check], 30 * 60_000);
    // One budget for the check's reads of them, whatever their number.
    expect(Date.now() - started).toBeLessThanOrEqual(70_000);
    const progress = useCases.getCardProgress(instance.url, new Date());
    await untilSettled([progress], 30 * 60_000);
    vi.useRealTimers();
    // The documents that could not be read are named, not waited on for good.
    expect((await check).unclaimed!.map(({ documents }) => documents).sort()).toEqual(
      planted.sort(),
    );
    const report = await progress;
    expect(report.decks.map(({ deck }) => deck.url)).toEqual([kept.url]);
    expect(report.leftOut).toHaveLength(14);
    await digestWritten();
  });

  it("settles the data check within its budget when the decks' documents outside the instance's folder answer the first read and drip on the next", {
    timeout: 180_000,
  }, async () => {
    const alice = "https://alice.example/";
    const elsewhere = `${alice}elsewhere/`;
    const pod = podAt(alice);
    // Each document there is read once as it is, then sent a little at a time with no end.
    const reads = new Map<string, number>();
    podsNetwork({
      [alice]: (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        const method = init?.method ?? "GET";
        if (!url.startsWith(elsewhere) || method !== "GET") return pod(input, init);
        reads.set(url, (reads.get(url) ?? 0) + 1);
        return reads.get(url)! > 1 ? dripping(input, init) : pod(input, init);
      },
    });
    login.webId = `${alice}profile/card#me`;
    await put(
      pod,
      `${alice}profile/card`,
      `<${login.webId}> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`,
    );
    const digestWritten = digestWork();
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const instance = await useCases.createInstance(
      { webId: login.webId },
      { containerUrl: `${alice}memo/`, name: "Main", registrationTarget: "private" },
    );
    // The catalog names the decks' documents in the user's pod, outside the instance's folder, each saying it is its deck's: more than are read at once.
    const catalog = `${alice}memo/catalog.ttl`;
    const planted: string[] = [];
    for (let at = 0; at < 14; at++) {
      const made = await useCases.createDeck(instance.url, { en: `Rivers ${at}` });
      const [cards, reviews] = [`${elsewhere}${at}/cards.ttl`, `${elsewhere}${at}/reviews.ttl`];
      for (const url of [cards, reviews]) {
        await put(pod, url, `<> <http://purl.org/dc/terms/isPartOf> <${made.url}>.`);
        planted.push(url);
      }
      await put(
        pod,
        catalog,
        (await (await pod(catalog)).text())
          .replaceAll(made.cardsDocumentUrl, cards)
          .replaceAll(made.reviewsDocumentUrl, reviews),
      );
    }
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const started = Date.now();
    const check = useCases.checkInstance(instance.url);
    await untilSettled([check], 30 * 60_000);
    // One budget for all the check's reads of them, the shape check's too.
    expect(Date.now() - started).toBeLessThanOrEqual(70_000);
    vi.useRealTimers();
    const report = await check;
    // Each was claimed, then not read in time: named unreadable, its deck set aside, not waited on.
    expect(report.unclaimed ?? []).toEqual([]);
    expect(
      report.documents
        .filter(({ status }) => status === "unreadable")
        .map(({ url }) => url)
        .sort(),
    ).toEqual(planted.sort());
    await digestWritten();
  });

  it("claims no document of the user's pod for an instance attached from someone else's, and those of the user's own instance in another folder", {
    timeout: 60_000,
  }, async () => {
    const alice = "https://alice.example/";
    const bob = "https://bob.example/";
    const profile = `${alice}profile/card`;
    const old = `${alice}private/old.ttl`;
    const card = `<#mine> a <https://solid-memo.com/ns/vocab/v1.ttl#Card> .`;
    const pod = podAt(alice);
    const theirs = podAt(bob);
    const sent = podsNetwork({ [alice]: pod, [bob]: theirs });
    await put(pod, profile, `<#me> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`);
    await put(pod, old, card);
    await put(
      theirs,
      `${bob}profile/card`,
      `<#me> <http://www.w3.org/ns/pim/space#storage> <${bob}>.`,
    );
    const digestWritten = digestWork();

    // Bob's instance, whose catalog comes to name Alice's documents as a deck's.
    login.webId = `${bob}profile/card#me`;
    const bobs = createAppUseCases({ ...options, indexedDB: undefined });
    const shared = await bobs.createInstance(
      { webId: login.webId },
      { containerUrl: `${bob}memo/`, name: "Shared", registrationTarget: "private" },
    );
    const made = await bobs.createDeck(shared.url, { en: "Spanish" });
    const catalog = `${bob}memo/catalog.ttl`;
    const named = (await (await theirs(catalog)).text())
      .replaceAll(made.cardsDocumentUrl, old)
      .replaceAll(made.reviewsDocumentUrl, profile);
    await put(theirs, catalog, named);
    await digestWritten();

    login.webId = `${alice}profile/card#me`;
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const session = { webId: login.webId };
    await useCases.attachInstanceByUrl(session, shared.url, "private");
    const report = await useCases.checkInstance(shared.url);
    expect(report.unclaimed).toEqual([
      expect.objectContaining({ documents: [old, profile], outsidePod: [old, profile] }),
    ]);
    const before = [await (await pod(old)).text(), await (await pod(profile)).text()];
    sent.length = 0;
    await expect(useCases.claimDeckDocuments(shared.url, made.url)).rejects.toMatchObject({
      code: "claimOutsidePod",
    });
    expect(
      sent.filter(({ url, method }) => url.startsWith(alice) && !["GET", "HEAD"].includes(method)),
    ).toEqual([]);
    expect([await (await pod(old)).text(), await (await pod(profile)).text()]).toEqual(before);

    // The user's own instance, naming a document elsewhere in the same pod.
    const own = await useCases.createInstance(session, {
      containerUrl: `${alice}memo/`,
      name: "Main",
      registrationTarget: "private",
    });
    const mine = await useCases.createDeck(own.url, { en: "Capitals" });
    const ownCatalog = `${alice}memo/catalog.ttl`;
    await put(
      pod,
      ownCatalog,
      (await (await pod(ownCatalog)).text()).replaceAll(mine.cardsDocumentUrl, old),
    );
    const [unclaimed] = (await useCases.checkInstance(own.url)).unclaimed!;
    expect(unclaimed).toMatchObject({ documents: [old], outsidePod: [] });
    await useCases.claimDeckDocuments(own.url, mine.url);
    expect((await useCases.checkInstance(own.url)).unclaimed).toBeUndefined();
    expect(await (await pod(old)).text()).toContain(mine.url);
    await digestWritten();
  });

  it("gives the deck-document guard of every adapter the signed-in user's storages, found once per user, and none when no one is signed in", async () => {
    const alice = "https://alice.example/";
    const bob = "https://bob.example/";
    const pod = podAt(alice, { storage: false });
    const carol = "https://carol.example/";
    const bobsPod = podAt(bob, { storage: false });
    podsNetwork({ [alice]: pod, [bob]: bobsPod, [carol]: podAt(carol, { storage: false }) });
    await put(
      pod,
      `${alice}profile/card`,
      `<#me> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`,
    );
    createAppUseCases({ ...options, indexedDB: undefined });
    const adapters = [
      "createSolidDeckRepository",
      "createSolidReviewStateRepository",
      "createSolidRepairRepository",
      "createSolidInstanceRepository",
    ];
    const storagesOf = adapters.map(
      (name) => given.get(name)!.userStorages as unknown as () => Promise<string[]>,
    );
    expect(new Set(storagesOf).size).toBe(1);
    await expect(storagesOf[0]!()).resolves.toEqual([]);
    login.webId = `${alice}profile/card#me`;
    login.sent = [];
    await expect(storagesOf[0]!()).resolves.toEqual([alice]);
    await expect(storagesOf[0]!()).resolves.toEqual([alice]);
    const profileReads = () => login.sent.filter((url) => url.startsWith(`${alice}profile/`));
    expect(profileReads()).toHaveLength(1);
    // Another user's are found anew, and a failed find is tried again.
    login.webId = `${bob}profile/card#me`;
    await expect(storagesOf[0]!()).rejects.toBeDefined();
    await put(
      bobsPod,
      `${bob}profile/card`,
      `<#me> <http://www.w3.org/ns/pim/space#storage> <${bob}>.`,
    );
    await expect(storagesOf[0]!()).resolves.toEqual([bob]);
    login.webId = `${alice}profile/card#me`;
    await expect(storagesOf[0]!()).resolves.toEqual([alice]);
    expect(profileReads()).toHaveLength(2);
    // A find that fails after another user's began leaves theirs kept.
    login.webId = `${carol}profile/card#me`;
    const failing = storagesOf[0]!();
    login.webId = `${alice}profile/card#me`;
    await expect(storagesOf[0]!()).resolves.toEqual([alice]);
    await expect(failing).rejects.toBeDefined();
    await expect(storagesOf[0]!()).resolves.toEqual([alice]);
    expect(profileReads()).toHaveLength(3);
  });

  it("writes a deck's document outside its instance's folder only in the user's storage holding the instance, on a server of many pods with untyped roots", {
    timeout: 60_000,
  }, async () => {
    const server = "https://pod.example/";
    const alice = `${server}alice/`;
    const bob = `${server}bob/`;
    const STORAGE = "http://www.w3.org/ns/pim/space#storage";
    const IS_PART_OF = "http://purl.org/dc/terms/isPartOf";
    const pod = podAt(server, { storage: false });
    const sent = podsNetwork({ [server]: pod });
    await put(pod, `${alice}profile/card`, `<#me> <${STORAGE}> <${alice}>.`);
    await put(pod, `${bob}profile/card`, `<#me> <${STORAGE}> <${bob}>.`);
    const digestWritten = digestWork();

    // Bob's instance, whose catalog names a document in Alice's pod that says it is the deck's.
    login.webId = `${bob}profile/card#me`;
    const bobs = createAppUseCases({ ...options, indexedDB: undefined });
    const shared = await bobs.createInstance(
      { webId: login.webId },
      { containerUrl: `${bob}memo/`, name: "Shared", registrationTarget: "private" },
    );
    const made = await bobs.createDeck(shared.url, { en: "Spanish" });
    const theirs = `${alice}notes/list.ttl`;
    await put(
      pod,
      theirs,
      `<> <${IS_PART_OF}> <${made.url}> .\n<#entry> <https://example.org/says> "mine" .`,
    );
    const catalog = `${bob}memo/catalog.ttl`;
    await put(
      pod,
      catalog,
      (await (await pod(catalog)).text()).replaceAll(made.cardsDocumentUrl, theirs),
    );
    await digestWritten();

    login.webId = `${alice}profile/card#me`;
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const session = { webId: login.webId };
    await useCases.attachInstanceByUrl(session, shared.url, "private");
    const [deck] = await useCases.listDecks(shared.url);
    expect(deck!.cardsDocumentUrl).toBe(theirs);
    const before = await (await pod(theirs)).text();
    sent.length = 0;
    await expect(
      useCases.addCard(deck!, { front: { en: "uno" }, back: { en: "one" } }),
    ).rejects.toMatchObject({ code: "deckDocumentUnclaimed" });
    expect((await useCases.checkInstance(shared.url)).unclaimed).toEqual([
      expect.objectContaining({ documents: [theirs] }),
    ]);
    expect(
      sent.filter(({ url, method }) => url === theirs && !["GET", "HEAD"].includes(method)),
    ).toEqual([]);
    expect(await (await pod(theirs)).text()).toBe(before);

    // Her own instance, naming a document elsewhere in her storage that says it is the deck's.
    const own = await useCases.createInstance(session, {
      containerUrl: `${alice}memo/`,
      name: "Main",
      registrationTarget: "private",
    });
    const mine = await useCases.createDeck(own.url, { en: "Capitals" });
    const kort = `${alice}kort/capitals.ttl`;
    await put(pod, kort, `<> <${IS_PART_OF}> <${mine.url}> .`);
    const ownCatalog = `${alice}memo/catalog.ttl`;
    await put(
      pod,
      ownCatalog,
      (await (await pod(ownCatalog)).text()).replaceAll(mine.cardsDocumentUrl, kort),
    );
    const [listed] = await useCases.listDecks(own.url);
    await useCases.addCard(listed!, { front: { en: "Sweden" }, back: { en: "Stockholm" } });
    expect(await (await pod(kort)).text()).toContain("Stockholm");
    await digestWritten();
  });

  it("reads no document the profile links on another server, as the user or at all", async () => {
    const alice = "https://alice.example/";
    const elsewhere = "https://elsewhere.example/";
    const pod = podAt(alice);
    const theirs = podAt(elsewhere);
    const sent = podsNetwork({ [alice]: pod, [elsewhere]: theirs });
    login.webId = `${alice}profile/card#me`;
    const solid = "http://www.w3.org/ns/solid/terms#";
    const pim = "http://www.w3.org/ns/pim/space#";
    const seeAlso = "http://www.w3.org/2000/01/rdf-schema#seeAlso";
    // A profile with a private index and no public one, linking a document someone else keeps.
    await put(
      pod,
      `${alice}profile/card`,
      `<${login.webId}> <${pim}storage> <${alice}>; <${solid}privateTypeIndex> <${alice}settings/private.ttl>; <${seeAlso}> <${elsewhere}doc>.`,
    );
    await put(pod, `${alice}settings/private.ttl`, `<> a <${solid}TypeIndex>.`);
    await put(
      theirs,
      `${elsewhere}doc`,
      `<${login.webId}> <${solid}publicTypeIndex> <${elsewhere}index.ttl>; <${pim}storage> <${elsewhere}>.`,
    );
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const session = { webId: login.webId };

    expect(await useCases.listInstances(session)).toEqual([]);
    expect(await useCases.getRegistrationOptions(session)).toEqual({
      privateIndexExists: true,
      publicIndexExists: false,
    });
    expect(await useCases.listStorages(session)).toEqual([expect.objectContaining({ url: alice })]);
    expect(login.sent).toContain(`${alice}settings/private.ttl`);
    expect(login.sent.filter((url) => url.startsWith(elsewhere))).toEqual([]);
    expect(sent.filter(({ url }) => url.startsWith(elsewhere))).toEqual([]);
  });

  it("takes no instance from a type index outside the profile's own places as the user's, sending no credentials and writing nothing there", async () => {
    const alice = "https://alice.example/";
    const lapsed = "https://lapsed.example/";
    const attacker = "https://attacker.example/";
    const pod = podAt(alice);
    const theirs = podAt(lapsed);
    const sent = podsNetwork({ [alice]: pod, [lapsed]: theirs, [attacker]: podAt(attacker) });
    login.webId = `${alice}profile/card#me`;
    const solid = "http://www.w3.org/ns/solid/terms#";
    const registering = (container: string) =>
      `<#memo> a <${solid}TypeRegistration>; <${solid}forClass> <https://solid-memo.com/ns/vocab/v1.ttl#Instance>; <${solid}instanceContainer> <${container}>.`;
    // The private index in the user's own pod, the public one on a server outside the profile's places.
    await put(
      pod,
      `${alice}profile/card`,
      `<${login.webId}> <${solid}privateTypeIndex> <${alice}settings/private.ttl>; <${solid}publicTypeIndex> <${lapsed}index.ttl>.`,
    );
    await put(pod, `${alice}settings/private.ttl`, registering(`${alice}memo/`));
    await put(theirs, `${lapsed}index.ttl`, registering(`${attacker}i/`));
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const session = { webId: login.webId };

    expect(await useCases.listInstances(session)).toEqual([
      expect.objectContaining({ url: `${alice}memo/` }),
    ]);
    expect((await useCases.connectedScreenChoice(session)).instances).toEqual([
      expect.objectContaining({ url: `${alice}memo/` }),
    ]);
    await useCases.getPreferences(`${attacker}i/`);
    await expect(
      useCases.savePreferences(`${attacker}i/`, await useCases.getPreferences(`${attacker}i/`)),
    ).rejects.toMatchObject({ code: "writeOutsidePod" });
    expect(login.sent).toContain(`${alice}memo/preferences.ttl`);
    expect(login.sent.filter((url) => !url.startsWith(alice))).toEqual([]);
    expect(sent.filter(({ url, method }) => url.startsWith(attacker) && method !== "GET")).toEqual(
      [],
    );
  });

  it("counts as the user's own storages, where a refused token means the session expired, those their profile names and those entered here, not an instance elsewhere", async () => {
    const alice = "https://alice.example/";
    const entered = "https://other.example/alice/";
    const pod = podAt(alice);
    const other = podAt(entered);
    const sent = podsNetwork({ [alice]: pod, [entered]: other });
    const webId = `${alice}profile/card#me`;
    await put(other, `${entered}notes.ttl`, "<#a> <#b> <#c>.");
    await put(
      pod,
      `${alice}profile/card`,
      `<${webId}> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`,
    );
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    await useCases.addManualStorage(entered);
    const ownStorages = login.ownStorages!;

    expect(await ownStorages(webId)).toEqual([alice, entered]);
    // The profile is read as no one: asked as the user, a refused token would ask again.
    const profileReads = sent.filter(({ url }) => url.startsWith(`${alice}profile/card`));
    expect(profileReads).toEqual([expect.objectContaining({ credentials: "omit" })]);
    expect(login.sent.filter((url) => url.startsWith(alice))).toEqual([]);
    // A profile that cannot be read names none.
    expect(await ownStorages("https://nowhere.example/profile/card#me")).toEqual([entered]);
  });

  it("moves a guest's study into a folder the user enters, though their profile names no storage", {
    timeout: 60_000,
  }, async () => {
    const alice = "https://alice.example/";
    const pod = podAt(alice, { storage: false });
    podsNetwork({ [alice]: pod });
    const webId = `${alice}profile/card#me`;
    await put(
      pod,
      `${alice}profile/card`,
      `<${webId}> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${alice}settings/private.ttl>.`,
    );
    await put(
      pod,
      `${alice}settings/private.ttl`,
      "<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument>.",
    );
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    await useCases.startGuest("My study");
    const [instance] = await useCases.listInstances(GUEST_SESSION);
    const deck = await useCases.createDeck(instance!.url, { en: "Capitals" });
    await useCases.addCard(deck, { front: { en: "Sweden" }, back: { en: "Stockholm" } });
    login.webId = webId;
    const session = { webId };
    expect(await useCases.listStorages(session)).toEqual([]);

    const outcome = await useCases.transferGuestStudy(session, instance!, {
      containerUrl: `${alice}memo/`,
      registrationTarget: "private",
    });
    expect(outcome).toMatchObject({ ok: true, instance: { url: `${alice}memo/` } });
    const [moved] = await useCases.listDecks(`${alice}memo/`);
    expect((await useCases.listCards(moved!)).map((card) => card.front)).toEqual([
      { en: "Sweden" },
    ]);
  });

  it("reads a guest's instance as a graph from this browser, fetching nothing it names", async () => {
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

  it("keeps a guest's study in IndexedDB, where the browser has it", async () => {
    const indexedDB = new IDBFactory();
    await createAppUseCases({ ...options, indexedDB }).startGuest("My study");
    // Another page finds the study the first one left.
    const [instance] = await createAppUseCases({ ...options, indexedDB }).listInstances(
      GUEST_SESSION,
    );
    expect(instance!.name).toBe("My study");
  });

  it("refuses writes to a guest's study another tab is moving, and to its copy, while that move runs", async () => {
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
      const session = { webId: "https://alice.example/profile/card#me" };
      expect(await useCases.findInterruptedGuestMove(session, instance!)).toBeNull();
      await expect(useCases.removeInterruptedGuestMove(session, instance!)).rejects.toMatchObject({
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

  it("gives up a read of an instance's meta document and releases on another server that never sends them all, by the deadline on the whole read", {
    timeout: 60_000,
  }, async () => {
    const alice = "https://alice.example/";
    const bob = "https://bob.example/";
    const pod = podAt(alice);
    const theirs = podAt(bob);
    // Once `drip` is on, Bob's server answers each read and sends its body a little at a time, with no end.
    let drip = false;
    podsNetwork({
      [alice]: pod,
      [bob]: (input, init) =>
        drip && (init?.method ?? "GET") === "GET" ? dripping(input, init) : theirs(input, init),
    });
    await put(
      pod,
      `${alice}profile/card`,
      `<#me> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`,
    );
    await put(
      theirs,
      `${bob}profile/card`,
      `<#me> <http://www.w3.org/ns/pim/space#storage> <${bob}>.`,
    );
    const digestWritten = digestWork();
    login.webId = `${bob}profile/card#me`;
    const shared = await createAppUseCases({ ...options, indexedDB: undefined }).createInstance(
      { webId: login.webId },
      { containerUrl: `${bob}memo/`, name: "Shared", registrationTarget: "private" },
    );
    await digestWritten();

    login.webId = `${alice}profile/card#me`;
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    const session = { webId: login.webId };
    await useCases.attachInstanceByUrl(session, shared.url, "private");
    drip = true;
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const noAnswer = { code: "podNoAnswer" };
    const started = Date.now();
    const plan = useCases.planMigration(shared.url);
    const release = useCases.createReleaseDraft(
      shared.url,
      { kind: "nextVersionOf", url: `${bob}memo/releases/capitals/v1.ttl` },
      login.webId,
    );
    const attach = useCases.attachInstanceByUrl(session, `${bob}other/`, "private");
    await untilSettled([plan, release, attach], 10 * 60_000);
    expect(Date.now() - started).toBeLessThanOrEqual(WHOLE_READ_MS + READ_DEADLINE_MS);
    vi.useRealTimers();
    await expect(plan).rejects.toMatchObject(noAnswer);
    // The release in the instance the user registered is read as the user.
    await expect(release).rejects.toMatchObject(noAnswer);
    expect(login.sent).toContain(`${bob}memo/releases/capitals/v1.ttl`);
    // Given up, the read is one to try again, not an address with no instance.
    await expect(attach).rejects.toMatchObject(noAnswer);
  });

  it.each([
    ["a document", "memo/large.ttl"],
    ["a folder", "memo/"],
    ["the storage's root", ""],
  ])(
    "reads %s in the user's own storage as long as its body keeps coming",
    {
      timeout: 60_000,
    },
    async (_kind, path) => {
      const alice = "https://alice.example/";
      const own = `${alice}${path}`;
      const pod = podAt(alice);
      podsNetwork({
        [alice]: (input, init) =>
          String(input instanceof Request ? input.url : input) === own
            ? dripping(input, init)
            : pod(input, init),
      });
      login.webId = `${alice}profile/card#me`;
      await put(
        pod,
        `${alice}profile/card`,
        `<#me> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`,
      );
      given.clear();
      createAppUseCases({ ...options, indexedDB: undefined });
      vi.useFakeTimers();
      onTestFinished(() => {
        vi.useRealTimers();
      });
      const read = given.get("createSolidInstanceRepository")!.fetch!(new Request(own));
      await untilSettled([read], 60_000);
      const reader = (await read).body!.getReader();
      for (let passed = 0; passed <= WHOLE_READ_MS; passed += 5000) {
        const next = reader.read();
        await vi.advanceTimersByTimeAsync(5000);
        await expect(next).resolves.toMatchObject({ done: false });
      }
      await reader.cancel();
    },
  );

  it("gives up finding the user's storages by the deadline on the whole read, when their profile never ends", {
    timeout: 60_000,
  }, async () => {
    const alice = "https://alice.example/";
    const profile = `${alice}profile/card`;
    const pod = podAt(alice);
    podsNetwork({
      [alice]: (input, init) =>
        new URL(input instanceof Request ? input.url : input).pathname === "/profile/card"
          ? dripping(input, init)
          : pod(input, init),
    });
    login.webId = `${profile}#me`;
    given.clear();
    createAppUseCases({ ...options, indexedDB: undefined });
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const started = Date.now();
    const read = given.get("createSolidInstanceRepository")!.fetch!(
      new Request(`${alice}memo/meta.ttl`),
    );
    await untilSettled([read], 10 * 60_000);
    expect(Date.now() - started).toBeLessThanOrEqual(WHOLE_READ_MS + READ_DEADLINE_MS);
  });

  it("follows no redirect with the user's credentials, whatever an adapter asks", async () => {
    const alice = "https://alice.example/";
    const pod = podAt(alice);
    podsNetwork({ [alice]: pod });
    login.webId = `${alice}profile/card#me`;
    await put(
      pod,
      `${alice}profile/card`,
      `<${login.webId}> <http://www.w3.org/ns/pim/space#storage> <${alice}>.`,
    );
    given.clear();
    createAppUseCases({ ...options, indexedDB: undefined });
    // The pod's fetch, the publisher's access fetch, and the data fetch, which sends a request into the user's own pod through the credential gate.
    const fetches = {
      podFetch: given.get("createSolidInstanceRepository")!.fetch!,
      shareFetch: given.get("createSolidReleasePublisher")!.shareFetch!,
      deckFetch: given.get("createSolidDeckRepository")!.fetch!,
      reviewFetch: given.get("createSolidReviewStateRepository")!.fetch!,
    };
    const url = `${alice}solid-memo/main/decks/deck-1.ttl`;
    for (const [name, fetch] of Object.entries(fetches)) {
      for (const method of ["GET", "PUT"]) {
        vi.mocked(globalThis.fetch).mockClear();
        login.sent = [];
        await fetch(url, { method, redirect: "follow" });
        expect(vi.mocked(globalThis.fetch), `${name}: ${method}`).toHaveBeenCalledWith(
          url,
          expect.objectContaining({ method, redirect: "error" }),
        );
        expect(login.sent, `${name}: ${method}`).toContain(url);
      }
    }
  });

  it("checks a release from a link against the library's shapes as it was read, reading it once and as no one", async () => {
    const bob = "https://bob.example/";
    const release = `${bob}releases/capitals/v1.ttl`;
    const broken = `${bob}releases/broken/v1.ttl`;
    const pod = podAt(bob);
    // A release of the library's, published again in a pod, and one with a card that has no back.
    const turtle = await (await shapesFetch(`${SITE}decks/capitals-of-the-world/v1.ttl`)).text();
    await put(pod, release, turtle);
    await put(pod, broken, turtle.replace(/solid-memo:back "Zagreb"@en ,\s+"Zagreb"@sv ;/, ""));
    // The same card naming a scheduler: still a card of the release, held to its shape.
    const marked = `${bob}releases/marked/v1.ttl`;
    await put(
      pod,
      marked,
      turtle.replace(
        /solid-memo:back "Zagreb"@en ,\s+"Zagreb"@sv ;/,
        'solid-memo:scheduler "other-app" ;',
      ),
    );
    const sent = podsNetwork({ [bob]: pod });
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    await expect(useCases.readReleaseFromLink(release)).resolves.toMatchObject({ url: release });
    for (const refused of [broken, marked])
      await expect(useCases.readReleaseFromLink(refused)).rejects.toMatchObject({
        code: "releaseNotConforming",
        vars: { host: "bob.example", count: 1 },
      });
    expect(sent.filter(({ method }) => method === "GET").map(({ url }) => url)).toEqual([
      release,
      broken,
      marked,
    ]);
    expect(login.sent).not.toContain(release);
  });

  it("gives up a release from a link whose host never answers, holding up neither a course's statistics nor the deck's check, and reads it again later", {
    timeout: 180_000,
  }, async () => {
    const carol = "https://carol.example/";
    const release = `${carol}releases/capitals/v1.ttl`;
    const pod = podAt(carol);
    await put(
      pod,
      release,
      await (await shapesFetch(`${SITE}decks/capitals-of-the-world/v1.ttl`)).text(),
    );
    vi.stubGlobal("fetch", silentAt(carol, servedSiteNetwork));
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    await useCases.startGuest("My study");
    const [instance] = await useCases.listInstances(GUEST_SESSION);
    const deck = await useCases.createDeck(instance!.url, { en: "Capitals" });
    const course = { ...deck, sourceUrl: release };
    const text = { plain: (value: string) => value, check: () => [] };
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const statistics = useCases.getCourseStatistics(instance!.url, new Date(), [course]);
    const health = useCases.checkDeck(instance!.url, course, text);
    // Fake time does not wait for the site's files read from disk, so it moves on until the work is done, not by a fixed amount.
    await untilSettled([statistics, health], 30 * 60_000);
    vi.useRealTimers();
    await expect(statistics).resolves.toEqual([]);
    // The release unknown, the rest of the check still made.
    expect(await health).toMatchObject({ unstated: null });
    // Once the host answers, the release is read again, not left as the read given up.
    const sent = podsNetwork({ [carol]: pod });
    expect((await useCases.checkDeck(instance!.url, course, text)).unstated).toEqual([]);
    expect(sent.map(({ url }) => url)).toContain(release);
  });

  it("gives up a release from a link whose host answers but never sends it all, holding up neither a course's statistics nor the deck's check", {
    timeout: 180_000,
  }, async () => {
    const carol = "https://carol.example/";
    const release = `${carol}releases/capitals/v1.ttl`;
    vi.stubGlobal("fetch", stallingAt(carol, servedSiteNetwork));
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    await useCases.startGuest("My study");
    const [instance] = await useCases.listInstances(GUEST_SESSION);
    const deck = await useCases.createDeck(instance!.url, { en: "Capitals" });
    const course = { ...deck, sourceUrl: release };
    const text = { plain: (value: string) => value, check: () => [] };
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const statistics = useCases.getCourseStatistics(instance!.url, new Date(), [course]);
    const health = useCases.checkDeck(instance!.url, course, text);
    // Within a few minutes, a read of the release, and of each catalog above it, at most two each.
    await untilSettled([statistics, health], 30 * 60_000);
    vi.useRealTimers();
    await expect(statistics).resolves.toEqual([]);
    expect(await health).toMatchObject({ unstated: null });
  });

  it("reads the deck library the site publishes", async () => {
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
