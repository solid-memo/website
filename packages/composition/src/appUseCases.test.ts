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
import { createLocalPod } from "@solid-memo/solid/localPod";
import { createMemoryResourceStore } from "@solid-memo/solid/memoryResourceStore";
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

/** Writes `body` to `url` in `pod` as Turtle, as anyone who may write there can. */
async function put(pod: typeof globalThis.fetch, url: string, body: string): Promise<void> {
  await pod(url, { method: "PUT", headers: { "Content-Type": "text/turtle" }, body });
}

/** Lets granted Web Locks run their callbacks, and released ones pass on. */
async function settled(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
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
      useCases.createReleaseDraft(`${alice}memo/`, { kind: "nextVersionOf", url });

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
      useCases.createReleaseDraft("https://bob.example/memo/", {
        kind: "nextVersionOf",
        url: elsewhere,
      }),
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
      useCases.createReleaseDraft(`${alice}memo/`, { kind: "nextVersionOf", url: own }),
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
    /** A document saying it is the deck's: what anyone who may write it can state. */
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
    ).rejects.toMatchObject({ code: "writeOutsidePod", vars: { host: "attacker.example" } });
    // Removing the deck keeps its documents there, whatever they say.
    await expect(useCases.removeDeck(elsewhere)).resolves.toEqual({
      keptDocuments: ["https://attacker.example/cards.ttl", "https://attacker.example/reviews.ttl"],
    });
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
      { code: "writeOutsidePod", vars: { host: "attacker.example" } },
    );
    // Once the reviews document no longer says it is the deck's, the data check finds it unclaimed; claiming it is refused too.
    await put(theirs, `${attacker}reviews.ttl`, "");
    expect((await useCases.checkInstance(instance.url)).unclaimed).toEqual([
      expect.objectContaining({ documents: [`${attacker}reviews.ttl`] }),
    ]);
    await expect(useCases.claimDeckDocuments(instance.url, deck!.url)).rejects.toMatchObject({
      code: "writeOutsidePod",
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
    await vi.waitFor(async () => {
      const before = sent.length;
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(sent.length).toBe(before);
    });
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
    const sent = podsNetwork({ [bob]: pod });
    const useCases = createAppUseCases({ ...options, indexedDB: undefined });
    await expect(useCases.readReleaseFromLink(release)).resolves.toMatchObject({ url: release });
    await expect(useCases.readReleaseFromLink(broken)).rejects.toMatchObject({
      code: "releaseNotConforming",
      vars: { host: "bob.example", count: 1 },
    });
    expect(sent.filter(({ method }) => method === "GET").map(({ url }) => url)).toEqual([
      release,
      broken,
    ]);
    expect(login.sent).not.toContain(release);
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
