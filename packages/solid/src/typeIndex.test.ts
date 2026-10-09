import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  getSolidDataset,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  mockSolidDatasetFrom,
  saveSolidDatasetAt,
  setThing,
  type SolidDataset,
  type ThingBuilder,
  type ThingPersisted,
} from "@inrupt/solid-client";
import {
  addRegistrations,
  createTypeIndex,
  ensureTypeIndex,
  locateTypeIndexes,
  readInstanceRegistrations,
  readRegisteredClasses,
  removeInstanceRegistrations,
} from "./typeIndex";
import { DCAT, DCTERMS, FOAF, PIM, RDF, RDFS, SM, SOLID } from "./vocab";

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@inrupt/solid-client")>();
  return {
    ...actual,
    getSolidDataset: vi.fn(),
    saveSolidDatasetAt: vi.fn(),
  };
});

const WEBID = "https://alice.example/profile/card#me";
const PROFILE_DOC = "https://alice.example/profile/card";
const PRIVATE_INDEX = "https://alice.example/settings/privateTypeIndex.ttl";
const PUBLIC_INDEX = "https://alice.example/settings/publicTypeIndex.ttl";
const PREFERENCES_FILE = "https://alice.example/settings/prefs.ttl";
const EXTENDED_PROFILE = "https://alice.example/profile";

const noFetch = vi.fn() as unknown as typeof globalThis.fetch;

function profileDataset(
  build: (
    thing: ThingBuilder<ThingPersisted>,
  ) => ThingBuilder<ThingPersisted> = (t) => t,
): SolidDataset {
  return setThing(
    mockSolidDatasetFrom(PROFILE_DOC),
    build(buildThing(createThing({ url: WEBID }))).build(),
  );
}

/** A document at `documentUrl` holding the WebID subject with `build` applied. */
function subjectDocument(
  documentUrl: string,
  build: (
    thing: ThingBuilder<ThingPersisted>,
  ) => ThingBuilder<ThingPersisted> = (t) => t,
): SolidDataset {
  return setThing(
    mockSolidDatasetFrom(documentUrl),
    build(buildThing(createThing({ url: WEBID }))).build(),
  );
}

/** Route getSolidDataset calls by URL; unknown URLs fail like a 404. */
function mockDatasets(datasets: Record<string, SolidDataset>) {
  vi.mocked(getSolidDataset).mockImplementation((async (url: string) => {
    const dataset = datasets[url];
    if (dataset === undefined) {
      throw Object.assign(new Error(`404 ${url}`), { statusCode: 404 });
    }
    return dataset;
  }) as never);
}

beforeEach(() => {
  vi.mocked(getSolidDataset).mockReset();
  vi.mocked(saveSolidDatasetAt).mockReset();
  vi.mocked(saveSolidDatasetAt).mockImplementation(async (_url, dataset) => {
    return dataset as never;
  });
});

describe("locateTypeIndexes", () => {
  it("finds both indexes linked directly from the profile", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t
          .addIri(SOLID.privateTypeIndex, PRIVATE_INDEX)
          .addIri(SOLID.publicTypeIndex, PUBLIC_INDEX),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch)).resolves.toEqual({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });
  });

  it("returns nulls when the profile has no WebID subject", async () => {
    mockDatasets({ [WEBID]: mockSolidDatasetFrom(PROFILE_DOC) });
    await expect(locateTypeIndexes(WEBID, noFetch)).resolves.toEqual({
      privateIndexUrl: null,
      publicIndexUrl: null,
    });
  });

  it("follows the preferences file to the private index", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t.addIri(PIM.preferencesFile, PREFERENCES_FILE),
      ),
      [PREFERENCES_FILE]: setThing(
        mockSolidDatasetFrom(PREFERENCES_FILE),
        buildThing(createThing({ url: WEBID }))
          .addIri(SOLID.privateTypeIndex, PRIVATE_INDEX)
          .build(),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch)).resolves.toEqual({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: null,
    });
  });

  it("treats an unreadable preferences file as no private index", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t.addIri(PIM.preferencesFile, PREFERENCES_FILE),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch)).resolves.toEqual({
      privateIndexUrl: null,
      publicIndexUrl: null,
    });
  });

  it("treats a preferences file without the WebID subject as no private index", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t.addIri(PIM.preferencesFile, PREFERENCES_FILE),
      ),
      [PREFERENCES_FILE]: mockSolidDatasetFrom(PREFERENCES_FILE),
    });
    await expect(locateTypeIndexes(WEBID, noFetch)).resolves.toEqual({
      privateIndexUrl: null,
      publicIndexUrl: null,
    });
  });

  it("returns null private index when the profile links nothing", async () => {
    mockDatasets({ [WEBID]: profileDataset() });
    await expect(locateTypeIndexes(WEBID, noFetch)).resolves.toEqual({
      privateIndexUrl: null,
      publicIndexUrl: null,
    });
  });

  it("finds indexes linked from an rdfs:seeAlso extended profile", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(RDFS.seeAlso, EXTENDED_PROFILE)),
      [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE, (t) =>
        t
          .addIri(SOLID.privateTypeIndex, PRIVATE_INDEX)
          .addIri(SOLID.publicTypeIndex, PUBLIC_INDEX),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch)).resolves.toEqual({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });
  });

  it("finds indexes linked from a foaf:isPrimaryTopicOf extended profile", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t.addIri(FOAF.isPrimaryTopicOf, EXTENDED_PROFILE),
      ),
      [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE, (t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch)).resolves.toEqual({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: null,
    });
  });

  it("prefers links in the WebID document over the extended profile", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t
          .addIri(SOLID.privateTypeIndex, PRIVATE_INDEX)
          .addIri(RDFS.seeAlso, EXTENDED_PROFILE),
      ),
      [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE, (t) =>
        t
          .addIri(SOLID.privateTypeIndex, "https://alice.example/other.ttl")
          .addIri(SOLID.publicTypeIndex, PUBLIC_INDEX),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch)).resolves.toEqual({
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
    await expect(locateTypeIndexes(WEBID, noFetch)).resolves.toEqual({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });
    expect(getSolidDataset).toHaveBeenCalledTimes(1);
  });

  it("does not re-fetch the WebID document when it is its own isPrimaryTopicOf", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t.addIri(FOAF.isPrimaryTopicOf, PROFILE_DOC),
      ),
    });
    await expect(locateTypeIndexes(WEBID, noFetch)).resolves.toEqual({
      privateIndexUrl: null,
      publicIndexUrl: null,
    });
    expect(getSolidDataset).toHaveBeenCalledTimes(1);
  });

  it("treats an unreadable extended profile as linking nothing", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) => t.addIri(RDFS.seeAlso, EXTENDED_PROFILE)),
    });
    await expect(locateTypeIndexes(WEBID, noFetch)).resolves.toEqual({
      privateIndexUrl: null,
      publicIndexUrl: null,
    });
  });
});

describe("createTypeIndex", () => {
  function storageAwareFetch(storageRoot: string): typeof globalThis.fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
      const headers = new Headers();
      if (String(input) === storageRoot) {
        headers.set(
          "Link",
          '<http://www.w3.org/ns/pim/space#Storage>; rel="type"',
        );
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
    const [firstSaveUrl, indexDataset] =
      vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(firstSaveUrl).toBe(PRIVATE_INDEX);
    const indexThing = getThing(indexDataset as SolidDataset, PRIVATE_INDEX)!;
    expect(getUrlAll(indexThing, RDF.type)).toEqual([
      SOLID.TypeIndex,
      SOLID.UnlistedDocument,
    ]);

    const [secondSaveUrl, profileSaved] =
      vi.mocked(saveSolidDatasetAt).mock.calls[1];
    expect(secondSaveUrl).toBe(PROFILE_DOC);
    const profileThing = getThing(profileSaved as SolidDataset, WEBID)!;
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
    const [, indexDataset] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    const indexThing = getThing(indexDataset as SolidDataset, PUBLIC_INDEX)!;
    expect(getUrlAll(indexThing, RDF.type)).toContain(SOLID.ListedDocument);
    const [, profileSaved] = vi.mocked(saveSolidDatasetAt).mock.calls[1];
    const profileThing = getThing(profileSaved as SolidDataset, WEBID)!;
    expect(getUrl(profileThing, SOLID.publicTypeIndex)).toBe(PUBLIC_INDEX);
  });

  it("falls back to the origin root when no candidate advertises a storage", async () => {
    mockDatasets({ [WEBID]: profileDataset() });
    const fetch = vi.fn(async () =>
      new Response(null, { status: 200 }),
    ) as typeof globalThis.fetch;

    const indexUrl = await createTypeIndex(
      "private",
      WEBID,
      "https://alice.example/deep/path/main/",
      fetch,
    );
    expect(indexUrl).toBe(PRIVATE_INDEX);
  });

  it("keeps walking when a HEAD request fails", async () => {
    mockDatasets({ [WEBID]: profileDataset() });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementation(async (input: RequestInfo | URL) => {
        const headers = new Headers();
        if (String(input) === "https://alice.example/") {
          headers.set(
            "Link",
            '<http://www.w3.org/ns/pim/space#Storage>; rel="type"',
          );
        }
        return new Response(null, { status: 200, headers });
      });

    await expect(
      createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
    ).resolves.toBe(PRIVATE_INDEX);
  });

  it("adopts an existing index document instead of overwriting it", async () => {
    const leftover = setThing(
      mockSolidDatasetFrom(PRIVATE_INDEX),
      buildThing(createThing({ url: `${PRIVATE_INDEX}#sm-inst-old` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .build(),
    );
    mockDatasets({ [WEBID]: profileDataset(), [PRIVATE_INDEX]: leftover });
    const fetch = storageAwareFetch("https://alice.example/");

    await expect(
      createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
    ).resolves.toBe(PRIVATE_INDEX);

    const saveUrls = vi
      .mocked(saveSolidDatasetAt)
      .mock.calls.map(([url]) => url);
    expect(saveUrls).toEqual([PROFILE_DOC]);
  });

  it("rethrows a non-404 failure when probing for an existing index", async () => {
    mockDatasets({ [WEBID]: profileDataset() });
    vi.mocked(getSolidDataset).mockImplementation((async (url: string) => {
      if (url === WEBID) return profileDataset();
      throw Object.assign(new Error("boom"), { statusCode: 500 });
    }) as never);
    const fetch = storageAwareFetch("https://alice.example/");

    await expect(
      createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
    ).rejects.toThrow("boom");
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  it("throws when the profile has no WebID subject to link from", async () => {
    mockDatasets({ [WEBID]: mockSolidDatasetFrom(PROFILE_DOC) });
    const fetch = storageAwareFetch("https://alice.example/");

    await expect(
      createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
    ).rejects.toThrow("Your profile does not describe you");
  });

  describe("with a read-only WebID document (Inrupt PodSpaces style)", () => {
    function rejectSavesTo(...readOnlyUrls: string[]) {
      vi.mocked(saveSolidDatasetAt).mockImplementation(
        (async (url: string, dataset: SolidDataset) => {
          if (readOnlyUrls.includes(url)) {
            throw new Error(`Storing the Resource at [${url}] failed: [405]`);
          }
          return dataset;
        }) as never,
      );
    }

    it("links the index from the extended profile instead", async () => {
      mockDatasets({
        [WEBID]: profileDataset((t) =>
          t
            .addIri(RDFS.seeAlso, EXTENDED_PROFILE)
            .addIri(FOAF.isPrimaryTopicOf, EXTENDED_PROFILE),
        ),
        [EXTENDED_PROFILE]: subjectDocument(EXTENDED_PROFILE),
      });
      rejectSavesTo(PROFILE_DOC);
      const fetch = storageAwareFetch("https://alice.example/");

      await expect(
        createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
      ).resolves.toBe(PRIVATE_INDEX);

      const saveUrls = vi
        .mocked(saveSolidDatasetAt)
        .mock.calls.map(([url]) => url);
      expect(saveUrls).toEqual([PRIVATE_INDEX, PROFILE_DOC, EXTENDED_PROFILE]);
      const [, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[2];
      const subject = getThing(saved as SolidDataset, WEBID)!;
      expect(getUrl(subject, SOLID.privateTypeIndex)).toBe(PRIVATE_INDEX);
    });

    it("creates the WebID subject in an extended profile that lacks it", async () => {
      mockDatasets({
        [WEBID]: profileDataset((t) => t.addIri(RDFS.seeAlso, EXTENDED_PROFILE)),
        [EXTENDED_PROFILE]: mockSolidDatasetFrom(EXTENDED_PROFILE),
      });
      rejectSavesTo(PROFILE_DOC);
      const fetch = storageAwareFetch("https://alice.example/");

      await createTypeIndex("public", WEBID, "https://alice.example/x/", fetch);

      const [url, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[2];
      expect(url).toBe(EXTENDED_PROFILE);
      const subject = getThing(saved as SolidDataset, WEBID)!;
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

    it("still fails when the WebID document is read-only and has no extended profile", async () => {
      mockDatasets({ [WEBID]: profileDataset() });
      rejectSavesTo(PROFILE_DOC);
      const fetch = storageAwareFetch("https://alice.example/");

      await expect(
        createTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
      ).rejects.toMatchObject({ code: "privateTypeIndexNotLinked", message: expect.stringContaining("could not link its private list") });
      await expect(
        createTypeIndex("public", WEBID, "https://alice.example/x/", fetch),
      ).rejects.toMatchObject({ code: "publicTypeIndexNotLinked", message: expect.stringContaining("could not link its public list") });
    });

    it("describes non-Error rejections too", async () => {
      mockDatasets({ [WEBID]: profileDataset() });
      vi.mocked(saveSolidDatasetAt).mockImplementation(
        (async (url: string, dataset: SolidDataset) => {
          if (url === PROFILE_DOC) throw "nope";
          return dataset;
        }) as never,
      );
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
      [WEBID]: profileDataset((t) =>
        t.addIri(SOLID.privateTypeIndex, PRIVATE_INDEX),
      ),
    });
    await expect(
      ensureTypeIndex("private", WEBID, "https://alice.example/x/", noFetch),
    ).resolves.toBe(PRIVATE_INDEX);
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  it("returns the existing public index", async () => {
    mockDatasets({
      [WEBID]: profileDataset((t) =>
        t.addIri(SOLID.publicTypeIndex, PUBLIC_INDEX),
      ),
    });
    await expect(
      ensureTypeIndex("public", WEBID, "https://alice.example/x/", noFetch),
    ).resolves.toBe(PUBLIC_INDEX);
  });

  it("creates the index when missing", async () => {
    mockDatasets({ [WEBID]: profileDataset() });
    const fetch = vi.fn(async () =>
      new Response(null, { status: 200 }),
    ) as typeof globalThis.fetch;

    await expect(
      ensureTypeIndex("private", WEBID, "https://alice.example/x/", fetch),
    ).resolves.toBe(PRIVATE_INDEX);
    expect(saveSolidDatasetAt).toHaveBeenCalled();
  });
});

describe("readInstanceRegistrations", () => {
  it("collects sm:Instance registrations, accepting both container and instance predicates", async () => {
    let dataset = mockSolidDatasetFrom(PRIVATE_INDEX);
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${PRIVATE_INDEX}#a` }))
        .addIri(RDF.type, SOLID.TypeRegistration)
        .addIri(SOLID.forClass, SM.Instance)
        .addIri(
          SOLID.instanceContainer,
          "https://alice.example/solid-memo/a/",
        )
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

    await expect(
      readInstanceRegistrations(PRIVATE_INDEX, noFetch),
    ).resolves.toEqual([
      {
        containerUrl: "https://alice.example/solid-memo/a/",
        title: "Deck set A",
      },
      { containerUrl: "https://alice.example/solid-memo/b/", title: null },
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
function privateIndex(...things: ThingPersisted[]): SolidDataset {
  return things.reduce<SolidDataset>((dataset, thing) => setThing(dataset, thing), mockSolidDatasetFrom(PRIVATE_INDEX));
}

const preconditionFailed = () => Object.assign(new Error("412 Precondition Failed"), { statusCode: 412 });

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
        // a catalogue elsewhere in the folder, and a registration that is not one.
        registered("answer", SM.Answer, SOLID.instanceContainer, `${MAIN}history`),
        registered("review", SM.ReviewState, SOLID.instanceContainer, "https://alice.example/solid-memo/b/reviews/"),
        registered("cat", DCAT.Catalog, SOLID.instance, `${MAIN}attachments/index.ttl#catalog`),
        buildThing(createThing({ url: `${PRIVATE_INDEX}#note` }))
          .addIri(SOLID.forClass, DCAT.Catalog)
          .addIri(SOLID.instance, `${MAIN}catalog.ttl#catalog`)
          .build(),
      ),
    });
    await expect(readRegisteredClasses(PRIVATE_INDEX, "https://alice.example/solid-memo/main", noFetch)).resolves.toEqual([
      "instance",
      "deck",
      "card",
    ]);
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
        { instanceUrl: "https://alice.example/solid-memo/main", title: "Main", classes: ["instance", "catalog", "deck", "card", "reviewState", "answer"] },
        ids(),
        noFetch,
      ),
    ).resolves.toEqual(["instance", "catalog", "deck", "card", "reviewState", "answer"]);
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(PRIVATE_INDEX);
    const registrations = getThingAll(saved as SolidDataset).map((thing) => ({
      url: thing.url,
      types: getUrlAll(thing, RDF.type),
      forClass: getUrlAll(thing, SOLID.forClass),
      instance: getUrlAll(thing, SOLID.instance),
      instanceContainer: getUrlAll(thing, SOLID.instanceContainer),
      title: getStringNoLocale(thing, DCTERMS.title),
    }));
    const common = { types: [SOLID.TypeRegistration], title: "Main" };
    expect(registrations).toEqual([
      { ...common, url: `${PRIVATE_INDEX}#sm-inst-id1`, forClass: [SM.Instance], instance: [], instanceContainer: [MAIN] },
      { ...common, url: `${PRIVATE_INDEX}#sm-cat-id2`, forClass: [DCAT.Catalog], instance: [`${MAIN}catalog.ttl#catalog`], instanceContainer: [] },
      { ...common, url: `${PRIVATE_INDEX}#sm-deck-id3`, forClass: [SM.Deck], instance: [`${MAIN}catalog.ttl`], instanceContainer: [] },
      { ...common, url: `${PRIVATE_INDEX}#sm-card-id4`, forClass: [SM.Card], instance: [], instanceContainer: [`${MAIN}decks/`] },
      { ...common, url: `${PRIVATE_INDEX}#sm-review-id5`, forClass: [SM.ReviewState], instance: [], instanceContainer: [`${MAIN}reviews/`] },
      { ...common, url: `${PRIVATE_INDEX}#sm-answer-id6`, forClass: [SM.Answer], instance: [], instanceContainer: [`${MAIN}history/`] },
    ]);
  });

  it("adds only what the index does not register already, and saves nothing when it registers it all", async () => {
    const index = privateIndex(
      registered("inst", SM.Instance, SOLID.instance, "https://alice.example/solid-memo/main"),
      registered("cat", DCAT.Catalog, SOLID.instance, `${MAIN}catalog.ttl#catalog`),
    );
    mockDatasets({ [PRIVATE_INDEX]: index });
    await expect(
      addRegistrations(PRIVATE_INDEX, { instanceUrl: MAIN, title: "Main", classes: ["instance", "catalog", "card"] }, ids(), noFetch),
    ).resolves.toEqual(["card"]);
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    expect(getThingAll(saved).map((thing) => thing.url)).toEqual([
      `${PRIVATE_INDEX}#inst`,
      `${PRIVATE_INDEX}#cat`,
      `${PRIVATE_INDEX}#sm-card-id1`,
    ]);

    vi.mocked(saveSolidDatasetAt).mockClear();
    await expect(
      addRegistrations(PRIVATE_INDEX, { instanceUrl: MAIN, title: "Main", classes: ["instance", "catalog"] }, ids(), noFetch),
    ).resolves.toEqual([]);
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  it("reads the index again and adds what is still missing when it changed meanwhile", async () => {
    let reads = 0;
    vi.mocked(getSolidDataset).mockImplementation((async () =>
      // Meanwhile another tab registered the cards.
      ++reads === 1 ? privateIndex() : privateIndex(registered("theirs", SM.Card, SOLID.instanceContainer, `${MAIN}decks/`))) as never);
    vi.mocked(saveSolidDatasetAt).mockRejectedValueOnce(preconditionFailed());
    await expect(
      addRegistrations(PRIVATE_INDEX, { instanceUrl: MAIN, title: "Main", classes: ["deck", "card"] }, ids(), noFetch),
    ).resolves.toEqual(["deck"]);
    expect(saveSolidDatasetAt).toHaveBeenCalledTimes(2);
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[1][1] as SolidDataset;
    expect(getThingAll(saved).map((thing) => thing.url)).toEqual([`${PRIVATE_INDEX}#theirs`, `${PRIVATE_INDEX}#sm-deck-id3`]);
  });

  it("gives up after three attempts, and rethrows any other failure at once", async () => {
    mockDatasets({ [PRIVATE_INDEX]: privateIndex() });
    vi.mocked(saveSolidDatasetAt).mockRejectedValue(preconditionFailed());
    await expect(
      addRegistrations(PRIVATE_INDEX, { instanceUrl: MAIN, title: "Main", classes: ["deck"] }, ids(), noFetch),
    ).rejects.toMatchObject({ code: "changedElsewhere" });
    expect(saveSolidDatasetAt).toHaveBeenCalledTimes(3);

    vi.mocked(saveSolidDatasetAt).mockReset();
    vi.mocked(saveSolidDatasetAt).mockRejectedValue(new Error("403 Forbidden"));
    await expect(
      addRegistrations(PRIVATE_INDEX, { instanceUrl: MAIN, title: "Main", classes: ["deck"] }, ids(), noFetch),
    ).rejects.toThrow("403 Forbidden");
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
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

  it("removes every registration of the container under either predicate, and its catalogue's by exact IRI", async () => {
    let dataset = mockSolidDatasetFrom(PRIVATE_INDEX);
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
    // Another app's catalogues in the instance's folder: not the instance's.
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

    await removeInstanceRegistrations(
      PRIVATE_INDEX,
      "https://alice.example/solid-memo/a",
      noFetch,
    );

    const [saveUrl, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(saveUrl).toBe(PRIVATE_INDEX);
    const remaining = getThingAll(saved as SolidDataset).map((t) => t.url);
    expect(remaining).toEqual([
      `${PRIVATE_INDEX}#b`,
      `${PRIVATE_INDEX}#other`,
      `${PRIVATE_INDEX}#cat-b`,
      `${PRIVATE_INDEX}#cat-elsewhere`,
      `${PRIVATE_INDEX}#cat-shared`,
      `${PRIVATE_INDEX}#inst-shared`,
      PRIVATE_INDEX,
    ]);
    const instShared = getThing(saved as SolidDataset, `${PRIVATE_INDEX}#inst-shared`)!;
    expect(getUrlAll(instShared, SOLID.instanceContainer)).toEqual(["https://alice.example/notes/"]);
    expect(getUrlAll(instShared, SOLID.instance)).toEqual([]);
    // A registration of another catalogue besides keeps that one only.
    expect(getUrlAll(getThing(saved as SolidDataset, `${PRIVATE_INDEX}#cat-shared`)!, SOLID.instance)).toEqual([
      "https://alice.example/recipes/index.ttl#catalog",
    ]);
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
        registered("other-reviews", SM.ReviewState, SOLID.instanceContainer, "https://alice.example/solid-memo/b/reviews/"),
        // A class that is not the one the resource is registered for.
        registered("wrong-class", SM.Answer, SOLID.instanceContainer, `${MAIN}reviews/`),
        buildThing(registered("shared", SM.Card, SOLID.instanceContainer, `${MAIN}decks/`))
          .addIri(SOLID.instanceContainer, "https://alice.example/flashcards/")
          .build(),
      ),
    });

    await removeInstanceRegistrations(PRIVATE_INDEX, MAIN, noFetch);

    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0][1] as SolidDataset;
    expect(getThingAll(saved).map((thing) => thing.url)).toEqual([
      `${PRIVATE_INDEX}#their-cards`,
      `${PRIVATE_INDEX}#their-decks`,
      `${PRIVATE_INDEX}#other-reviews`,
      `${PRIVATE_INDEX}#wrong-class`,
      `${PRIVATE_INDEX}#shared`,
    ]);
    expect(getUrlAll(getThing(saved, `${PRIVATE_INDEX}#shared`)!, SOLID.instanceContainer)).toEqual([
      "https://alice.example/flashcards/",
    ]);
  });

  it("reads the index again and removes what is still there when it changed meanwhile", async () => {
    const MAIN = "https://alice.example/solid-memo/a/";
    let reads = 0;
    vi.mocked(getSolidDataset).mockImplementation((async () =>
      privateIndex(
        registered("inst", SM.Instance, SOLID.instanceContainer, MAIN),
        // Meanwhile another app registered its notes.
        ...(++reads === 1 ? [] : [registered("notes", "https://schema.org/NoteDigitalDocument", SOLID.instanceContainer, "https://alice.example/notes/")]),
      )) as never);
    vi.mocked(saveSolidDatasetAt).mockRejectedValueOnce(preconditionFailed());

    await removeInstanceRegistrations(PRIVATE_INDEX, MAIN, noFetch);

    expect(saveSolidDatasetAt).toHaveBeenCalledTimes(2);
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[1][1] as SolidDataset;
    expect(getThingAll(saved).map((thing) => thing.url)).toEqual([`${PRIVATE_INDEX}#notes`]);
  });

  it("does not save when nothing matched", async () => {
    mockDatasets({
      [PRIVATE_INDEX]: setThing(
        mockSolidDatasetFrom(PRIVATE_INDEX),
        registration("b", SOLID.instanceContainer, "https://alice.example/solid-memo/b/"),
      ),
    });

    await removeInstanceRegistrations(
      PRIVATE_INDEX,
      "https://alice.example/solid-memo/a/",
      noFetch,
    );

    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});
