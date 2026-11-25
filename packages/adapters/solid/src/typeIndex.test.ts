// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  type Dataset,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  type NamedSubject,
  setThing,
  type SubjectBuilder,
} from "@solid-memo/solid-client/rdf";
import { AppError } from "@solid-memo/domain/appError";
import { readDocument, writeDocument } from "@solid-memo/solid-client/resources";
import { MAX_PROFILE_DOCUMENTS } from "@solid-memo/solid-client/readLimits";
import { datasetFrom, readOf, writtenAsGiven } from "./testing/datasets";
import {
  addInstanceRegistration,
  createTypeIndex,
  ensureTypeIndex,
  locateTypeIndexes,
  readInstanceRegistrations,
  readTypeIndexChoices,
  readOldRegistrations,
  removeInstanceRegistrations,
  removeOldRegistrations,
  renameInstanceRegistrations,
} from "./typeIndex";
import { DCAT, DCTERMS, RDF, SM, SOLID } from "./vocab";

/** The profile's terms (ns/bounds/profile.ttl). */
const PIM = {
  preferencesFile: "http://www.w3.org/ns/pim/space#preferencesFile",
  storage: "http://www.w3.org/ns/pim/space#storage",
} as const;
const RDFS = { seeAlso: "http://www.w3.org/2000/01/rdf-schema#seeAlso" } as const;
const FOAF = { isPrimaryTopicOf: "http://xmlns.com/foaf/0.1/isPrimaryTopicOf" } as const;

vi.mock("@solid-memo/solid-client/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solid-memo/solid-client/resources")>();
  return {
    ...actual,
    readDocument: vi.fn(),
    // A write the pod takes as given, with no version.
    writeDocument: vi.fn(async (_url: string, dataset: object) => ({ dataset, etag: undefined })),
  };
});

const WEBID = "https://alice.example/profile/card#me";
const PROFILE_DOC = "https://alice.example/profile/card";
const PRIVATE_INDEX = "https://alice.example/settings/privateTypeIndex.ttl";
const PUBLIC_INDEX = "https://alice.example/settings/publicTypeIndex.ttl";
const PREFERENCES_FILE = "https://alice.example/settings/prefs.ttl";
const EXTENDED_PROFILE = "https://alice.example/profile";
const STORAGE_ROOT = "https://alice.example/";

const noFetch = vi.fn() as unknown as typeof globalThis.fetch;

/** Alice's WebID document, naming her storage, with `build` applied. */
function profileDataset(build: (thing: SubjectBuilder) => SubjectBuilder = (t) => t): Dataset {
  return setThing(
    datasetFrom(PROFILE_DOC),
    build(buildThing(createThing({ url: WEBID })).addIri(PIM.storage, STORAGE_ROOT)).build(),
  );
}

/** A document at `documentUrl` holding the WebID subject with `build` applied. */
function subjectDocument(
  documentUrl: string,
  build: (thing: SubjectBuilder) => SubjectBuilder = (t) => t,
): Dataset {
  return setThing(datasetFrom(documentUrl), build(buildThing(createThing({ url: WEBID }))).build());
}

/** Route readDocument calls by URL; unknown URLs fail like a 404. */
function mockDatasets(datasets: Record<string, Dataset>) {
  vi.mocked(readDocument).mockImplementation((async (url: string) => {
    const dataset = datasets[url];
    if (dataset === undefined) {
      throw Object.assign(new Error(`404 ${url}`), { statusCode: 404 });
    }
    return readOf(dataset);
  }) as never);
}

beforeEach(() => {
  vi.mocked(readDocument).mockReset();
  vi.mocked(writeDocument).mockReset();
});

/** Every document read, each once: the storage lookup reads the WebID document again. */
function documentsRead(): Set<string> {
  return new Set(vi.mocked(readDocument).mock.calls.map(([url]) => url));
}

/** The links locateTypeIndexes finds, as it gives them. */
async function linksFound(
  fetch: typeof globalThis.fetch = noFetch,
): Promise<{ url: string; kind: string; fromPreferences: boolean }[]> {
  return (await locateTypeIndexes(WEBID, fetch, noFetch)).links;
}

const privateLink = (url: string, fromPreferences = false) => ({
  url,
  kind: "private",
  fromPreferences,
});
const publicLink = (url: string) => ({ url, kind: "public", fromPreferences: false });

describe("locateTypeIndexes", () => {
  it("finds both indexes linked directly from the profile", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX).addIri(SOLID.publicTypeIndex, PUBLIC_INDEX),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      inOwnStorage: expect.any(Function),
      links: [privateLink(PRIVATE_INDEX), publicLink(PUBLIC_INDEX)],
    });
  });

  it("finds none when the profile has no WebID subject", async () => {
    mockDatasets({ [WEBID]: datasetFrom(PROFILE_DOC) });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      inOwnStorage: expect.any(Function),
      links: [],
    });
  });

  it("follows the preferences file to the private index", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(PIM.preferencesFile, PREFERENCES_FILE)),
      [PREFERENCES_FILE]: subjectDocument(PREFERENCES_FILE, (t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX),
      ),
    });
    await expect(linksFound()).resolves.toEqual([privateLink(PRIVATE_INDEX, true)]);
  });

  it("finds the preferences file's private index beside one the profile links itself", async () => {
    // A pod made long ago: the profile links one index, and the preferences file another.
    const older = "https://alice.example/settings/privateTypeIndex";
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t.addIri(SOLID.privateTypeIndex, older).addIri(PIM.preferencesFile, PREFERENCES_FILE),
      ),
      [PREFERENCES_FILE]: subjectDocument(PREFERENCES_FILE, (t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX),
      ),
    });
    await expect(linksFound()).resolves.toEqual([
      privateLink(older),
      privateLink(PRIVATE_INDEX, true),
    ]);
  });

  it("finds an index the profile and the preferences file both link once", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t
          .addIri(SOLID.privateTypeIndex, PRIVATE_INDEX)
          .addIri(PIM.preferencesFile, PREFERENCES_FILE),
      ),
      [PREFERENCES_FILE]: subjectDocument(PREFERENCES_FILE, (t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX),
      ),
    });
    await expect(linksFound()).resolves.toEqual([privateLink(PRIVATE_INDEX, true)]);
  });

  it("leaves out a public index the preferences file links, which no one else finds there", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(PIM.preferencesFile, PREFERENCES_FILE)),
      [PREFERENCES_FILE]: subjectDocument(PREFERENCES_FILE, (t) =>
        t.addIri(SOLID.publicTypeIndex, PUBLIC_INDEX),
      ),
    });
    await expect(linksFound()).resolves.toEqual([]);
  });

  it("takes an index linked as both kinds as one of each", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t
          .addIri(SOLID.privateTypeIndex, PRIVATE_INDEX)
          .addIri(SOLID.publicTypeIndex, PRIVATE_INDEX),
      ),
    });
    await expect(linksFound()).resolves.toEqual([
      privateLink(PRIVATE_INDEX),
      publicLink(PRIVATE_INDEX),
    ]);
  });

  it(`keeps no more than ${MAX_PROFILE_DOCUMENTS} links of a kind`, async () => {
    const urls = Array.from(
      { length: MAX_PROFILE_DOCUMENTS + 1 },
      (_, i) => `https://alice.example/settings/index-${i}.ttl`,
    );
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        urls.reduce((built, url) => built.addIri(SOLID.privateTypeIndex, url), t),
      ),
    });
    await expect(linksFound()).resolves.toHaveLength(MAX_PROFILE_DOCUMENTS);
  });

  it("treats an unreadable preferences file as no private index", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(PIM.preferencesFile, PREFERENCES_FILE)),
    });
    await expect(linksFound()).resolves.toEqual([]);
  });

  it.each([
    ["gone", Object.assign(new Error("410 Gone"), { statusCode: 410 })],
    ["not readable as RDF", new Error("Unexpected token")],
  ])("treats a preferences file that is %s as no private index", async (_, failure) => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(PIM.preferencesFile, PREFERENCES_FILE)),
    });
    const read = vi.mocked(readDocument).getMockImplementation()!;
    vi.mocked(readDocument).mockImplementation(async (url, options) => {
      if (url !== PREFERENCES_FILE) return read(url, options);
      // As the pod answered: a failure before any answer says nothing of the document.
      await options.fetch(url);
      throw failure;
    });
    const answering = vi.fn(async () => new Response("")) as unknown as typeof globalThis.fetch;
    await expect(linksFound(answering)).resolves.toEqual([]);
  });

  it.each([
    ["refused as no one (401)", Object.assign(new Error("401"), { statusCode: 401 })],
    ["forbidden (403)", Object.assign(new Error("403"), { response: { status: 403 } })],
    ["a server failure (503)", Object.assign(new Error("503"), { statusCode: 503 })],
    ["no answer (a network failure)", new TypeError("Failed to fetch")],
    ["no answer in time", new AppError("podNoAnswer", { url: PREFERENCES_FILE })],
    ["an abort", new DOMException("The operation was aborted.", "AbortError")],
  ])("fails when the preferences file could not be read now: %s", async (_, failure) => {
    vi.mocked(readDocument).mockImplementation(async (url) => {
      if (url === PREFERENCES_FILE) throw failure;
      return readOf(profileDataset((t) => t.addIri(PIM.preferencesFile, PREFERENCES_FILE)));
    });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).rejects.toBe(failure);
  });

  it("fails when an extended profile document could not be read now", async () => {
    const refused = Object.assign(new Error("401"), { statusCode: 401 });
    vi.mocked(readDocument).mockImplementation(async (url) => {
      if (url === EXTENDED_PROFILE) throw refused;
      return readOf(profileDataset((t) => t.addIri(RDFS.seeAlso, EXTENDED_PROFILE)));
    });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).rejects.toBe(refused);
  });

  it("treats a preferences file without the WebID subject as no private index", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(PIM.preferencesFile, PREFERENCES_FILE)),
      [PREFERENCES_FILE]: datasetFrom(PREFERENCES_FILE),
    });
    await expect(linksFound()).resolves.toEqual([]);
  });

  it("finds none when the profile links nothing", async () => {
    mockDatasets({ [WEBID]: profileDataset() });
    await expect(linksFound()).resolves.toEqual([]);
  });

  it("finds indexes linked from an rdfs:seeAlso extended profile", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(RDFS.seeAlso, EXTENDED_PROFILE)),
      [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE, (t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX).addIri(SOLID.publicTypeIndex, PUBLIC_INDEX),
      ),
    });
    await expect(linksFound()).resolves.toEqual([
      privateLink(PRIVATE_INDEX),
      publicLink(PUBLIC_INDEX),
    ]);
  });

  it("finds indexes linked from a foaf:isPrimaryTopicOf extended profile", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(FOAF.isPrimaryTopicOf, EXTENDED_PROFILE)),
      [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE, (t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX),
      ),
    });
    await expect(linksFound()).resolves.toEqual([privateLink(PRIVATE_INDEX)]);
  });

  it("finds every index the WebID document and the extended profile link, the WebID document's first", async () => {
    const other = "https://alice.example/other.ttl";
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t
          .addIri(SOLID.privateTypeIndex, PRIVATE_INDEX)
          .addIri(SOLID.publicTypeIndex, PUBLIC_INDEX)
          .addIri(RDFS.seeAlso, EXTENDED_PROFILE),
      ),
      [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE, (t) =>
        t.addIri(SOLID.privateTypeIndex, other).addIri(SOLID.publicTypeIndex, PUBLIC_INDEX),
      ),
    });
    await expect(linksFound()).resolves.toEqual([
      privateLink(PRIVATE_INDEX),
      privateLink(other),
      publicLink(PUBLIC_INDEX),
    ]);
  });

  it("does not re-fetch the WebID document when it is its own isPrimaryTopicOf", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(FOAF.isPrimaryTopicOf, PROFILE_DOC)),
    });
    await expect(linksFound()).resolves.toEqual([]);
    expect(documentsRead()).toEqual(new Set([WEBID]));
  });

  it("treats an unreadable extended profile as linking nothing", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(RDFS.seeAlso, EXTENDED_PROFILE)),
    });
    await expect(linksFound()).resolves.toEqual([]);
  });
});

describe("locateTypeIndexes outside the profile's own places", () => {
  const ELSEWHERE = "https://elsewhere.example/doc";
  const STORAGE = "https://storage.example/alice/";
  const STORED_PROFILE = `${STORAGE}profile`;

  /**
   * A server that answers the extended profile, naming STORAGE, as the
   * storage lookup reads it, and any other request with nothing.
   */
  function extendedProfileServer() {
    return vi.fn<typeof globalThis.fetch>(async (input) =>
      String(input) === EXTENDED_PROFILE
        ? new Response(`<${WEBID}> <${PIM.storage}> <${STORAGE}> .`, {
            headers: { "Content-Type": "text/turtle" },
          })
        : new Response(""),
    );
  }

  it("reads no document the profile links on another server, as the user or at all", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t
          .addIri(RDFS.seeAlso, ELSEWHERE)
          .addIri(FOAF.isPrimaryTopicOf, `${ELSEWHERE}2`)
          .addIri(PIM.preferencesFile, `${ELSEWHERE}3`),
      ),
      [ELSEWHERE]: subjectDocument(ELSEWHERE, (t) => t.addIri(SOLID.publicTypeIndex, PUBLIC_INDEX)),
    });
    await expect(linksFound()).resolves.toEqual([]);
    expect(documentsRead()).toEqual(new Set([WEBID]));
  });

  it("reads one in a storage the WebID document names, on another server", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t.addIri(PIM.storage, STORAGE).addIri(RDFS.seeAlso, STORED_PROFILE),
      ),
      [STORED_PROFILE]: subjectDocument(STORED_PROFILE, (t) =>
        t.addIri(SOLID.publicTypeIndex, `${STORAGE}settings/publicTypeIndex.ttl`),
      ),
    });
    await expect(linksFound()).resolves.toEqual([
      publicLink(`${STORAGE}settings/publicTypeIndex.ttl`),
    ]);
  });

  it("takes no storage an extended profile names outside the user's own, nor an index or preferences file there", async () => {
    const storedPublic = `${STORAGE}settings/publicTypeIndex.ttl`;
    const storedPreferences = `${STORAGE}settings/prefs.ttl`;
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t
          .addIri(SOLID.publicTypeIndex, storedPublic)
          .addIri(PIM.preferencesFile, storedPreferences)
          .addIri(RDFS.seeAlso, EXTENDED_PROFILE),
      ),
      [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE, (t) => t.addIri(PIM.storage, STORAGE)),
      [storedPreferences]: subjectDocument(storedPreferences, (t) =>
        t.addIri(SOLID.privateTypeIndex, `${STORAGE}settings/privateTypeIndex.ttl`),
      ),
    });
    const fetch = extendedProfileServer();
    const publicFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(""));
    const {
      fetch: indexFetch,
      links,
      inOwnStorage,
    } = await locateTypeIndexes(WEBID, fetch, publicFetch);

    expect(links).toEqual([]);
    expect(documentsRead()).toEqual(new Set([WEBID, EXTENDED_PROFILE]));
    expect(inOwnStorage(storedPublic)).toBe(false);
    fetch.mockClear();
    // The WebID's origin is the user's; the storage the extended profile names is not.
    await indexFetch(PUBLIC_INDEX);
    await indexFetch(storedPublic);
    await expect(indexFetch(storedPublic, { method: "PATCH" })).rejects.toMatchObject({
      code: "writeOutsidePod",
    });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([PUBLIC_INDEX]);
    expect(publicFetch).toHaveBeenCalledExactlyOnceWith(storedPublic, undefined);
  });

  it("takes nothing from a linked document in another user's pod on the WebID's origin", async () => {
    const card = "https://pod.example/alice/profile/card";
    const webId = `${card}#me`;
    const shared = "https://pod.example/mallory/shared.ttl";
    const foreignIndex = "https://pod.example/mallory/ti.ttl";
    const own = (build: (thing: SubjectBuilder) => SubjectBuilder) =>
      setThing(datasetFrom(card), build(buildThing(createThing({ url: webId }))).build());
    const foreign = setThing(
      datasetFrom(shared),
      buildThing(createThing({ url: webId }))
        .addIri(PIM.storage, "https://pod.example/mallory/")
        .addIri(PIM.storage, "https://evil.example/")
        .addIri(SOLID.publicTypeIndex, foreignIndex)
        .build(),
    );
    mockDatasets({ [webId]: own((t) => t.addIri(RDFS.seeAlso, shared)), [shared]: foreign });
    // Alice's pod shows its storage; the linked document names others, and an index of its own.
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input);
      if (url === shared) {
        return new Response(
          `<${webId}> <${PIM.storage}> <https://pod.example/mallory/>, <https://evil.example/>;
            <${SOLID.publicTypeIndex}> <${foreignIndex}> .`,
          { headers: { "Content-Type": "text/turtle" } },
        );
      }
      const headers = new Headers();
      if (url === "https://pod.example/alice/") {
        headers.set("Link", '<http://www.w3.org/ns/pim/space#Storage>; rel="type"');
      }
      return new Response(null, { headers });
    });

    const { links, inOwnStorage } = await locateTypeIndexes(webId, fetch, noFetch, {
      forWriting: true,
    });

    expect(links).toEqual([]);
    expect(inOwnStorage(foreignIndex)).toBe(false);
    expect(inOwnStorage("https://evil.example/settings/index.ttl")).toBe(false);
    expect(inOwnStorage("https://pod.example/alice/settings/publicTypeIndex.ttl")).toBe(true);
    expect(documentsRead()).toEqual(new Set([webId]));
    expect(fetch.mock.calls.map(([url]) => String(url))).not.toContain(shared);

    // Even when Alice's WebID document names her storage, the linked document adds none.
    vi.mocked(readDocument).mockClear();
    mockDatasets({
      [webId]: own((t) =>
        t.addIri(PIM.storage, "https://pod.example/alice/").addIri(RDFS.seeAlso, shared),
      ),
      [shared]: foreign,
    });
    const named = await locateTypeIndexes(webId, fetch, noFetch, { forWriting: true });
    expect(named.links).toEqual([]);
    expect(named.inOwnStorage(foreignIndex)).toBe(false);
    expect(documentsRead()).toEqual(new Set([webId]));
  });

  it.each([
    ["the WebID's own pod", "https://pod.example/alice/profile/card#me", true],
    [
      "the origin root, which may hold other users' pods",
      "https://pod.example/profile/card#me",
      false,
    ],
  ])(
    "reads the preferences file and more of the profile, when no storage is known, only in %s",
    async (_, webId, read) => {
      const card = webId.split("#")[0]!;
      const own = "https://pod.example/alice/settings/prefs.ttl";
      const theirs = "https://pod.example/mallory/prefs.ttl";
      const shared = "https://pod.example/mallory/shared.ttl";
      const index = "https://pod.example/alice/settings/privateTypeIndex.ttl";
      const naming = (url: string) =>
        setThing(
          datasetFrom(url),
          buildThing(createThing({ url: webId }))
            .addIri(SOLID.privateTypeIndex, index)
            .addIri(PIM.storage, "https://pod.example/mallory/")
            .build(),
        );
      const webIdDocument = (prefs: string) =>
        setThing(
          datasetFrom(card),
          buildThing(createThing({ url: webId }))
            .addIri(PIM.preferencesFile, prefs)
            .addIri(RDFS.seeAlso, shared)
            .build(),
        );
      // The server shows no storage.
      const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null));

      mockDatasets({
        [webId]: webIdDocument(theirs),
        [theirs]: naming(theirs),
        [shared]: naming(shared),
      });
      await expect(locateTypeIndexes(webId, fetch, noFetch)).resolves.toMatchObject({ links: [] });
      expect(documentsRead()).toEqual(new Set([webId]));

      vi.mocked(readDocument).mockClear();
      mockDatasets({ [webId]: webIdDocument(own), [own]: naming(own), [shared]: naming(shared) });
      await expect(locateTypeIndexes(webId, fetch, noFetch)).resolves.toMatchObject({
        links: read ? [privateLink(index, true)] : [],
      });
      expect(documentsRead()).toEqual(new Set(read ? [webId, own] : [webId]));
    },
  );

  it("says which addresses are in the user's own storages", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(PIM.storage, STORAGE)),
    });
    const { inOwnStorage } = await locateTypeIndexes(WEBID, noFetch, noFetch);

    expect(inOwnStorage(PUBLIC_INDEX)).toBe(true);
    expect(inOwnStorage(`${STORAGE}settings/privateTypeIndex.ttl`)).toBe(true);
    expect(inOwnStorage("https://storage.example/bob/settings/privateTypeIndex.ttl")).toBe(false);
    expect(inOwnStorage(`${ELSEWHERE}/publicTypeIndex.ttl`)).toBe(false);
  });

  it("of several links, keeps those in the profile's own places alone", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t
          .addIri(SOLID.privateTypeIndex, `${ELSEWHERE}/privateTypeIndex.ttl`)
          .addIri(SOLID.privateTypeIndex, PRIVATE_INDEX)
          .addIri(SOLID.publicTypeIndex, `${ELSEWHERE}/publicTypeIndex.ttl`),
      ),
    });
    await expect(linksFound()).resolves.toEqual([privateLink(PRIVATE_INDEX)]);
  });

  it("gives the indexes' fetch the WebID's own places when the profile does not describe it", async () => {
    mockDatasets({ [WEBID]: datasetFrom(PROFILE_DOC) });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(""));
    const publicFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(""));
    const { fetch: indexFetch } = await locateTypeIndexes(WEBID, fetch, publicFetch);

    await indexFetch(PUBLIC_INDEX);
    await indexFetch(ELSEWHERE);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(PUBLIC_INDEX, undefined);
    expect(publicFetch).toHaveBeenCalledExactlyOnceWith(ELSEWHERE, undefined);
  });
});

describe("createTypeIndex", () => {
  /** Alice's WebID document, naming no storage: hers is found by walking up from it. */
  function bareProfile(build: (thing: SubjectBuilder) => SubjectBuilder = (t) => t): Dataset {
    return subjectDocument(PROFILE_DOC, build);
  }

  function storageAwareFetch(storageRoot: string): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
      const headers = new Headers();
      if (String(input) === storageRoot) {
        headers.set("Link", '<http://www.w3.org/ns/pim/space#Storage>; rel="type"');
      }
      return new Response(null, { status: 200, headers });
    }) as typeof globalThis.fetch;
  }

  it("creates a private index under the storage and links it from the profile", async () => {
    mockDatasets({ [WEBID]: bareProfile() });
    const fetch = storageAwareFetch("https://alice.example/");

    const { url: indexUrl, created } = await createTypeIndex(
      "private",
      WEBID,
      "https://alice.example/solid-memo/main/",
      fetch,
    );

    expect(indexUrl).toBe(PRIVATE_INDEX);
    expect(created).toBe(true);
    const [firstSaveUrl, indexDataset] = vi.mocked(writeDocument).mock.calls[0];
    expect(firstSaveUrl).toBe(PRIVATE_INDEX);
    const indexThing = getThing(indexDataset as Dataset, PRIVATE_INDEX)!;
    expect(getUrlAll(indexThing, RDF.type)).toEqual([SOLID.TypeIndex, SOLID.UnlistedDocument]);

    const [secondSaveUrl, profileSaved] = vi.mocked(writeDocument).mock.calls[1];
    expect(secondSaveUrl).toBe(PROFILE_DOC);
    const profileThing = getThing(profileSaved as Dataset, WEBID)!;
    expect(getUrl(profileThing, SOLID.privateTypeIndex)).toBe(PRIVATE_INDEX);
  });

  it("creates a public index typed as a ListedDocument", async () => {
    mockDatasets({ [WEBID]: bareProfile() });
    const fetch = storageAwareFetch("https://alice.example/");

    const { url: indexUrl, created } = await createTypeIndex(
      "public",
      WEBID,
      "https://alice.example/solid-memo/main/",
      fetch,
    );

    expect(indexUrl).toBe(PUBLIC_INDEX);
    expect(created).toBe(true);
    const [, indexDataset] = vi.mocked(writeDocument).mock.calls[0];
    const indexThing = getThing(indexDataset as Dataset, PUBLIC_INDEX)!;
    expect(getUrlAll(indexThing, RDF.type)).toContain(SOLID.ListedDocument);
    const [, profileSaved] = vi.mocked(writeDocument).mock.calls[1];
    const profileThing = getThing(profileSaved as Dataset, WEBID)!;
    expect(getUrl(profileThing, SOLID.publicTypeIndex)).toBe(PUBLIC_INDEX);
  });

  it("refuses, writing nothing, when the WebID leads to no storage", async () => {
    mockDatasets({ [WEBID]: bareProfile() });
    const fetch = vi.fn(async () => new Response(null, { status: 200 })) as typeof globalThis.fetch;

    await expect(
      createTypeIndex("private", WEBID, "https://alice.example/deep/path/main/", fetch),
    ).rejects.toMatchObject({ code: "typeIndexNoStorage" });
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("keeps the index in the user's storage, not on the server of an instance elsewhere", async () => {
    mockDatasets({ [WEBID]: bareProfile() });
    // Both servers say where a storage is; only the WebID's is the user's.
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const headers = new Headers();
      if (["https://alice.example/", "https://attacker.example/"].includes(String(input))) {
        headers.set("Link", '<http://www.w3.org/ns/pim/space#Storage>; rel="type"');
      }
      return new Response(null, { status: 200, headers });
    }) as typeof globalThis.fetch;

    await expect(
      createTypeIndex("public", WEBID, "https://attacker.example/open/", fetch),
    ).resolves.toEqual({ url: PUBLIC_INDEX, created: true });
    const saveUrls = vi.mocked(writeDocument).mock.calls.map(([url]) => url);
    expect(saveUrls).toEqual([PUBLIC_INDEX, PROFILE_DOC]);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).not.toContain(
      "https://attacker.example/",
    );
  });

  it("uses the storage the profile names that the instance is in, else the first", async () => {
    const work = "https://work.example/alice/";
    mockDatasets({
      [WEBID]: bareProfile((t) =>
        t.addIri(PIM.storage, "https://alice.example/").addIri(PIM.storage, work),
      ),
    });

    await expect(
      createTypeIndex("private", WEBID, `${work}solid-memo/main/`, noFetch),
    ).resolves.toEqual({ url: `${work}settings/privateTypeIndex.ttl`, created: true });
    await expect(
      createTypeIndex("private", WEBID, "https://attacker.example/open/", noFetch),
    ).resolves.toEqual({ url: PRIVATE_INDEX, created: true });
  });

  it("keeps walking when a HEAD request fails", async () => {
    mockDatasets({ [WEBID]: bareProfile() });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementation(async (input: RequestInfo | URL) => {
        const headers = new Headers();
        if (String(input) === "https://alice.example/") {
          headers.set("Link", '<http://www.w3.org/ns/pim/space#Storage>; rel="type"');
        }
        return new Response(null, { status: 200, headers });
      });

    await expect(
      createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
    ).resolves.toEqual({ url: PRIVATE_INDEX, created: true });
  });

  it("adopts an existing index document instead of overwriting it", async () => {
    const leftover = setThing(
      indexDocument(PRIVATE_INDEX, [SOLID.TypeIndex]),
      buildThing(createThing({ url: `${PRIVATE_INDEX}#sm-inst-old` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .build(),
    );
    mockDatasets({ [WEBID]: bareProfile(), [PRIVATE_INDEX]: leftover });
    const fetch = storageAwareFetch("https://alice.example/");

    await expect(
      createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
    ).resolves.toEqual({ url: PRIVATE_INDEX, created: false });

    const saveUrls = vi.mocked(writeDocument).mock.calls.map(([url]) => url);
    expect(saveUrls).toEqual([PROFILE_DOC]);
  });

  it("refuses, writing nothing, a document there that does not say it is a type index", async () => {
    mockDatasets({ [WEBID]: bareProfile(), [PUBLIC_INDEX]: indexDocument(PUBLIC_INDEX, []) });
    const fetch = storageAwareFetch("https://alice.example/");

    await expect(
      createTypeIndex("public", WEBID, "https://alice.example/x/", fetch),
    ).rejects.toMatchObject({ code: "notATypeIndex" });
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("rethrows a non-404 failure when probing for an existing index", async () => {
    mockDatasets({ [WEBID]: bareProfile() });
    vi.mocked(readDocument).mockImplementation((async (url: string) => {
      if (url === WEBID) return readOf(bareProfile());
      throw Object.assign(new Error("boom"), { statusCode: 500 });
    }) as never);
    const fetch = storageAwareFetch("https://alice.example/");

    await expect(
      createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
    ).rejects.toThrow("boom");
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("throws when the profile has no WebID subject to link from", async () => {
    mockDatasets({ [WEBID]: datasetFrom(PROFILE_DOC) });
    const fetch = storageAwareFetch("https://alice.example/");

    await expect(
      createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
    ).rejects.toThrow("Your profile does not describe you");
  });

  describe("with a read-only WebID document (Inrupt PodSpaces style)", () => {
    function rejectSavesTo(...readOnlyUrls: string[]) {
      vi.mocked(writeDocument).mockImplementation((async (url: string, dataset: Dataset) => {
        if (readOnlyUrls.includes(url)) {
          throw new Error(`Storing the Resource at [${url}] failed: [405]`);
        }
        return writtenAsGiven(url, dataset);
      }) as never);
    }

    it("links the index from the extended profile instead", async () => {
      mockDatasets({
        [WEBID]: bareProfile((t) =>
          t.addIri(RDFS.seeAlso, EXTENDED_PROFILE).addIri(FOAF.isPrimaryTopicOf, EXTENDED_PROFILE),
        ),
        [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE),
      });
      rejectSavesTo(PROFILE_DOC);
      const fetch = storageAwareFetch("https://alice.example/");

      await expect(
        createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
      ).resolves.toEqual({ url: PRIVATE_INDEX, created: true });

      const saveUrls = vi.mocked(writeDocument).mock.calls.map(([url]) => url);
      expect(saveUrls).toEqual([PRIVATE_INDEX, PROFILE_DOC, EXTENDED_PROFILE]);
      const [, saved] = vi.mocked(writeDocument).mock.calls[2];
      const subject = getThing(saved as Dataset, WEBID)!;
      expect(getUrl(subject, SOLID.privateTypeIndex)).toBe(PRIVATE_INDEX);
    });

    it("creates the WebID subject in an extended profile that lacks it", async () => {
      mockDatasets({
        [WEBID]: bareProfile((t) => t.addIri(RDFS.seeAlso, EXTENDED_PROFILE)),
        [EXTENDED_PROFILE]: datasetFrom(EXTENDED_PROFILE),
      });
      rejectSavesTo(PROFILE_DOC);
      const fetch = storageAwareFetch("https://alice.example/");

      await createTypeIndex("public", WEBID, "https://alice.example/x/", fetch);

      const [url, saved] = vi.mocked(writeDocument).mock.calls[2];
      expect(url).toBe(EXTENDED_PROFILE);
      const subject = getThing(saved as Dataset, WEBID)!;
      expect(getUrl(subject, SOLID.publicTypeIndex)).toBe(PUBLIC_INDEX);
    });

    it("reports every failed document when no profile accepts the link", async () => {
      mockDatasets({
        [WEBID]: bareProfile((t) => t.addIri(RDFS.seeAlso, EXTENDED_PROFILE)),
        [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE),
      });
      rejectSavesTo(PROFILE_DOC, EXTENDED_PROFILE);
      const fetch = storageAwareFetch("https://alice.example/");

      const error = await createTypeIndex(
        "private",
        WEBID,
        "https://alice.example/x/",
        fetch,
      ).catch((e: unknown) => e as Error);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(`<${PROFILE_DOC}>`);
      expect((error as Error).message).toContain(`<${EXTENDED_PROFILE}>`);
    });

    it("never reads or writes an extended profile on another server", async () => {
      mockDatasets({
        [WEBID]: bareProfile((t) => t.addIri(RDFS.seeAlso, "https://elsewhere.example/doc")),
        "https://elsewhere.example/doc": subjectDocument("https://elsewhere.example/doc"),
      });
      rejectSavesTo(PROFILE_DOC);
      const fetch = storageAwareFetch("https://alice.example/");

      await expect(
        createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
      ).rejects.toThrow();
      const touched = [
        ...vi.mocked(readDocument).mock.calls.map(([url]) => url),
        ...vi.mocked(writeDocument).mock.calls.map(([url]) => url),
      ];
      expect(touched.filter((url) => url.startsWith("https://elsewhere.example/"))).toEqual([]);
    });

    it("still fails when the WebID document is read-only and has no extended profile", async () => {
      mockDatasets({ [WEBID]: bareProfile() });
      rejectSavesTo(PROFILE_DOC);
      const fetch = storageAwareFetch("https://alice.example/");

      await expect(
        createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
      ).rejects.toMatchObject({
        code: "privateTypeIndexNotLinked",
        message: expect.stringContaining("could not link its private list"),
      });
      await expect(
        createTypeIndex("public", WEBID, "https://alice.example/x/", fetch),
      ).rejects.toMatchObject({
        code: "publicTypeIndexNotLinked",
        message: expect.stringContaining("could not link its public list"),
      });
    });

    it("describes non-Error rejections too", async () => {
      mockDatasets({ [WEBID]: bareProfile() });
      vi.mocked(writeDocument).mockImplementation((async (url: string, dataset: Dataset) => {
        if (url === PROFILE_DOC) throw "nope";
        return writtenAsGiven(url, dataset);
      }) as never);
      const fetch = storageAwareFetch("https://alice.example/");

      await expect(
        createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
      ).rejects.toThrow(`<${PROFILE_DOC}>: nope`);
    });
  });
});

/** A type index document typed as `types`, registering the instances at `instances`. */
function indexDocument(url: string, types: string[], instances: string[] = []): Dataset {
  let dataset = setThing(
    datasetFrom(url),
    types
      .reduce((built, type) => built.addIri(RDF.type, type), buildThing(createThing({ url })))
      .build(),
  );
  for (const [i, instance] of instances.entries()) {
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${url}#sm-inst-${i}` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .addIri(SOLID.forClass, SM.Instance)
        .addIri(SOLID.instanceContainer, instance)
        .build(),
    );
  }
  return dataset;
}

/** A read as no one answered `status` for every address. */
function answeringAnyone(status: number): typeof globalThis.fetch {
  return vi.fn(async () => new Response(null, { status })) as unknown as typeof globalThis.fetch;
}

describe("readTypeIndexChoices", () => {
  const OLDER = "https://alice.example/settings/privateTypeIndex";

  it("says of each index the user can read what it says it is, holds, and who may read it", async () => {
    const both = "https://alice.example/settings/both.ttl";
    const typedPublic = "https://alice.example/settings/typedPublic.ttl";
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t
          .addIri(SOLID.privateTypeIndex, OLDER)
          .addIri(SOLID.privateTypeIndex, typedPublic)
          .addIri(SOLID.privateTypeIndex, both)
          .addIri(SOLID.publicTypeIndex, both)
          .addIri(SOLID.publicTypeIndex, PUBLIC_INDEX)
          .addIri(PIM.preferencesFile, PREFERENCES_FILE),
      ),
      [PREFERENCES_FILE]: subjectDocument(PREFERENCES_FILE, (t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX),
      ),
      [OLDER]: indexDocument(OLDER, [], ["https://alice.example/solid-memo/main/"]),
      [PRIVATE_INDEX]: indexDocument(PRIVATE_INDEX, [SOLID.TypeIndex, SOLID.UnlistedDocument]),
      [typedPublic]: indexDocument(typedPublic, [SOLID.TypeIndex, SOLID.ListedDocument]),
      [both]: indexDocument(both, [SOLID.TypeIndex, SOLID.ListedDocument]),
      [PUBLIC_INDEX]: indexDocument(PUBLIC_INDEX, [SOLID.TypeIndex, SOLID.ListedDocument]),
    });
    const publicFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === PUBLIC_INDEX) return new Response(null, { status: 200 });
      if (url === OLDER) throw new TypeError("Failed to fetch");
      if (url === both) return new Response(null, { status: 500 });
      return new Response(null, { status: 401 });
    }) as unknown as typeof globalThis.fetch;
    const indexes = await locateTypeIndexes(WEBID, noFetch, noFetch);

    await expect(readTypeIndexChoices(indexes, publicFetch)).resolves.toEqual([
      {
        url: OLDER,
        kinds: ["private"],
        fromPreferences: false,
        typeFit: "none",
        holdsInstances: true,
        readableByAnyone: null,
      },
      {
        url: typedPublic,
        kinds: ["private"],
        fromPreferences: false,
        typeFit: "other",
        holdsInstances: false,
        readableByAnyone: false,
      },
      {
        url: both,
        kinds: ["private", "public"],
        fromPreferences: false,
        typeFit: "none",
        holdsInstances: false,
        readableByAnyone: null,
      },
      {
        url: PRIVATE_INDEX,
        kinds: ["private"],
        fromPreferences: true,
        typeFit: "match",
        holdsInstances: false,
        readableByAnyone: false,
      },
      {
        url: PUBLIC_INDEX,
        kinds: ["public"],
        fromPreferences: false,
        typeFit: "match",
        holdsInstances: false,
        readableByAnyone: true,
      },
    ]);
    expect(publicFetch).toHaveBeenCalledWith(PUBLIC_INDEX, { method: "HEAD" });
  });

  it.each([
    ["not there (404)", Object.assign(new Error("404"), { statusCode: 404 })],
    ["refused (401)", Object.assign(new Error("401"), { statusCode: 401 })],
    ["forbidden (403)", Object.assign(new Error("403"), { statusCode: 403 })],
    [
      "forbidden, as its response says (403)",
      Object.assign(new Error("403"), { response: { status: 403 } }),
    ],
    [
      "refused, as its cause says (401)",
      new Error("read failed", { cause: Object.assign(new Error("401"), { statusCode: 401 }) }),
    ],
  ])("leaves out an index that is %s", async (_, failure) => {
    vi.mocked(readDocument).mockImplementation(async (url) => {
      if (url === WEBID)
        return readOf(
          profileDataset((t) =>
            t.addIri(SOLID.privateTypeIndex, OLDER).addIri(SOLID.privateTypeIndex, PRIVATE_INDEX),
          ),
        );
      if (url === OLDER) throw failure;
      return readOf(indexDocument(PRIVATE_INDEX, [SOLID.TypeIndex]));
    });
    const indexes = await locateTypeIndexes(WEBID, noFetch, noFetch);

    await expect(readTypeIndexChoices(indexes, answeringAnyone(404))).resolves.toEqual([
      expect.objectContaining({ url: PRIVATE_INDEX, typeFit: "none", readableByAnyone: false }),
    ]);
  });

  const cyclic = new Error("cyclic");
  cyclic.cause = cyclic;
  it.each([
    ["a server failure (503)", Object.assign(new Error("503"), { statusCode: 503 })],
    [
      "a server failure, as its response says (503)",
      Object.assign(new Error("503"), { response: { status: 503 } }),
    ],
    ["a network failure", new TypeError("fetch failed")],
    ["a failure whose causes go round", cyclic],
  ])("fails as a read did when it may work when tried again: %s", async (_, failure) => {
    vi.mocked(readDocument).mockImplementation(async (url) => {
      if (url === WEBID)
        return readOf(
          profileDataset((t) =>
            t.addIri(SOLID.privateTypeIndex, OLDER).addIri(SOLID.privateTypeIndex, PRIVATE_INDEX),
          ),
        );
      if (url === OLDER) throw failure;
      return readOf(indexDocument(PRIVATE_INDEX, [SOLID.TypeIndex]));
    });
    const indexes = await locateTypeIndexes(WEBID, noFetch, noFetch);

    await expect(readTypeIndexChoices(indexes, answeringAnyone(404))).rejects.toBe(failure);
  });
});

describe("ensureTypeIndex", () => {
  const near = "https://alice.example/x/";
  const share = vi.fn(async () => true);
  const storageFetch = vi.fn(
    async () => new Response(null, { status: 200 }),
  ) as unknown as typeof globalThis.fetch;

  beforeEach(() => share.mockClear());

  it("of a kind, registers in the best index of it the user can read, creating nothing", async () => {
    // The preferences file's index, ranked above the one the profile links itself.
    const older = "https://alice.example/settings/privateTypeIndex";
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t.addIri(SOLID.privateTypeIndex, older).addIri(PIM.preferencesFile, PREFERENCES_FILE),
      ),
      [PREFERENCES_FILE]: subjectDocument(PREFERENCES_FILE, (t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX),
      ),
      [older]: indexDocument(older, []),
      [PRIVATE_INDEX]: indexDocument(PRIVATE_INDEX, [SOLID.TypeIndex, SOLID.UnlistedDocument]),
    });
    await expect(
      ensureTypeIndex("private", WEBID, near, noFetch, answeringAnyone(401), share),
    ).resolves.toEqual({ url: PRIVATE_INDEX, fetch: expect.any(Function) });
    expect(writeDocument).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });

  it("of a kind, creates a private index when the one linked cannot be read, sharing nothing", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t
          .addIri(PIM.storage, "https://alice.example/")
          .addIri(SOLID.privateTypeIndex, "https://alice.example/gone.ttl"),
      ),
    });
    await expect(
      ensureTypeIndex("private", WEBID, near, storageFetch, answeringAnyone(401), share),
    ).resolves.toEqual({ url: PRIVATE_INDEX, fetch: expect.any(Function) });
    expect(vi.mocked(writeDocument).mock.calls.map(([url]) => url)).toContain(PRIVATE_INDEX);
    expect(share).not.toHaveBeenCalled();
  });

  it("of a kind, creates a public index readable by anyone when there is none", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(PIM.storage, "https://alice.example/")),
    });
    await expect(
      ensureTypeIndex("public", WEBID, near, storageFetch, answeringAnyone(401), share),
    ).resolves.toEqual({ url: PUBLIC_INDEX, fetch: expect.any(Function) });
    expect(share).toHaveBeenCalledExactlyOnceWith(PUBLIC_INDEX);
  });

  it("of a kind, adopts a public index already where it would make one, sharing nothing", async () => {
    // The profile links no public index, but one only its owner may read is at the conventional path.
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(PIM.storage, "https://alice.example/")),
      [PUBLIC_INDEX]: indexDocument(
        PUBLIC_INDEX,
        [SOLID.TypeIndex],
        ["https://alice.example/journal/"],
      ),
    });
    await expect(
      ensureTypeIndex("public", WEBID, near, storageFetch, answeringAnyone(401), share),
    ).resolves.toEqual({ url: PUBLIC_INDEX, fetch: expect.any(Function) });
    expect(vi.mocked(writeDocument).mock.calls.map(([url]) => url)).toEqual([PROFILE_DOC]);
    expect(share).not.toHaveBeenCalled();
  });

  it("of a kind, creates nothing when the one linked may work when tried again", async () => {
    // The linked index answers 503; an index the app could adopt is at the conventional path.
    const linked = "https://alice.example/elsewhere/publicTypeIndex.ttl";
    const failure = Object.assign(new Error("503"), { statusCode: 503 });
    vi.mocked(readDocument).mockImplementation((async (url: string) => {
      if (url === WEBID)
        return readOf(
          profileDataset((t) =>
            t.addIri(PIM.storage, "https://alice.example/").addIri(SOLID.publicTypeIndex, linked),
          ),
        );
      if (url === PUBLIC_INDEX) return readOf(indexDocument(PUBLIC_INDEX, [SOLID.TypeIndex]));
      throw failure;
    }) as never);
    await expect(
      ensureTypeIndex("public", WEBID, near, storageFetch, answeringAnyone(401), share),
    ).rejects.toBe(failure);
    expect(writeDocument).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });

  it("creates the user's own index when the profile's is outside its own places", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t
          .addIri(PIM.storage, "https://alice.example/")
          .addIri(SOLID.privateTypeIndex, "https://elsewhere.example/privateTypeIndex.ttl"),
      ),
    });
    await expect(
      ensureTypeIndex("private", WEBID, near, storageFetch, answeringAnyone(401), share),
    ).resolves.toEqual({ url: PRIVATE_INDEX, fetch: expect.any(Function) });
    expect(vi.mocked(writeDocument).mock.calls.map(([url]) => url)).toContain(PRIVATE_INDEX);
  });

  describe("by its address", () => {
    const entered = "https://alice.example/old/index.ttl";
    /** Alice's profile, naming her storage. */
    const ownProfile = () => profileDataset((t) => t.addIri(PIM.storage, "https://alice.example/"));

    it("registers in one the profile links as it is, reading nothing of it", async () => {
      mockDatasets({
        [WEBID]: profileDataset((t) => t.addIri(SOLID.publicTypeIndex, PUBLIC_INDEX)),
      });
      await expect(
        ensureTypeIndex({ indexUrl: PUBLIC_INDEX }, WEBID, near, noFetch, noFetch, share),
      ).resolves.toEqual({ url: PUBLIC_INDEX, fetch: expect.any(Function) });
      expect(documentsRead()).toEqual(new Set([WEBID]));
      expect(writeDocument).not.toHaveBeenCalled();
    });

    it.each([
      ["a private one, when it says it is", [SOLID.TypeIndex, SOLID.UnlistedDocument], "private"],
      ["a private one, when it says neither", [SOLID.TypeIndex], "private"],
      ["a public one, when it says it is", [SOLID.TypeIndex, SOLID.ListedDocument], "public"],
    ])("links one of the user's from the profile as %s", async (_, types, kind) => {
      mockDatasets({ [WEBID]: ownProfile(), [entered]: indexDocument(entered, types) });
      await expect(
        ensureTypeIndex({ indexUrl: entered }, WEBID, near, noFetch, noFetch, share),
      ).resolves.toEqual({ url: entered, fetch: expect.any(Function) });
      const [url, saved] = vi.mocked(writeDocument).mock.calls[0];
      expect(url).toBe(PROFILE_DOC);
      const predicate = kind === "public" ? SOLID.publicTypeIndex : SOLID.privateTypeIndex;
      expect(getUrl(getThing(saved as Dataset, WEBID)!, predicate)).toBe(entered);
      expect(share).not.toHaveBeenCalled();
    });

    it("refuses one outside the profile's own places, reading nothing of it", async () => {
      const elsewhere = "https://elsewhere.example/index.ttl";
      mockDatasets({ [WEBID]: ownProfile() });
      await expect(
        ensureTypeIndex({ indexUrl: elsewhere }, WEBID, near, noFetch, noFetch, share),
      ).rejects.toMatchObject({ code: "typeIndexOutsidePod" });
      expect(documentsRead()).toEqual(new Set([WEBID]));
      expect(writeDocument).not.toHaveBeenCalled();
    });

    describe("on a server that keeps many users' pods on one origin", () => {
      const webId = "https://host.example/alice/profile/card#me";
      const profileDoc = "https://host.example/alice/profile/card";
      /** A server that shows https://host.example/alice/ as a storage's root. */
      const server = vi.fn(async (input: RequestInfo | URL) =>
        String(input) === "https://host.example/alice/"
          ? new Response(null, {
              headers: { Link: '<http://www.w3.org/ns/pim/space#Storage>; rel="type"' },
            })
          : new Response(null),
      ) as unknown as typeof globalThis.fetch;
      const hostProfile = (build: (thing: SubjectBuilder) => SubjectBuilder = (t) => t) =>
        setThing(datasetFrom(profileDoc), build(buildThing(createThing({ url: webId }))).build());
      const prefs = "https://host.example/alice/settings/prefs.ttl";
      const ownIndex = "https://host.example/alice/settings/privateTypeIndex.ttl";
      const theirIndex = "https://host.example/bob/idx.ttl";

      /**
       * Alice's pod, her own index empty, and Bob's index, holding an
       * instance, linked from the WebID document or her preferences file.
       */
      function linkedToTheirs(from: "profile" | "preferences") {
        mockDatasets({
          [webId]: hostProfile((t) =>
            from === "profile"
              ? t
                  .addIri(SOLID.privateTypeIndex, ownIndex)
                  .addIri(SOLID.privateTypeIndex, theirIndex)
              : t.addIri(SOLID.privateTypeIndex, ownIndex).addIri(PIM.preferencesFile, prefs),
          ),
          [prefs]: setThing(
            datasetFrom(prefs),
            buildThing(createThing({ url: webId }))
              .addIri(SOLID.privateTypeIndex, theirIndex)
              .build(),
          ),
          [ownIndex]: indexDocument(ownIndex, [SOLID.TypeIndex, SOLID.UnlistedDocument]),
          [theirIndex]: indexDocument(
            theirIndex,
            [SOLID.TypeIndex, SOLID.UnlistedDocument],
            ["https://host.example/bob/planted/"],
          ),
        });
      }

      describe.each([
        ["the WebID document", "profile"],
        ["the preferences file", "preferences"],
      ] as const)("with another user's index linked from %s", (_, from) => {
        it("leaves it out of the links", async () => {
          linkedToTheirs(from);
          const { links } = await locateTypeIndexes(webId, server, noFetch);
          expect(links.map((link) => link.url)).toEqual([ownIndex]);
        });

        it("of a kind, registers in the user's own, never reading theirs", async () => {
          linkedToTheirs(from);
          await expect(
            ensureTypeIndex("private", webId, near, server, answeringAnyone(401), share),
          ).resolves.toEqual({ url: ownIndex, fetch: expect.any(Function) });
          expect(documentsRead()).not.toContain(theirIndex);
          expect(writeDocument).not.toHaveBeenCalled();
        });

        it("by its address, refuses it, reading nothing of it and changing no profile", async () => {
          linkedToTheirs(from);
          await expect(
            ensureTypeIndex({ indexUrl: theirIndex }, webId, near, server, noFetch, share),
          ).rejects.toMatchObject({ code: "typeIndexOutsidePod" });
          expect(documentsRead()).not.toContain(theirIndex);
          expect(writeDocument).not.toHaveBeenCalled();
        });
      });

      describe("when the user's storages cannot be found", () => {
        /** A server that shows no storage. */
        const bare = vi.fn(async () => new Response(null)) as unknown as typeof globalThis.fetch;
        /** The WebID document read once, then failing, as a storage lookup reading it again would. */
        function profileReadOnce() {
          let reads = 0;
          vi.mocked(readDocument).mockImplementation((async (url: string) => {
            if (url === webId && reads++ === 0) {
              return readOf(hostProfile((t) => t.addIri(SOLID.privateTypeIndex, ownIndex)));
            }
            throw Object.assign(new Error(`503 ${url}`), { statusCode: 503 });
          }) as never);
        }

        it("keeps the links in the profile's own places when the WebID leads to none, writing only in its own pod", async () => {
          linkedToTheirs("profile");
          const { links, inOwnStorage } = await locateTypeIndexes(webId, bare, noFetch);
          expect(links.map((link) => link.url)).toEqual([ownIndex, theirIndex]);
          expect(inOwnStorage(ownIndex)).toBe(true);
          expect(inOwnStorage(theirIndex)).toBe(false);
        });

        it("takes the WebID document's folder as its own pod when it is no profile/ folder", async () => {
          const rootWebId = "https://host.example/alice/card#me";
          mockDatasets({
            [rootWebId]: setThing(
              datasetFrom("https://host.example/alice/card"),
              buildThing(createThing({ url: rootWebId })).build(),
            ),
          });
          const { inOwnStorage } = await locateTypeIndexes(rootWebId, bare, noFetch);
          expect(inOwnStorage(ownIndex)).toBe(true);
          expect(inOwnStorage(theirIndex)).toBe(false);
        });

        it.each([
          ["at the origin's root", "https://host.example/card#me"],
          ["in the origin's profile/ folder", "https://host.example/profile/card#me"],
        ])("writes in none when the WebID document is %s", async (_, rootWebId) => {
          mockDatasets({
            [rootWebId]: setThing(
              datasetFrom(rootWebId.split("#")[0]!),
              buildThing(createThing({ url: rootWebId })).build(),
            ),
          });
          const { inOwnStorage } = await locateTypeIndexes(rootWebId, bare, noFetch);
          expect(inOwnStorage(theirIndex)).toBe(false);
          expect(inOwnStorage("https://host.example/settings/privateTypeIndex.ttl")).toBe(false);
        });

        it("writes in a storage at the origin's root that the server shows", async () => {
          const rootWebId = "https://solo.example/profile/card#me";
          mockDatasets({
            [rootWebId]: setThing(
              datasetFrom("https://solo.example/profile/card"),
              buildThing(createThing({ url: rootWebId })).build(),
            ),
          });
          const solo = vi.fn(async (input: RequestInfo | URL) =>
            String(input) === "https://solo.example/"
              ? new Response(null, {
                  headers: { Link: '<http://www.w3.org/ns/pim/space#Storage>; rel="type"' },
                })
              : new Response(null),
          ) as unknown as typeof globalThis.fetch;
          const { inOwnStorage } = await locateTypeIndexes(rootWebId, solo, noFetch);
          expect(inOwnStorage("https://solo.example/settings/privateTypeIndex.ttl")).toBe(true);
          expect(inOwnStorage("https://other.example/settings/privateTypeIndex.ttl")).toBe(false);
        });

        it("reads more of the profile, when the lookup fails now, in the storages the WebID document names", async () => {
          const extended = "https://host.example/alice/more.ttl";
          let reads = 0;
          vi.mocked(readDocument).mockImplementation((async (url: string) => {
            if (url === webId && reads++ === 0) {
              return readOf(
                hostProfile((t) =>
                  t
                    .addIri(PIM.storage, "https://host.example/bob/../alice/")
                    .addIri(RDFS.seeAlso, extended),
                ),
              );
            }
            if (url === extended) {
              return readOf(
                setThing(
                  datasetFrom(extended),
                  buildThing(createThing({ url: webId }))
                    .addIri(SOLID.privateTypeIndex, ownIndex)
                    .build(),
                ),
              );
            }
            throw Object.assign(new Error(`503 ${url}`), { statusCode: 503 });
          }) as never);
          const { links } = await locateTypeIndexes(webId, bare, noFetch);
          expect(links.map((link) => link.url)).toEqual([ownIndex]);
          expect(documentsRead()).toContain(extended);
        });

        it("keeps them when the lookup fails now, to list what is there, writing in none", async () => {
          profileReadOnce();
          const { links, inOwnStorage } = await locateTypeIndexes(webId, bare, noFetch);
          expect(links.map((link) => link.url)).toEqual([ownIndex]);
          expect(inOwnStorage(ownIndex)).toBe(false);
        });

        it("fails them for writing when the lookup fails now", async () => {
          profileReadOnce();
          await expect(
            locateTypeIndexes(webId, bare, noFetch, { forWriting: true }),
          ).rejects.toMatchObject({ statusCode: 503 });
        });

        describe.each([
          ["the WebID document", "profile"],
          ["the preferences file", "preferences"],
        ] as const)("with another user's index linked from %s", (_, from) => {
          it("of a kind, registers in the user's own, never reading theirs", async () => {
            linkedToTheirs(from);
            await expect(
              ensureTypeIndex("private", webId, near, bare, answeringAnyone(401), share),
            ).resolves.toEqual({ url: ownIndex, fetch: expect.any(Function) });
            expect(documentsRead()).not.toContain(theirIndex);
            expect(writeDocument).not.toHaveBeenCalled();
          });

          it("by its address, refuses it, reading nothing of it and changing no profile", async () => {
            linkedToTheirs(from);
            await expect(
              ensureTypeIndex({ indexUrl: theirIndex }, webId, near, bare, noFetch, share),
            ).rejects.toMatchObject({ code: "typeIndexOutsidePod" });
            expect(documentsRead()).not.toContain(theirIndex);
            expect(writeDocument).not.toHaveBeenCalled();
          });

          it("by its address, registers in the user's own linked one as it is", async () => {
            linkedToTheirs(from);
            await expect(
              ensureTypeIndex({ indexUrl: ownIndex }, webId, near, bare, noFetch, share),
            ).resolves.toEqual({ url: ownIndex, fetch: expect.any(Function) });
            expect(documentsRead()).not.toContain(ownIndex);
            expect(writeDocument).not.toHaveBeenCalled();
          });
        });

        it("chooses no index to register in when the lookup fails now", async () => {
          profileReadOnce();
          await expect(
            ensureTypeIndex("private", webId, near, bare, noFetch, share),
          ).rejects.toMatchObject({ statusCode: 503 });
          expect(writeDocument).not.toHaveBeenCalled();
        });
      });

      it("reads no preferences file in another user's pod", async () => {
        const theirPrefs = "https://host.example/bob/prefs.ttl";
        mockDatasets({
          [webId]: hostProfile((t) => t.addIri(PIM.preferencesFile, theirPrefs)),
          [theirPrefs]: setThing(
            datasetFrom(theirPrefs),
            buildThing(createThing({ url: webId }))
              .addIri(SOLID.privateTypeIndex, ownIndex)
              .build(),
          ),
        });
        await expect(locateTypeIndexes(webId, server, noFetch)).resolves.toMatchObject({
          links: [],
        });
        expect(documentsRead()).not.toContain(theirPrefs);
      });

      it("links no index from an extended profile in another user's pod", async () => {
        const theirProfile = "https://host.example/bob/profile";
        mockDatasets({
          [webId]: hostProfile((t) => t.addIri(RDFS.seeAlso, theirProfile)),
          [theirProfile]: setThing(
            datasetFrom(theirProfile),
            buildThing(createThing({ url: webId })).build(),
          ),
        });
        vi.mocked(writeDocument).mockImplementation((async (url: string, dataset: Dataset) => {
          if (url === profileDoc) throw new Error(`Storing the Resource at [${url}] failed: [405]`);
          return writtenAsGiven(url, dataset);
        }) as never);
        await expect(createTypeIndex("private", webId, near, server)).rejects.toMatchObject({
          code: "privateTypeIndexNotLinked",
        });
        expect(vi.mocked(writeDocument).mock.calls.map(([url]) => url)).not.toContain(theirProfile);
      });

      it("refuses one in another user's pod, reading nothing of it and changing no profile", async () => {
        const theirs = "https://host.example/bob/settings/idx.ttl";
        mockDatasets({
          [webId]: hostProfile(),
          [theirs]: indexDocument(theirs, [SOLID.TypeIndex, SOLID.UnlistedDocument]),
        });
        await expect(
          ensureTypeIndex({ indexUrl: theirs }, webId, near, server, noFetch, share),
        ).rejects.toMatchObject({ code: "typeIndexOutsidePod" });
        expect(vi.mocked(readDocument).mock.calls.map(([url]) => url)).not.toContain(theirs);
        expect(writeDocument).not.toHaveBeenCalled();
      });

      it("links one in the user's own pod from the profile", async () => {
        const own = "https://host.example/alice/settings/idx.ttl";
        mockDatasets({
          [webId]: hostProfile(),
          [own]: indexDocument(own, [SOLID.TypeIndex, SOLID.UnlistedDocument]),
        });
        await expect(
          ensureTypeIndex({ indexUrl: own }, webId, near, server, noFetch, share),
        ).resolves.toEqual({ url: own, fetch: expect.any(Function) });
        const [url, saved] = vi.mocked(writeDocument).mock.calls[0];
        expect(url).toBe(profileDoc);
        expect(getUrl(getThing(saved as Dataset, webId)!, SOLID.privateTypeIndex)).toBe(own);
      });
    });

    it("refuses a document that does not say it is a type index", async () => {
      mockDatasets({
        [WEBID]: ownProfile(),
        [entered]: indexDocument(entered, [SOLID.ListedDocument]),
      });
      await expect(
        ensureTypeIndex({ indexUrl: entered }, WEBID, near, noFetch, noFetch, share),
      ).rejects.toMatchObject({ code: "notATypeIndex" });
      expect(writeDocument).not.toHaveBeenCalled();
    });

    it.each([
      ["not there (404)", Object.assign(new Error("404"), { statusCode: 404 })],
      ["refused (401)", Object.assign(new Error("401"), { statusCode: 401 })],
      ["forbidden (403)", Object.assign(new Error("403"), { statusCode: 403 })],
    ])("refuses one that is %s", async (_, failure) => {
      vi.mocked(readDocument).mockImplementation(async (url) => {
        if (url === entered) throw failure;
        return readOf(ownProfile());
      });
      await expect(
        ensureTypeIndex({ indexUrl: entered }, WEBID, near, noFetch, noFetch, share),
      ).rejects.toMatchObject({ code: "notATypeIndex" });
    });

    it("fails as the read did when it may work when tried again", async () => {
      const failure = Object.assign(new Error("503"), { statusCode: 503 });
      vi.mocked(readDocument).mockImplementation(async (url) => {
        if (url === entered) throw failure;
        return readOf(ownProfile());
      });
      await expect(
        ensureTypeIndex({ indexUrl: entered }, WEBID, near, noFetch, noFetch, share),
      ).rejects.toBe(failure);
    });
  });
});

describe("readInstanceRegistrations", () => {
  it("collects sm:Instance registrations, accepting both container and instance predicates", async () => {
    let dataset = datasetFrom(PRIVATE_INDEX);
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${PRIVATE_INDEX}#a` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .addIri(SOLID.forClass, SM.Instance)
        .addIri(SOLID.instanceContainer, "https://alice.example/solid-memo/a/")
        .addStringNoLocale(DCTERMS.title, "Deck set A")
        .build(),
    );
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${PRIVATE_INDEX}#b` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .addIri(SOLID.forClass, SM.Instance)
        .addIri(SOLID.instance, "https://alice.example/solid-memo/b/")
        .build(),
    );
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${PRIVATE_INDEX}#other` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .addIri(SOLID.forClass, "https://schema.org/Recipe")
        .addIri(SOLID.instanceContainer, "https://alice.example/recipes/")
        .build(),
    );
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${PRIVATE_INDEX}#stray` }))
        .addIri(RDF.type, SOLID.TypeIndex)
        .build(),
    );
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${PRIVATE_INDEX}#empty` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .addIri(SOLID.forClass, SM.Instance)
        .build(),
    );
    mockDatasets({ [PRIVATE_INDEX]: dataset });

    await expect(readInstanceRegistrations(PRIVATE_INDEX, noFetch)).resolves.toEqual([
      {
        containerUrl: "https://alice.example/solid-memo/a/",
        title: "Deck set A",
      },
      { containerUrl: "https://alice.example/solid-memo/b/", title: null },
    ]);
  });

  it("leaves out a registration whose address a request would send elsewhere", async () => {
    const at = (id: string, url: string) =>
      registered(id, SM.Instance, SOLID.instanceContainer, url);
    mockDatasets({
      [PRIVATE_INDEX]: privateIndex(
        at("ok", "https://alice.example/solid-memo/a/"),
        at("dots", "https://alice.example/solid-memo/../"),
        at("encoded", "https://alice.example/solid-memo/%2e%2e/"),
        at("case", "https://Alice.example/solid-memo/a/"),
        at("port", "https://alice.example:443/solid-memo/a/"),
        at("query", "https://alice.example/solid-memo/a/?x"),
        at("swedish", "https://alice.example/kortlekar-å/"),
        at("scheme", "urn:x:solid-memo"),
      ),
    });
    await expect(readInstanceRegistrations(PRIVATE_INDEX, noFetch)).resolves.toEqual([
      { containerUrl: "https://alice.example/solid-memo/a/", title: null },
      // Another spelling of a folder is that folder, kept as written.
      { containerUrl: "https://Alice.example/solid-memo/a/", title: null },
      { containerUrl: "https://alice.example:443/solid-memo/a/", title: null },
      { containerUrl: "https://alice.example/kortlekar-å/", title: null },
    ]);
  });
});

/** A registration in the private index, of one class, naming `url` under `predicate`. */
function registered(id: string, forClass: string, predicate: string, url: string) {
  return buildThing(createThing({ url: `${PRIVATE_INDEX}#${id}` }))
    .addIri(RDF.type, SOLID.TypeRegistration)
    .addIri(SOLID.forClass, forClass)
    .addIri(predicate, url)
    .build();
}

/** The private index holding these things. */
function privateIndex(...things: NamedSubject[]): Dataset {
  return things.reduce<Dataset>(
    (dataset, thing) => setThing(dataset, thing),
    datasetFrom(PRIVATE_INDEX),
  );
}

const preconditionFailed = () =>
  Object.assign(new Error("412 Precondition Failed"), { statusCode: 412 });

describe("addInstanceRegistration", () => {
  const MAIN = "https://alice.example/solid-memo/main/";
  const ids = () => {
    let next = 0;
    return () => `id${++next}`;
  };
  const main = { instanceUrl: "https://alice.example/solid-memo/main", title: "Main" };

  it("registers the instance alone, titled, naming its container, in one save", async () => {
    mockDatasets({ [PRIVATE_INDEX]: privateIndex() });
    await addInstanceRegistration(PRIVATE_INDEX, main, ids(), noFetch);
    expect(writeDocument).toHaveBeenCalledOnce();
    const [saveUrl, saved] = vi.mocked(writeDocument).mock.calls[0];
    expect(saveUrl).toBe(PRIVATE_INDEX);
    const registrations = getThingAll(saved as Dataset).map((thing) => ({
      url: thing.url,
      types: getUrlAll(thing, RDF.type),
      forClass: getUrlAll(thing, SOLID.forClass),
      instance: getUrlAll(thing, SOLID.instance),
      instanceContainer: getUrlAll(thing, SOLID.instanceContainer),
      title: getStringNoLocale(thing, DCTERMS.title),
    }));
    // No registration of the catalog, decks, cards, review states, answers or drafts.
    expect(registrations).toEqual([
      {
        url: `${PRIVATE_INDEX}#sm-inst-id1`,
        types: [SOLID.TypeRegistration],
        forClass: [SM.Instance],
        instance: [],
        instanceContainer: [MAIN],
        title: "Main",
      },
    ]);
  });

  it("saves nothing when the index registers the instance already, its container with or without the slash", async () => {
    for (const [predicate, url] of [
      [SOLID.instanceContainer, MAIN],
      [SOLID.instance, "https://alice.example/solid-memo/main"],
    ]) {
      mockDatasets({
        [PRIVATE_INDEX]: privateIndex(registered("inst", SM.Instance, predicate, url)),
      });
      await addInstanceRegistration(PRIVATE_INDEX, main, ids(), noFetch);
      await addInstanceRegistration(PRIVATE_INDEX, { ...main, instanceUrl: MAIN }, ids(), noFetch);
    }
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("adds it beside other registrations of the folder that are not the instance's", async () => {
    mockDatasets({
      [PRIVATE_INDEX]: privateIndex(
        // An earlier version's registration of the cards, and another class naming the container.
        registered("card", SM.Card, SOLID.instanceContainer, `${MAIN}decks/`),
        registered("recipes", "https://schema.org/Recipe", SOLID.instanceContainer, MAIN),
      ),
    });
    await addInstanceRegistration(PRIVATE_INDEX, main, ids(), noFetch);
    const saved = vi.mocked(writeDocument).mock.calls[0][1] as Dataset;
    expect(getThingAll(saved).map((thing) => thing.url)).toEqual([
      `${PRIVATE_INDEX}#card`,
      `${PRIVATE_INDEX}#recipes`,
      `${PRIVATE_INDEX}#sm-inst-id1`,
    ]);
  });

  it("reads the index again when it changed meanwhile, and adds nothing when the instance is registered by then", async () => {
    let reads = 0;
    vi.mocked(readDocument).mockImplementation((async () =>
      readOf(
        // Meanwhile another tab registered the notes, then the instance.
        ++reads === 1
          ? privateIndex()
          : reads === 2
            ? privateIndex(
                registered(
                  "notes",
                  "https://schema.org/Note",
                  SOLID.instanceContainer,
                  "https://alice.example/notes/",
                ),
              )
            : privateIndex(registered("theirs", SM.Instance, SOLID.instanceContainer, MAIN)),
      )) as never);
    vi.mocked(writeDocument).mockRejectedValueOnce(preconditionFailed());
    const newId = ids();
    await addInstanceRegistration(PRIVATE_INDEX, main, newId, noFetch);
    expect(writeDocument).toHaveBeenCalledTimes(2);
    const saved = vi.mocked(writeDocument).mock.calls[1][1] as Dataset;
    expect(getThingAll(saved).map((thing) => thing.url)).toEqual([
      `${PRIVATE_INDEX}#notes`,
      `${PRIVATE_INDEX}#sm-inst-id2`,
    ]);

    vi.mocked(writeDocument).mockClear();
    await addInstanceRegistration(PRIVATE_INDEX, main, newId, noFetch);
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("gives up after three attempts, and rethrows any other failure at once", async () => {
    mockDatasets({ [PRIVATE_INDEX]: privateIndex() });
    vi.mocked(writeDocument).mockRejectedValue(preconditionFailed());
    await expect(
      addInstanceRegistration(PRIVATE_INDEX, main, ids(), noFetch),
    ).rejects.toMatchObject({ code: "changedElsewhere" });
    expect(writeDocument).toHaveBeenCalledTimes(3);

    vi.mocked(writeDocument).mockReset();
    vi.mocked(writeDocument).mockRejectedValue(new Error("403 Forbidden"));
    await expect(addInstanceRegistration(PRIVATE_INDEX, main, ids(), noFetch)).rejects.toThrow(
      "403 Forbidden",
    );
    expect(writeDocument).toHaveBeenCalledOnce();
  });
});

describe("removeInstanceRegistrations", () => {
  function registration(id: string, predicate: string, containerUrl: string) {
    return buildThing(createThing({ url: `${PRIVATE_INDEX}#${id}` }))
      .addIri(RDF.type, SOLID.TypeRegistration)
      .addIri(SOLID.forClass, SM.Instance)
      .addIri(predicate, containerUrl)
      .build();
  }

  it("removes every registration of the container under either predicate, and its catalog's by exact IRI", async () => {
    let dataset = datasetFrom(PRIVATE_INDEX);
    dataset = setThing(
      dataset,
      registration("a", SOLID.instanceContainer, "https://alice.example/solid-memo/a/"),
    );
    dataset = setThing(
      dataset,
      registration("a2", SOLID.instance, "https://alice.example/solid-memo/a"),
    );
    dataset = setThing(
      dataset,
      registration("b", SOLID.instanceContainer, "https://alice.example/solid-memo/b/"),
    );
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${PRIVATE_INDEX}#other` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .addIri(SOLID.forClass, "https://schema.org/Recipe")
        .addIri(SOLID.instanceContainer, "https://alice.example/solid-memo/a/")
        .build(),
    );
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${PRIVATE_INDEX}#cat-a` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .addIri(SOLID.forClass, DCAT.Catalog)
        .addIri(SOLID.instance, "https://alice.example/solid-memo/a/catalog.ttl#catalog")
        .build(),
    );
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${PRIVATE_INDEX}#cat-b` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .addIri(SOLID.forClass, DCAT.Catalog)
        .addIri(SOLID.instance, "https://alice.example/solid-memo/b/catalog.ttl#catalog")
        .build(),
    );
    // Another app's catalogs in the instance's folder: not the instance's.
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${PRIVATE_INDEX}#cat-elsewhere` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .addIri(SOLID.forClass, DCAT.Catalog)
        .addIri(SOLID.instance, "https://alice.example/solid-memo/a/attachments/index.ttl#catalog")
        .build(),
    );
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${PRIVATE_INDEX}#cat-shared` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .addIri(SOLID.forClass, DCAT.Catalog)
        .addIri(SOLID.instance, "https://alice.example/solid-memo/a/catalog.ttl#catalog")
        .addIri(SOLID.instance, "https://alice.example/recipes/index.ttl#catalog")
        .build(),
    );
    // An instance registration that names another container besides, under both spellings of this one.
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${PRIVATE_INDEX}#inst-shared` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .addIri(SOLID.forClass, SM.Instance)
        .addIri(SOLID.instanceContainer, "https://alice.example/notes/")
        .addIri(SOLID.instance, "https://alice.example/solid-memo/a")
        .addIri(SOLID.instanceContainer, "https://alice.example/solid-memo/a/")
        .build(),
    );
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: PRIVATE_INDEX }))
        .addIri(RDF.type, SOLID.TypeIndex)
        .build(),
    );
    mockDatasets({ [PRIVATE_INDEX]: dataset });

    await removeInstanceRegistrations(PRIVATE_INDEX, "https://alice.example/solid-memo/a", noFetch);

    const [saveUrl, saved] = vi.mocked(writeDocument).mock.calls[0];
    expect(saveUrl).toBe(PRIVATE_INDEX);
    const remaining = getThingAll(saved as Dataset).map((t) => t.url);
    expect(remaining).toEqual([
      `${PRIVATE_INDEX}#b`,
      `${PRIVATE_INDEX}#other`,
      `${PRIVATE_INDEX}#cat-b`,
      `${PRIVATE_INDEX}#cat-elsewhere`,
      `${PRIVATE_INDEX}#cat-shared`,
      `${PRIVATE_INDEX}#inst-shared`,
      PRIVATE_INDEX,
    ]);
    const instShared = getThing(saved as Dataset, `${PRIVATE_INDEX}#inst-shared`)!;
    expect(getUrlAll(instShared, SOLID.instanceContainer)).toEqual([
      "https://alice.example/notes/",
    ]);
    expect(getUrlAll(instShared, SOLID.instance)).toEqual([]);
    // A registration of another catalog besides keeps that one only.
    expect(
      getUrlAll(getThing(saved as Dataset, `${PRIVATE_INDEX}#cat-shared`)!, SOLID.instance),
    ).toEqual(["https://alice.example/recipes/index.ttl#catalog"]);
  });

  it("removes the registration earlier versions wrote of each class of the instance's data by exact IRI, never another app's below the folder", async () => {
    const MAIN = "https://alice.example/solid-memo/a/";
    mockDatasets({
      [PRIVATE_INDEX]: privateIndex(
        registered("cat", DCAT.Catalog, SOLID.instance, `${MAIN}catalog.ttl#catalog`),
        registered("deck", SM.Deck, SOLID.instance, `${MAIN}catalog.ttl`),
        registered("draft", SM.Deck, SOLID.instanceContainer, `${MAIN}drafts/`),
        registered("card", SM.Card, SOLID.instanceContainer, `${MAIN}decks/`),
        registered("review", SM.ReviewState, SOLID.instanceContainer, `${MAIN}reviews/`),
        // Under the other predicate: still the instance's answers' container.
        registered("answer", SM.Answer, SOLID.instance, `${MAIN}history/`),
        // Another app's, below the folder, and another instance's.
        registered("their-cards", SM.Card, SOLID.instanceContainer, `${MAIN}decks/theirs/`),
        registered("their-decks", SM.Deck, SOLID.instance, `${MAIN}attachments/decks.ttl`),
        registered(
          "other-reviews",
          SM.ReviewState,
          SOLID.instanceContainer,
          "https://alice.example/solid-memo/b/reviews/",
        ),
        // A class that is not the one the resource is registered for.
        registered("wrong-class", SM.Answer, SOLID.instanceContainer, `${MAIN}reviews/`),
        buildThing(registered("shared", SM.Card, SOLID.instanceContainer, `${MAIN}decks/`))
          .addIri(SOLID.instanceContainer, "https://alice.example/flashcards/")
          .build(),
      ),
    });

    await removeInstanceRegistrations(PRIVATE_INDEX, MAIN, noFetch);

    const saved = vi.mocked(writeDocument).mock.calls[0][1] as Dataset;
    expect(getThingAll(saved).map((thing) => thing.url)).toEqual([
      `${PRIVATE_INDEX}#their-cards`,
      `${PRIVATE_INDEX}#their-decks`,
      `${PRIVATE_INDEX}#other-reviews`,
      `${PRIVATE_INDEX}#wrong-class`,
      `${PRIVATE_INDEX}#shared`,
    ]);
    expect(getUrlAll(getThing(saved, `${PRIVATE_INDEX}#shared`)!, SOLID.instanceContainer)).toEqual(
      ["https://alice.example/flashcards/"],
    );
  });

  it("reads the index again and removes what is still there when it changed meanwhile", async () => {
    const MAIN = "https://alice.example/solid-memo/a/";
    let reads = 0;
    vi.mocked(readDocument).mockImplementation((async () =>
      readOf(
        privateIndex(
          registered("inst", SM.Instance, SOLID.instanceContainer, MAIN),
          // Meanwhile another app registered its notes.
          ...(++reads === 1
            ? []
            : [
                registered(
                  "notes",
                  "https://schema.org/NoteDigitalDocument",
                  SOLID.instanceContainer,
                  "https://alice.example/notes/",
                ),
              ]),
        ),
      )) as never);
    vi.mocked(writeDocument).mockRejectedValueOnce(preconditionFailed());

    await removeInstanceRegistrations(PRIVATE_INDEX, MAIN, noFetch);

    expect(writeDocument).toHaveBeenCalledTimes(2);
    const saved = vi.mocked(writeDocument).mock.calls[1][1] as Dataset;
    expect(getThingAll(saved).map((thing) => thing.url)).toEqual([`${PRIVATE_INDEX}#notes`]);
  });

  it("does not save when nothing matched", async () => {
    mockDatasets({
      [PRIVATE_INDEX]: setThing(
        datasetFrom(PRIVATE_INDEX),
        registration("b", SOLID.instanceContainer, "https://alice.example/solid-memo/b/"),
      ),
    });

    await removeInstanceRegistrations(
      PRIVATE_INDEX,
      "https://alice.example/solid-memo/a/",
      noFetch,
    );

    expect(writeDocument).not.toHaveBeenCalled();
  });
});

describe("readOldRegistrations and removeOldRegistrations", () => {
  const MAIN = "https://alice.example/solid-memo/a/";
  /** One registration of each class's data earlier versions wrote for the instance, as they named them. */
  const ours = () => [
    registered("sm-cat-1", DCAT.Catalog, SOLID.instance, `${MAIN}catalog.ttl#catalog`),
    registered("sm-deck-1", SM.Deck, SOLID.instance, `${MAIN}catalog.ttl`),
    registered("sm-card-1", SM.Card, SOLID.instanceContainer, `${MAIN}decks/`),
    registered("sm-review-1", SM.ReviewState, SOLID.instanceContainer, `${MAIN}reviews/`),
    registered("sm-answer-1", SM.Answer, SOLID.instanceContainer, `${MAIN}history/`),
    registered("sm-draft-1", SM.Deck, SOLID.instanceContainer, `${MAIN}drafts/`),
  ];
  const instance = () => registered("sm-inst-1", SM.Instance, SOLID.instanceContainer, MAIN);
  /** What is not the app's old registration of this instance's data, and is kept as it is. */
  const others = () => [
    // The same class and target, but not as the app named its own: maybe another app's.
    registered("cards", SM.Card, SOLID.instanceContainer, `${MAIN}decks/`),
    buildThing(createThing({ url: "https://alice.example/registrations/cards" }))
      .addIri(RDF.type, SOLID.TypeRegistration)
      .addIri(SOLID.forClass, SM.Card)
      .addIri(SOLID.instanceContainer, `${MAIN}decks/`)
      .build(),
    // The app's prefix, but on a subject of another document than the index.
    buildThing(createThing({ url: "https://alice.example/registrations#sm-card-3" }))
      .addIri(RDF.type, SOLID.TypeRegistration)
      .addIri(SOLID.forClass, SM.Card)
      .addIri(SOLID.instanceContainer, `${MAIN}decks/`)
      .build(),
    // The app's prefix, but another class's, another instance's, or no registration.
    registered("sm-card-2", SM.ReviewState, SOLID.instanceContainer, `${MAIN}reviews/`),
    registered("sm-deck-2", SM.Deck, SOLID.instanceContainer, `${MAIN}drafts/`),
    registered(
      "sm-review-2",
      SM.ReviewState,
      SOLID.instanceContainer,
      "https://alice.example/solid-memo/b/reviews/",
    ),
    buildThing(createThing({ url: `${PRIVATE_INDEX}#sm-answer-2` }))
      .addIri(SOLID.forClass, SM.Answer)
      .addIri(SOLID.instanceContainer, `${MAIN}history/`)
      .build(),
    // A prefix with no dash after it.
    registered("sm-cards", SM.Card, SOLID.instanceContainer, `${MAIN}decks/`),
  ];

  it("finds each class's old registration of the instance's data in order, and only by the app's own names", async () => {
    mockDatasets({ [PRIVATE_INDEX]: privateIndex(instance(), ...ours().reverse(), ...others()) });
    expect(
      await readOldRegistrations(PRIVATE_INDEX, "https://alice.example/solid-memo/a", noFetch),
    ).toEqual(["catalog", "deck", "card", "reviewState", "answer", "draft"]);

    mockDatasets({ [PRIVATE_INDEX]: privateIndex(instance(), ...others()) });
    expect(await readOldRegistrations(PRIVATE_INDEX, MAIN, noFetch)).toEqual([]);
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("removes them in one save, and keeps the instance's registration and everything not surely the app's", async () => {
    mockDatasets({ [PRIVATE_INDEX]: privateIndex(instance(), ...ours(), ...others()) });

    await removeOldRegistrations(PRIVATE_INDEX, "https://alice.example/solid-memo/a", noFetch);

    expect(writeDocument).toHaveBeenCalledOnce();
    const [saveUrl, saved] = vi.mocked(writeDocument).mock.calls[0];
    expect(saveUrl).toBe(PRIVATE_INDEX);
    expect(getThingAll(saved as Dataset)).toEqual(
      getThingAll(privateIndex(instance(), ...others())),
    );
  });

  it("never touches an sm:Instance registration, even one named and registering as the app's old ones", async () => {
    const both = buildThing(
      registered("sm-card-1", SM.Card, SOLID.instanceContainer, `${MAIN}decks/`),
    )
      .addIri(SOLID.forClass, SM.Instance)
      .addIri(SOLID.instanceContainer, MAIN)
      .build();
    mockDatasets({ [PRIVATE_INDEX]: privateIndex(instance(), both) });

    expect(await readOldRegistrations(PRIVATE_INDEX, MAIN, noFetch)).toEqual([]);
    await removeOldRegistrations(PRIVATE_INDEX, MAIN, noFetch);

    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("of an old registration naming something else besides, removes only the link to the instance's data", async () => {
    const shared = buildThing(
      registered("sm-card-1", SM.Card, SOLID.instanceContainer, `${MAIN}decks/`),
    )
      .addIri(SOLID.instanceContainer, "https://alice.example/flashcards/")
      .build();
    mockDatasets({ [PRIVATE_INDEX]: privateIndex(instance(), shared) });

    await removeOldRegistrations(PRIVATE_INDEX, MAIN, noFetch);

    const saved = vi.mocked(writeDocument).mock.calls[0][1] as Dataset;
    expect(getThingAll(saved).map((thing) => thing.url)).toEqual([
      `${PRIVATE_INDEX}#sm-inst-1`,
      `${PRIVATE_INDEX}#sm-card-1`,
    ]);
    expect(
      getUrlAll(getThing(saved, `${PRIVATE_INDEX}#sm-card-1`)!, SOLID.instanceContainer),
    ).toEqual(["https://alice.example/flashcards/"]);
    expect(getUrlAll(getThing(saved, `${PRIVATE_INDEX}#sm-card-1`)!, SOLID.forClass)).toEqual([
      SM.Card,
    ]);
  });

  it("reads the index again and removes what is still there when it changed meanwhile", async () => {
    let reads = 0;
    vi.mocked(readDocument).mockImplementation((async () =>
      readOf(
        // Meanwhile another app registered its notes.
        ++reads === 1
          ? privateIndex(instance(), ...ours())
          : privateIndex(
              instance(),
              ...ours(),
              registered(
                "notes",
                "https://schema.org/NoteDigitalDocument",
                SOLID.instanceContainer,
                "https://alice.example/notes/",
              ),
            ),
      )) as never);
    vi.mocked(writeDocument).mockRejectedValueOnce(preconditionFailed());

    await removeOldRegistrations(PRIVATE_INDEX, MAIN, noFetch);

    expect(writeDocument).toHaveBeenCalledTimes(2);
    const saved = vi.mocked(writeDocument).mock.calls[1][1] as Dataset;
    expect(getThingAll(saved).map((thing) => thing.url)).toEqual([
      `${PRIVATE_INDEX}#sm-inst-1`,
      `${PRIVATE_INDEX}#notes`,
    ]);
  });

  it("saves nothing when the index holds none", async () => {
    mockDatasets({ [PRIVATE_INDEX]: privateIndex(instance(), ...others()) });

    await removeOldRegistrations(PRIVATE_INDEX, MAIN, noFetch);

    expect(writeDocument).not.toHaveBeenCalled();
  });
});

describe("renameInstanceRegistrations", () => {
  const MAIN = "https://alice.example/solid-memo/main/";
  const args = { containerUrl: MAIN, title: "Languages" };

  function registration(
    id: string,
    forClass: string,
    predicate: string,
    url: string,
    title = "Main",
  ) {
    return buildThing(createThing({ url: `${PRIVATE_INDEX}#${id}` }))
      .addIri(RDF.type, SOLID.TypeRegistration)
      .addIri(SOLID.forClass, forClass)
      .addIri(predicate, url)
      .addStringNoLocale(DCTERMS.title, title)
      .build();
  }

  function index(...things: NamedSubject[]): Dataset {
    return things.reduce((dataset, thing) => setThing(dataset, thing), datasetFrom(PRIVATE_INDEX));
  }

  const titleOf = (saved: Dataset, id: string) =>
    getStringNoLocale(getThing(saved, `${PRIVATE_INDEX}#${id}`)!, DCTERMS.title);

  it("renames the instance's registration and each one earlier versions wrote for its data, in one save, and no other", async () => {
    mockDatasets({
      [PRIVATE_INDEX]: index(
        registration("inst", SM.Instance, SOLID.instance, "https://alice.example/solid-memo/main"),
        registration("cat", DCAT.Catalog, SOLID.instance, `${MAIN}catalog.ttl#catalog`),
        registration("deck", SM.Deck, SOLID.instance, `${MAIN}catalog.ttl`),
        registration("card", SM.Card, SOLID.instanceContainer, `${MAIN}decks/`),
        registration("review", SM.ReviewState, SOLID.instanceContainer, `${MAIN}reviews/`),
        registration("answer", SM.Answer, SOLID.instanceContainer, `${MAIN}history/`),
        registration("draft", SM.Deck, SOLID.instanceContainer, `${MAIN}drafts/`),
        registration(
          "other",
          SM.Instance,
          SOLID.instanceContainer,
          "https://alice.example/solid-memo/b/",
        ),
        registration(
          "other-cat",
          DCAT.Catalog,
          SOLID.instance,
          "https://alice.example/solid-memo/b/catalog.ttl#catalog",
        ),
        buildThing(createThing({ url: `${PRIVATE_INDEX}#note` }))
          .addStringNoLocale(DCTERMS.title, "x")
          .build(),
      ),
    });
    await renameInstanceRegistrations(PRIVATE_INDEX, args, noFetch);
    expect(writeDocument).toHaveBeenCalledOnce();
    const saved = vi.mocked(writeDocument).mock.calls[0][1] as Dataset;
    expect(titleOf(saved, "inst")).toBe("Languages");
    expect(titleOf(saved, "cat")).toBe("Languages");
    expect(titleOf(saved, "deck")).toBe("Languages");
    expect(titleOf(saved, "card")).toBe("Languages");
    expect(titleOf(saved, "review")).toBe("Languages");
    expect(titleOf(saved, "answer")).toBe("Languages");
    expect(titleOf(saved, "draft")).toBe("Languages");
    expect(titleOf(saved, "other")).toBe("Main");
    expect(titleOf(saved, "other-cat")).toBe("Main");
    expect(titleOf(saved, "note")).toBe("x");
  });

  it("leaves the registrations of an instance kept inside this one", async () => {
    mockDatasets({
      [PRIVATE_INDEX]: index(
        registration("inst", SM.Instance, SOLID.instanceContainer, MAIN),
        registration("nested", SM.Instance, SOLID.instanceContainer, `${MAIN}archive/`),
        registration(
          "nested-cat",
          DCAT.Catalog,
          SOLID.instance,
          `${MAIN}archive/catalog.ttl#catalog`,
        ),
      ),
    });
    await renameInstanceRegistrations(PRIVATE_INDEX, args, noFetch);
    const saved = vi.mocked(writeDocument).mock.calls[0][1] as Dataset;
    expect(titleOf(saved, "inst")).toBe("Languages");
    expect(titleOf(saved, "nested")).toBe("Main");
    expect(titleOf(saved, "nested-cat")).toBe("Main");
  });

  it("saves nothing when the registrations already say so", async () => {
    mockDatasets({
      [PRIVATE_INDEX]: index(
        registration("inst", SM.Instance, SOLID.instanceContainer, MAIN, "Languages"),
      ),
    });
    await renameInstanceRegistrations(PRIVATE_INDEX, args, noFetch);
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("reads and renames again while the index changes elsewhere, three times in all", async () => {
    mockDatasets({
      [PRIVATE_INDEX]: index(registration("inst", SM.Instance, SOLID.instanceContainer, MAIN)),
    });
    const changed = Object.assign(new Error("412"), { statusCode: 412 });
    vi.mocked(writeDocument).mockRejectedValueOnce(changed);
    await renameInstanceRegistrations(PRIVATE_INDEX, args, noFetch);
    expect(writeDocument).toHaveBeenCalledTimes(2);

    vi.mocked(writeDocument).mockReset().mockRejectedValue(changed);
    await expect(renameInstanceRegistrations(PRIVATE_INDEX, args, noFetch)).rejects.toMatchObject({
      code: "changedElsewhere",
    });
    expect(writeDocument).toHaveBeenCalledTimes(3);
  });

  it("gives up at once on any other failure", async () => {
    mockDatasets({
      [PRIVATE_INDEX]: index(registration("inst", SM.Instance, SOLID.instanceContainer, MAIN)),
    });
    vi.mocked(writeDocument).mockRejectedValue(
      Object.assign(new Error("403"), { statusCode: 403 }),
    );
    await expect(renameInstanceRegistrations(PRIVATE_INDEX, args, noFetch)).rejects.toThrow("403");
    expect(writeDocument).toHaveBeenCalledOnce();
  });
});
