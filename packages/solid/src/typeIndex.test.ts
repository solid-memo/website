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
} from "./client/rdf";
import { readDocument, writeDocument } from "./client/resources";
import { datasetFrom, readOf, writtenAsGiven } from "./testing/datasets";
import {
  addRegistrations,
  createTypeIndex,
  ensureTypeIndex,
  locateTypeIndexes,
  readInstanceRegistrations,
  readRegisteredClasses,
  removeInstanceRegistrations,
  renameInstanceRegistrations,
} from "./typeIndex";
import { DCAT, DCTERMS, FOAF, PIM, RDF, RDFS, SM, SOLID } from "./vocab";

vi.mock("./client/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client/resources")>();
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

const noFetch = vi.fn() as unknown as typeof globalThis.fetch;

function profileDataset(build: (thing: SubjectBuilder) => SubjectBuilder = (t) => t): Dataset {
  return setThing(datasetFrom(PROFILE_DOC), build(buildThing(createThing({ url: WEBID }))).build());
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

describe("locateTypeIndexes", () => {
  it("finds both indexes linked directly from the profile", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX).addIri(SOLID.publicTypeIndex, PUBLIC_INDEX),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });
  });

  it("returns nulls when the profile has no WebID subject", async () => {
    mockDatasets({ [WEBID]: datasetFrom(PROFILE_DOC) });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      privateIndexUrl: null,
      publicIndexUrl: null,
    });
  });

  it("follows the preferences file to the private index", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(PIM.preferencesFile, PREFERENCES_FILE)),
      [PREFERENCES_FILE]: setThing(
        datasetFrom(PREFERENCES_FILE),
        buildThing(createThing({ url: WEBID }))
          .addIri(SOLID.privateTypeIndex, PRIVATE_INDEX)
          .build(),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: null,
    });
  });

  it("treats an unreadable preferences file as no private index", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(PIM.preferencesFile, PREFERENCES_FILE)),
    });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      privateIndexUrl: null,
      publicIndexUrl: null,
    });
  });

  it("treats a preferences file without the WebID subject as no private index", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(PIM.preferencesFile, PREFERENCES_FILE)),
      [PREFERENCES_FILE]: datasetFrom(PREFERENCES_FILE),
    });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      privateIndexUrl: null,
      publicIndexUrl: null,
    });
  });

  it("returns null private index when the profile links nothing", async () => {
    mockDatasets({ [WEBID]: profileDataset() });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      privateIndexUrl: null,
      publicIndexUrl: null,
    });
  });

  it("finds indexes linked from an rdfs:seeAlso extended profile", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(RDFS.seeAlso, EXTENDED_PROFILE)),
      [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE, (t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX).addIri(SOLID.publicTypeIndex, PUBLIC_INDEX),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });
  });

  it("finds indexes linked from a foaf:isPrimaryTopicOf extended profile", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(FOAF.isPrimaryTopicOf, EXTENDED_PROFILE)),
      [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE, (t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: null,
    });
  });

  it("prefers links in the WebID document over the extended profile", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX).addIri(RDFS.seeAlso, EXTENDED_PROFILE),
      ),
      [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE, (t) =>
        t
          .addIri(SOLID.privateTypeIndex, "https://alice.example/other.ttl")
          .addIri(SOLID.publicTypeIndex, PUBLIC_INDEX),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });
  });

  it("skips the extended profile when the WebID document links both indexes", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t
          .addIri(SOLID.privateTypeIndex, PRIVATE_INDEX)
          .addIri(SOLID.publicTypeIndex, PUBLIC_INDEX)
          .addIri(RDFS.seeAlso, EXTENDED_PROFILE),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });
    expect(readDocument).toHaveBeenCalledTimes(1);
  });

  it("does not re-fetch the WebID document when it is its own isPrimaryTopicOf", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(FOAF.isPrimaryTopicOf, PROFILE_DOC)),
    });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      privateIndexUrl: null,
      publicIndexUrl: null,
    });
    expect(readDocument).toHaveBeenCalledTimes(1);
  });

  it("treats an unreadable extended profile as linking nothing", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(RDFS.seeAlso, EXTENDED_PROFILE)),
    });
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toEqual({
      fetch: expect.any(Function),
      privateIndexUrl: null,
      publicIndexUrl: null,
    });
  });
});

describe("locateTypeIndexes outside the profile's own places", () => {
  const ELSEWHERE = "https://elsewhere.example/doc";
  const STORAGE = "https://storage.example/alice/";
  const STORED_PROFILE = `${STORAGE}profile`;

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
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toMatchObject({
      privateIndexUrl: null,
      publicIndexUrl: null,
    });
    expect(vi.mocked(readDocument).mock.calls.map(([url]) => url)).toEqual([WEBID]);
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
    await expect(locateTypeIndexes(WEBID, noFetch, noFetch)).resolves.toMatchObject({
      publicIndexUrl: `${STORAGE}settings/publicTypeIndex.ttl`,
    });
  });

  it("reads on when the indexes are found but their storage is named further on", async () => {
    const storedPublic = `${STORAGE}settings/publicTypeIndex.ttl`;
    const storedPrivate = `${STORAGE}settings/privateTypeIndex.ttl`;
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t
          .addIri(SOLID.publicTypeIndex, storedPublic)
          .addIri(SOLID.privateTypeIndex, storedPrivate)
          .addIri(RDFS.seeAlso, EXTENDED_PROFILE),
      ),
      [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE, (t) => t.addIri(PIM.storage, STORAGE)),
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(""));
    const publicFetch = vi.fn<typeof globalThis.fetch>();
    const { fetch: indexFetch } = await locateTypeIndexes(WEBID, fetch, publicFetch);

    await indexFetch(storedPrivate, { method: "PATCH" });
    expect(fetch).toHaveBeenCalledWith(storedPrivate, { method: "PATCH" });
    expect(publicFetch).not.toHaveBeenCalled();
  });

  it("reads and writes the indexes as the user in the profile's own places alone", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(RDFS.seeAlso, EXTENDED_PROFILE)),
      [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE, (t) => t.addIri(PIM.storage, STORAGE)),
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(""));
    const publicFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(""));
    const { fetch: indexFetch } = await locateTypeIndexes(WEBID, fetch, publicFetch);

    // The WebID's origin, and a storage the extended profile names.
    await indexFetch(PUBLIC_INDEX);
    await indexFetch(`${STORAGE}settings/publicTypeIndex.ttl`, { method: "PATCH" });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      PUBLIC_INDEX,
      `${STORAGE}settings/publicTypeIndex.ttl`,
    ]);
    // Anywhere else: read as no one, a write refused before it is sent.
    fetch.mockClear();
    await indexFetch(ELSEWHERE);
    expect(publicFetch).toHaveBeenCalledWith(ELSEWHERE, undefined);
    await expect(indexFetch(ELSEWHERE, { method: "PUT" })).rejects.toMatchObject({
      code: "writeOutsidePod",
    });
    expect(fetch).not.toHaveBeenCalled();
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
    mockDatasets({ [WEBID]: profileDataset() });
    const fetch = storageAwareFetch("https://alice.example/");

    const indexUrl = await createTypeIndex(
      "private",
      WEBID,
      "https://alice.example/solid-memo/main/",
      fetch,
    );

    expect(indexUrl).toBe(PRIVATE_INDEX);
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
    mockDatasets({ [WEBID]: profileDataset() });
    const fetch = storageAwareFetch("https://alice.example/");

    const indexUrl = await createTypeIndex(
      "public",
      WEBID,
      "https://alice.example/solid-memo/main/",
      fetch,
    );

    expect(indexUrl).toBe(PUBLIC_INDEX);
    const [, indexDataset] = vi.mocked(writeDocument).mock.calls[0];
    const indexThing = getThing(indexDataset as Dataset, PUBLIC_INDEX)!;
    expect(getUrlAll(indexThing, RDF.type)).toContain(SOLID.ListedDocument);
    const [, profileSaved] = vi.mocked(writeDocument).mock.calls[1];
    const profileThing = getThing(profileSaved as Dataset, WEBID)!;
    expect(getUrl(profileThing, SOLID.publicTypeIndex)).toBe(PUBLIC_INDEX);
  });

  it("refuses, writing nothing, when the WebID leads to no storage", async () => {
    mockDatasets({ [WEBID]: profileDataset() });
    const fetch = vi.fn(async () => new Response(null, { status: 200 })) as typeof globalThis.fetch;

    await expect(
      createTypeIndex("private", WEBID, "https://alice.example/deep/path/main/", fetch),
    ).rejects.toMatchObject({ code: "typeIndexNoStorage" });
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("keeps the index in the user's storage, not on the server of an instance elsewhere", async () => {
    mockDatasets({ [WEBID]: profileDataset() });
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
    ).resolves.toBe(PUBLIC_INDEX);
    const saveUrls = vi.mocked(writeDocument).mock.calls.map(([url]) => url);
    expect(saveUrls).toEqual([PUBLIC_INDEX, PROFILE_DOC]);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).not.toContain(
      "https://attacker.example/",
    );
  });

  it("uses the storage the profile names that the instance is in, else the first", async () => {
    const work = "https://work.example/alice/";
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t.addIri(PIM.storage, "https://alice.example/").addIri(PIM.storage, work),
      ),
    });

    await expect(
      createTypeIndex("private", WEBID, `${work}solid-memo/main/`, noFetch),
    ).resolves.toBe(`${work}settings/privateTypeIndex.ttl`);
    await expect(
      createTypeIndex("private", WEBID, "https://attacker.example/open/", noFetch),
    ).resolves.toBe(PRIVATE_INDEX);
  });

  it("keeps walking when a HEAD request fails", async () => {
    mockDatasets({ [WEBID]: profileDataset() });
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
    ).resolves.toBe(PRIVATE_INDEX);
  });

  it("adopts an existing index document instead of overwriting it", async () => {
    const leftover = setThing(
      datasetFrom(PRIVATE_INDEX),
      buildThing(createThing({ url: `${PRIVATE_INDEX}#sm-inst-old` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .build(),
    );
    mockDatasets({ [WEBID]: profileDataset(), [PRIVATE_INDEX]: leftover });
    const fetch = storageAwareFetch("https://alice.example/");

    await expect(
      createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
    ).resolves.toBe(PRIVATE_INDEX);

    const saveUrls = vi.mocked(writeDocument).mock.calls.map(([url]) => url);
    expect(saveUrls).toEqual([PROFILE_DOC]);
  });

  it("rethrows a non-404 failure when probing for an existing index", async () => {
    mockDatasets({ [WEBID]: profileDataset() });
    vi.mocked(readDocument).mockImplementation((async (url: string) => {
      if (url === WEBID) return readOf(profileDataset());
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
        [WEBID]: profileDataset((t) =>
          t.addIri(RDFS.seeAlso, EXTENDED_PROFILE).addIri(FOAF.isPrimaryTopicOf, EXTENDED_PROFILE),
        ),
        [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE),
      });
      rejectSavesTo(PROFILE_DOC);
      const fetch = storageAwareFetch("https://alice.example/");

      await expect(
        createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
      ).resolves.toBe(PRIVATE_INDEX);

      const saveUrls = vi.mocked(writeDocument).mock.calls.map(([url]) => url);
      expect(saveUrls).toEqual([PRIVATE_INDEX, PROFILE_DOC, EXTENDED_PROFILE]);
      const [, saved] = vi.mocked(writeDocument).mock.calls[2];
      const subject = getThing(saved as Dataset, WEBID)!;
      expect(getUrl(subject, SOLID.privateTypeIndex)).toBe(PRIVATE_INDEX);
    });

    it("creates the WebID subject in an extended profile that lacks it", async () => {
      mockDatasets({
        [WEBID]: profileDataset((t) => t.addIri(RDFS.seeAlso, EXTENDED_PROFILE)),
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
        [WEBID]: profileDataset((t) => t.addIri(RDFS.seeAlso, EXTENDED_PROFILE)),
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
        [WEBID]: profileDataset((t) => t.addIri(RDFS.seeAlso, "https://elsewhere.example/doc")),
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
      mockDatasets({ [WEBID]: profileDataset() });
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
      mockDatasets({ [WEBID]: profileDataset() });
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

describe("ensureTypeIndex", () => {
  it("returns the existing index without creating anything", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX)),
    });
    await expect(
      ensureTypeIndex("private", WEBID, "https://alice.example/x/", noFetch, noFetch),
    ).resolves.toEqual({ url: PRIVATE_INDEX, fetch: expect.any(Function) });
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("returns the existing public index", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(SOLID.publicTypeIndex, PUBLIC_INDEX)),
    });
    await expect(
      ensureTypeIndex("public", WEBID, "https://alice.example/x/", noFetch, noFetch),
    ).resolves.toEqual({ url: PUBLIC_INDEX, fetch: expect.any(Function) });
  });

  it("creates the index when missing", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(PIM.storage, "https://alice.example/")),
    });
    const fetch = vi.fn(async () => new Response(null, { status: 200 })) as typeof globalThis.fetch;

    await expect(
      ensureTypeIndex("private", WEBID, "https://alice.example/x/", fetch, noFetch),
    ).resolves.toEqual({ url: PRIVATE_INDEX, fetch: expect.any(Function) });
    expect(writeDocument).toHaveBeenCalled();
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

describe("readRegisteredClasses", () => {
  const MAIN = "https://alice.example/solid-memo/main/";

  it("says which classes of the instance's data the index registers, each by what it names exactly", async () => {
    mockDatasets({
      [PRIVATE_INDEX]: privateIndex(
        // The container under either predicate, a missing slash ignored.
        registered("inst", SM.Instance, SOLID.instance, "https://alice.example/solid-memo/main"),
        registered("deck", SM.Deck, SOLID.instance, `${MAIN}catalog.ttl`),
        registered("card", SM.Card, SOLID.instance, `${MAIN}decks/`),
        // Not the instance's: its answers' container without the slash, another instance's review states,
        // a catalog elsewhere in the folder, and a registration that is not one.
        registered("answer", SM.Answer, SOLID.instanceContainer, `${MAIN}history`),
        registered(
          "review",
          SM.ReviewState,
          SOLID.instanceContainer,
          "https://alice.example/solid-memo/b/reviews/",
        ),
        registered("cat", DCAT.Catalog, SOLID.instance, `${MAIN}attachments/index.ttl#catalog`),
        buildThing(createThing({ url: `${PRIVATE_INDEX}#note` }))
          .addIri(SOLID.forClass, DCAT.Catalog)
          .addIri(SOLID.instance, `${MAIN}catalog.ttl#catalog`)
          .build(),
      ),
    });
    await expect(
      readRegisteredClasses(PRIVATE_INDEX, "https://alice.example/solid-memo/main", noFetch),
    ).resolves.toEqual(["instance", "deck", "card"]);
  });
});

describe("addRegistrations", () => {
  const MAIN = "https://alice.example/solid-memo/main/";
  const ids = () => {
    let next = 0;
    return () => `id${++next}`;
  };

  it("registers each class of the instance's data, titled, in one save", async () => {
    mockDatasets({ [PRIVATE_INDEX]: privateIndex() });
    await expect(
      addRegistrations(
        PRIVATE_INDEX,
        {
          instanceUrl: "https://alice.example/solid-memo/main",
          title: "Main",
          classes: ["instance", "catalog", "deck", "card", "reviewState", "answer"],
        },
        ids(),
        noFetch,
      ),
    ).resolves.toEqual(["instance", "catalog", "deck", "card", "reviewState", "answer"]);
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
    const common = { types: [SOLID.TypeRegistration], title: "Main" };
    expect(registrations).toEqual([
      {
        ...common,
        url: `${PRIVATE_INDEX}#sm-inst-id1`,
        forClass: [SM.Instance],
        instance: [],
        instanceContainer: [MAIN],
      },
      {
        ...common,
        url: `${PRIVATE_INDEX}#sm-cat-id2`,
        forClass: [DCAT.Catalog],
        instance: [`${MAIN}catalog.ttl#catalog`],
        instanceContainer: [],
      },
      {
        ...common,
        url: `${PRIVATE_INDEX}#sm-deck-id3`,
        forClass: [SM.Deck],
        instance: [`${MAIN}catalog.ttl`],
        instanceContainer: [],
      },
      {
        ...common,
        url: `${PRIVATE_INDEX}#sm-card-id4`,
        forClass: [SM.Card],
        instance: [],
        instanceContainer: [`${MAIN}decks/`],
      },
      {
        ...common,
        url: `${PRIVATE_INDEX}#sm-review-id5`,
        forClass: [SM.ReviewState],
        instance: [],
        instanceContainer: [`${MAIN}reviews/`],
      },
      {
        ...common,
        url: `${PRIVATE_INDEX}#sm-answer-id6`,
        forClass: [SM.Answer],
        instance: [],
        instanceContainer: [`${MAIN}history/`],
      },
    ]);
  });

  it("adds only what the index does not register already, and saves nothing when it registers it all", async () => {
    const index = privateIndex(
      registered("inst", SM.Instance, SOLID.instance, "https://alice.example/solid-memo/main"),
      registered("cat", DCAT.Catalog, SOLID.instance, `${MAIN}catalog.ttl#catalog`),
    );
    mockDatasets({ [PRIVATE_INDEX]: index });
    await expect(
      addRegistrations(
        PRIVATE_INDEX,
        { instanceUrl: MAIN, title: "Main", classes: ["instance", "catalog", "card"] },
        ids(),
        noFetch,
      ),
    ).resolves.toEqual(["card"]);
    const saved = vi.mocked(writeDocument).mock.calls[0][1] as Dataset;
    expect(getThingAll(saved).map((thing) => thing.url)).toEqual([
      `${PRIVATE_INDEX}#inst`,
      `${PRIVATE_INDEX}#cat`,
      `${PRIVATE_INDEX}#sm-card-id1`,
    ]);

    vi.mocked(writeDocument).mockClear();
    await expect(
      addRegistrations(
        PRIVATE_INDEX,
        { instanceUrl: MAIN, title: "Main", classes: ["instance", "catalog"] },
        ids(),
        noFetch,
      ),
    ).resolves.toEqual([]);
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("reads the index again and adds what is still missing when it changed meanwhile", async () => {
    let reads = 0;
    vi.mocked(readDocument).mockImplementation((async () =>
      readOf(
        // Meanwhile another tab registered the cards.
        ++reads === 1
          ? privateIndex()
          : privateIndex(registered("theirs", SM.Card, SOLID.instanceContainer, `${MAIN}decks/`)),
      )) as never);
    vi.mocked(writeDocument).mockRejectedValueOnce(preconditionFailed());
    await expect(
      addRegistrations(
        PRIVATE_INDEX,
        { instanceUrl: MAIN, title: "Main", classes: ["deck", "card"] },
        ids(),
        noFetch,
      ),
    ).resolves.toEqual(["deck"]);
    expect(writeDocument).toHaveBeenCalledTimes(2);
    const saved = vi.mocked(writeDocument).mock.calls[1][1] as Dataset;
    expect(getThingAll(saved).map((thing) => thing.url)).toEqual([
      `${PRIVATE_INDEX}#theirs`,
      `${PRIVATE_INDEX}#sm-deck-id3`,
    ]);
  });

  it("gives up after three attempts, and rethrows any other failure at once", async () => {
    mockDatasets({ [PRIVATE_INDEX]: privateIndex() });
    vi.mocked(writeDocument).mockRejectedValue(preconditionFailed());
    await expect(
      addRegistrations(
        PRIVATE_INDEX,
        { instanceUrl: MAIN, title: "Main", classes: ["deck"] },
        ids(),
        noFetch,
      ),
    ).rejects.toMatchObject({ code: "changedElsewhere" });
    expect(writeDocument).toHaveBeenCalledTimes(3);

    vi.mocked(writeDocument).mockReset();
    vi.mocked(writeDocument).mockRejectedValue(new Error("403 Forbidden"));
    await expect(
      addRegistrations(
        PRIVATE_INDEX,
        { instanceUrl: MAIN, title: "Main", classes: ["deck"] },
        ids(),
        noFetch,
      ),
    ).rejects.toThrow("403 Forbidden");
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

  it("removes the registration of each class of the instance's data by exact IRI, never another app's below the folder", async () => {
    const MAIN = "https://alice.example/solid-memo/a/";
    mockDatasets({
      [PRIVATE_INDEX]: privateIndex(
        registered("deck", SM.Deck, SOLID.instance, `${MAIN}catalog.ttl`),
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

  it("renames the registration of each class of the instance's data, in one save, and no other", async () => {
    mockDatasets({
      [PRIVATE_INDEX]: index(
        registration("inst", SM.Instance, SOLID.instance, "https://alice.example/solid-memo/main"),
        registration("cat", DCAT.Catalog, SOLID.instance, `${MAIN}catalog.ttl#catalog`),
        registration("deck", SM.Deck, SOLID.instance, `${MAIN}catalog.ttl`),
        registration("card", SM.Card, SOLID.instanceContainer, `${MAIN}decks/`),
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
