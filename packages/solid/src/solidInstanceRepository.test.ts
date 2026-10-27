// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  type Dataset,
  getInteger,
  getStringNoLocale,
  getThing,
  setThing,
} from "./client/rdf";
import {
  deleteContainer,
  deleteSolidDataset,
  readDocument,
  writeDocument,
} from "./client/resources";
import { datasetFrom, readOf } from "./testing/datasets";
import { createSolidInstanceRepository } from "./solidInstanceRepository";
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
import { DCTERMS, SM } from "./vocab";
import { deleteInstanceData } from "./instanceData";

vi.mock("./client/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client/resources")>();
  return {
    ...actual,
    readDocument: vi.fn(),
    // A write the pod takes as given, with no version.
    writeDocument: vi.fn(async (_url: string, dataset: object) => ({ dataset, etag: undefined })),
    deleteSolidDataset: vi.fn(),
    deleteContainer: vi.fn(),
  };
});
vi.mock("./typeIndex");
vi.mock("./instanceData");

const WEBID = "https://alice.example/profile/card#me";
const PRIVATE_INDEX = "https://alice.example/settings/privateTypeIndex.ttl";
const PUBLIC_INDEX = "https://alice.example/settings/publicTypeIndex.ttl";
const CONTAINER = "https://alice.example/solid-memo/main/";

const META = `${CONTAINER}meta.ttl`;
const NOTE = "https://other.example/says";

/** The meta.ttl a creation wrote, as read back: the instance's #it, and `others`. */
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
function metaWith(...others: ReturnType<typeof createThing>[]) {
  return [
    buildThing(createThing({ url: `${META}#it` }))
      .addUrl(RDF_TYPE, SM.Instance)
      .build(),
    ...others,
  ].reduce((dataset, thing) => setThing(dataset, thing), datasetFrom(META));
}

function makeRepository(
  checkWrite?: Parameters<typeof createSolidInstanceRepository>[0]["checkWrite"],
) {
  return createSolidInstanceRepository({
    fetch: vi.fn() as unknown as typeof globalThis.fetch,
    now: () => new Date("2026-09-21T10:00:00.000Z"),
    randomId: () => "fixed-id",
    ...(checkWrite === undefined ? {} : { checkWrite }),
  });
}

beforeEach(() => {
  vi.mocked(readDocument).mockReset();
  vi.mocked(writeDocument).mockReset();
  vi.mocked(deleteSolidDataset).mockReset();
  vi.mocked(deleteContainer).mockReset();
  vi.mocked(locateTypeIndexes).mockReset();
  vi.mocked(ensureTypeIndex).mockReset();
  vi.mocked(readInstanceRegistrations).mockReset();
  vi.mocked(createTypeIndex).mockReset();
  vi.mocked(readRegisteredClasses).mockReset();
  vi.mocked(addRegistrations).mockReset();
  vi.mocked(removeInstanceRegistrations).mockReset();
  vi.mocked(deleteInstanceData).mockReset();
});

describe("listInstances", () => {
  it("merges registrations from both indexes, deduplicating by container", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: "https://alice.example/settings/publicTypeIndex.ttl",
    });
    vi.mocked(readInstanceRegistrations)
      .mockResolvedValueOnce([
        { containerUrl: CONTAINER, title: "Main" },
        { containerUrl: "https://alice.example/solid-memo/other", title: null },
      ])
      .mockResolvedValueOnce([{ containerUrl: CONTAINER, title: "Duplicate" }]);

    await expect(makeRepository().listInstances(WEBID)).resolves.toEqual([
      { url: CONTAINER, name: "Main" },
      { url: "https://alice.example/solid-memo/other/", name: "other" },
    ]);
  });

  it("skips missing indexes and tolerates unreadable ones", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: null,
    });
    vi.mocked(readInstanceRegistrations).mockRejectedValue(new Error("403 Forbidden"));

    await expect(makeRepository().listInstances(WEBID)).resolves.toEqual([]);
  });
});

describe("getRegistrationOptions", () => {
  it("maps index locations to existence flags", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: null,
      publicIndexUrl: "https://alice.example/settings/publicTypeIndex.ttl",
    });
    await expect(makeRepository().getRegistrationOptions(WEBID)).resolves.toEqual({
      privateIndexExists: false,
      publicIndexExists: true,
    });
  });
});

const ALL = ["instance", "catalog", "deck", "card", "reviewState", "answer", "draft"];
const SHARED = ["instance", "catalog", "deck", "card"];
const PRIVATE_ONLY = ["reviewState", "answer", "draft"];

describe("readDataClassRegistrations and registerDataClasses", () => {
  const args = { webId: WEBID, instanceUrl: CONTAINER };

  it("want the instance's data of every class in each index that registers it, review states, answers and drafts in the private one only", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });
    vi.mocked(readRegisteredClasses).mockImplementation(async (indexUrl) =>
      indexUrl === PRIVATE_INDEX ? ["instance", "catalog", "answer"] : ["instance", "deck"],
    );
    const repository = makeRepository();

    await expect(repository.readDataClassRegistrations(args)).resolves.toEqual({
      registrations: [
        { dataClass: "instance", index: "private", registered: true },
        { dataClass: "instance", index: "public", registered: true },
        { dataClass: "catalog", index: "private", registered: true },
        { dataClass: "catalog", index: "public", registered: false },
        { dataClass: "deck", index: "private", registered: false },
        { dataClass: "deck", index: "public", registered: true },
        { dataClass: "card", index: "private", registered: false },
        { dataClass: "card", index: "public", registered: false },
        { dataClass: "reviewState", index: "private", registered: false },
        { dataClass: "answer", index: "private", registered: true },
        { dataClass: "draft", index: "private", registered: false },
      ],
      privateIndexMissing: false,
      unreadableIndexes: [],
    });
    expect(readRegisteredClasses).toHaveBeenCalledWith(PRIVATE_INDEX, CONTAINER, expect.anything());

    await repository.registerDataClasses({ ...args, title: "Main" });
    expect(vi.mocked(addRegistrations).mock.calls.map((call) => [call[0], call[1]])).toEqual([
      [
        PRIVATE_INDEX,
        {
          instanceUrl: CONTAINER,
          title: "Main",
          classes: ["deck", "card", "reviewState", "draft"],
        },
      ],
      [PUBLIC_INDEX, { instanceUrl: CONTAINER, title: "Main", classes: ["catalog", "card"] }],
    ]);
  });

  it("want review states and answers in the private index when only the public one registers the instance", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });
    vi.mocked(readRegisteredClasses).mockImplementation(async (indexUrl) =>
      indexUrl === PRIVATE_INDEX ? [] : (SHARED as never),
    );
    const repository = makeRepository();

    await expect(repository.readDataClassRegistrations(args)).resolves.toEqual({
      registrations: [
        ...SHARED.map((dataClass) => ({ dataClass, index: "public", registered: true })),
        ...PRIVATE_ONLY.map((dataClass) => ({ dataClass, index: "private", registered: false })),
      ],
      privateIndexMissing: false,
      unreadableIndexes: [],
    });
    await repository.registerDataClasses({ ...args, title: "Main" });
    expect(addRegistrations).toHaveBeenCalledExactlyOnceWith(
      PRIVATE_INDEX,
      { instanceUrl: CONTAINER, title: "Main", classes: PRIVATE_ONLY },
      expect.any(Function),
      expect.anything(),
    );
  });

  it("leave out an index that cannot be read, and say so", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });
    vi.mocked(readRegisteredClasses).mockImplementation(async (indexUrl) => {
      if (indexUrl === PUBLIC_INDEX) throw new Error("404 Not Found");
      return [];
    });
    const repository = makeRepository();

    await expect(repository.readDataClassRegistrations(args)).resolves.toEqual({
      registrations: PRIVATE_ONLY.map((dataClass) => ({
        dataClass,
        index: "private",
        registered: false,
      })),
      privateIndexMissing: false,
      unreadableIndexes: ["public"],
    });
    await repository.registerDataClasses({ ...args, title: "Main" });
    expect(addRegistrations).toHaveBeenCalledExactlyOnceWith(
      PRIVATE_INDEX,
      { instanceUrl: CONTAINER, title: "Main", classes: PRIVATE_ONLY },
      expect.any(Function),
      expect.anything(),
    );

    vi.mocked(readRegisteredClasses).mockRejectedValue(new Error("403 Forbidden"));
    await expect(repository.readDataClassRegistrations(args)).resolves.toEqual({
      registrations: [],
      privateIndexMissing: false,
      unreadableIndexes: ["private", "public"],
    });
  });

  it("never want review states or answers in the public index, without a private one", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: null,
      publicIndexUrl: PUBLIC_INDEX,
    });
    vi.mocked(readRegisteredClasses).mockResolvedValue(SHARED as never);
    const repository = makeRepository();

    await expect(repository.readDataClassRegistrations(args)).resolves.toEqual({
      registrations: SHARED.map((dataClass) => ({ dataClass, index: "public", registered: true })),
      privateIndexMissing: true,
      unreadableIndexes: [],
    });
    await repository.registerDataClasses({ ...args, title: "Main" });
    expect(addRegistrations).not.toHaveBeenCalled();
  });
});

describe("createInstance", () => {
  const create = (registrationTarget: "private" | "public") =>
    makeRepository().createInstance({
      webId: WEBID,
      containerUrl: "https://alice.example/solid-memo/main",
      name: "Main",
      registrationTarget,
    });

  it("writes meta.ttl, registers every class of its data in the private index, and returns the instance", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });

    const instance = await create("private");

    expect(instance).toEqual({ url: CONTAINER, name: "Main" });

    const [metaUrl, metaDataset] = vi.mocked(writeDocument).mock.calls[0];
    expect(metaUrl).toBe(`${CONTAINER}meta.ttl`);
    const meta = getThing(metaDataset as Dataset, `${CONTAINER}meta.ttl#it`)!;
    expect(getStringNoLocale(meta, DCTERMS.title)).toBe("Main");
    expect(getInteger(meta, SM.formatVersion)).toBe(2);

    expect(createTypeIndex).not.toHaveBeenCalled();
    expect(addRegistrations).toHaveBeenCalledExactlyOnceWith(
      PRIVATE_INDEX,
      { instanceUrl: CONTAINER, title: "Main", classes: ALL },
      expect.any(Function),
      expect.anything(),
    );
    expect(vi.mocked(addRegistrations).mock.calls[0][2]()).toBe("fixed-id");
  });

  it("makes the instance at its address as a request sends it", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });
    const instance = await makeRepository().createInstance({
      webId: WEBID,
      containerUrl: "https://Alice.example/solid-memo/kortlekar-å",
      name: "Kortlekar",
      registrationTarget: "private",
    });
    const url = "https://alice.example/solid-memo/kortlekar-%C3%A5/";
    expect(instance).toEqual({ url, name: "Kortlekar" });
    expect(vi.mocked(writeDocument).mock.calls[0][0]).toBe(`${url}meta.ttl`);
  });

  it("creates the chosen index when there is none", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({ privateIndexUrl: null, publicIndexUrl: null });
    vi.mocked(createTypeIndex).mockResolvedValue(PRIVATE_INDEX);

    await create("private");

    expect(createTypeIndex).toHaveBeenCalledWith("private", WEBID, CONTAINER, expect.anything());
    expect(addRegistrations).toHaveBeenCalledExactlyOnceWith(
      PRIVATE_INDEX,
      expect.objectContaining({ classes: ALL }),
      expect.any(Function),
      expect.anything(),
    );
  });

  it("registers it publicly, its review states and answers in the private index", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });

    await create("public");

    expect(
      vi.mocked(addRegistrations).mock.calls.map((call) => [call[0], call[1].classes]),
    ).toEqual([
      [PUBLIC_INDEX, SHARED],
      [PRIVATE_INDEX, PRIVATE_ONLY],
    ]);
  });

  it("registers its review states and answers nowhere when it is registered publicly without a private index", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({ privateIndexUrl: null, publicIndexUrl: null });
    vi.mocked(createTypeIndex).mockResolvedValue(PUBLIC_INDEX);

    await create("public");

    expect(createTypeIndex).toHaveBeenCalledWith("public", WEBID, CONTAINER, expect.anything());
    expect(addRegistrations).toHaveBeenCalledExactlyOnceWith(
      PUBLIC_INDEX,
      expect.objectContaining({ classes: SHARED }),
      expect.any(Function),
      expect.anything(),
    );
  });

  it("still creates a public instance when the private index refuses its review states and answers", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });
    vi.mocked(addRegistrations).mockImplementation(async (indexUrl) => {
      if (indexUrl === PRIVATE_INDEX) throw new Error("private index refused");
      return [];
    });

    await expect(create("public")).resolves.toEqual({ url: CONTAINER, name: "Main" });
    expect(
      vi.mocked(addRegistrations).mock.calls.map((call) => [call[0], call[1].classes]),
    ).toEqual([
      [PUBLIC_INDEX, SHARED],
      [PRIVATE_INDEX, PRIVATE_ONLY],
    ]);
    expect(removeInstanceRegistrations).not.toHaveBeenCalled();
    expect(deleteContainer).not.toHaveBeenCalled();
  });

  it("cleans up the container and rethrows when registration fails", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({ privateIndexUrl: null, publicIndexUrl: null });
    vi.mocked(createTypeIndex).mockRejectedValue(new Error("cannot create index"));
    // The meta.ttl just written, as the pod serves it: the instance's #it and nothing else.
    vi.mocked(readDocument).mockResolvedValue(readOf(metaWith()));
    await expect(
      makeRepository().createInstance({
        webId: WEBID,
        containerUrl: CONTAINER,
        name: "Main",
        registrationTarget: "private",
      }),
    ).rejects.toThrow("cannot create index");

    expect(removeInstanceRegistrations).not.toHaveBeenCalled();
    expect(deleteSolidDataset).toHaveBeenCalledWith(`${CONTAINER}meta.ttl`, expect.anything());
    expect(deleteContainer).toHaveBeenCalledWith(CONTAINER, expect.anything());
  });

  it("takes back only the instance's own subject of a meta.ttl that holds something else too", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({ privateIndexUrl: null, publicIndexUrl: null });
    vi.mocked(createTypeIndex).mockRejectedValue(new Error("cannot create index"));
    vi.mocked(readDocument).mockResolvedValue(
      readOf(
        metaWith(
          buildThing(createThing({ url: `${META}#note` }))
            .addStringNoLocale(NOTE, "hi")
            .build(),
        ),
      ),
    );
    await expect(
      makeRepository().createInstance({
        webId: WEBID,
        containerUrl: CONTAINER,
        name: "Main",
        registrationTarget: "private",
      }),
    ).rejects.toThrow("cannot create index");

    expect(deleteSolidDataset).not.toHaveBeenCalled();
    const [url, kept] = vi.mocked(writeDocument).mock.calls.at(-1)!;
    expect(url).toBe(META);
    expect(getThing(kept, `${META}#it`)).toBeNull();
    expect(getThing(kept, `${META}#note`)).not.toBeNull();
  });

  it("rethrows the original error even when cleanup fails too", async () => {
    vi.mocked(locateTypeIndexes).mockRejectedValue(new Error("original"));
    vi.mocked(deleteSolidDataset).mockRejectedValue(new Error("cleanup"));

    await expect(
      makeRepository().createInstance({
        webId: WEBID,
        containerUrl: CONTAINER,
        name: "Main",
        registrationTarget: "private",
      }),
    ).rejects.toThrow("original");
  });
});

describe("attachInstance", () => {
  function metaDataset(withTitle: boolean) {
    let thing = buildThing(createThing({ url: `${CONTAINER}meta.ttl#it` }))
      .addIri("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", SM.Instance)
      .addDatetime(DCTERMS.created, new Date("2026-09-21T10:00:00.000Z"));
    if (withTitle) {
      thing = thing.addStringNoLocale(DCTERMS.title, "Attached");
    }
    return setThing(datasetFrom(`${CONTAINER}meta.ttl`), thing.build());
  }

  it("registers an existing instance, and nothing else of it, and returns its name", async () => {
    vi.mocked(readDocument).mockResolvedValue(readOf(metaDataset(true)));
    vi.mocked(ensureTypeIndex).mockResolvedValue(PRIVATE_INDEX);

    await expect(
      makeRepository().attachInstance({
        webId: WEBID,
        instanceUrl: "https://alice.example/solid-memo/main",
        registrationTarget: "public",
      }),
    ).resolves.toEqual({ url: CONTAINER, name: "Attached" });

    expect(ensureTypeIndex).toHaveBeenCalledWith("public", WEBID, CONTAINER, expect.anything());
    expect(addRegistrations).toHaveBeenCalledExactlyOnceWith(
      PRIVATE_INDEX,
      { instanceUrl: CONTAINER, title: "Attached", classes: ["instance"] },
      expect.any(Function),
      expect.anything(),
    );
  });

  it("falls back to the container slug when meta.ttl has no title", async () => {
    vi.mocked(readDocument).mockResolvedValue(readOf(metaDataset(false)));
    vi.mocked(ensureTypeIndex).mockResolvedValue(PRIVATE_INDEX);

    await expect(
      makeRepository().attachInstance({
        webId: WEBID,
        instanceUrl: CONTAINER,
        registrationTarget: "private",
      }),
    ).resolves.toEqual({ url: CONTAINER, name: "main" });
  });

  it("rejects a container without a readable meta.ttl", async () => {
    vi.mocked(readDocument).mockRejectedValue(new Error("404"));

    await expect(
      makeRepository().attachInstance({
        webId: WEBID,
        instanceUrl: CONTAINER,
        registrationTarget: "private",
      }),
    ).rejects.toThrow("not a Solid Memo instance");
  });

  it("registers the instance at its address as a request sends it, and no address that is not an http(s) folder's", async () => {
    vi.mocked(readDocument).mockResolvedValue(readOf(metaDataset(true)));
    vi.mocked(ensureTypeIndex).mockResolvedValue(PRIVATE_INDEX);
    await expect(
      makeRepository().attachInstance({
        webId: WEBID,
        instanceUrl: "HTTPS://Alice.example:443/solid-memo/x/../main",
        registrationTarget: "private",
      }),
    ).resolves.toEqual({ url: CONTAINER, name: "Attached" });
    vi.mocked(readDocument).mockClear();
    for (const instanceUrl of ["not an address", "urn:x:main", `${CONTAINER}?x`]) {
      await expect(
        makeRepository().attachInstance({
          webId: WEBID,
          instanceUrl,
          registrationTarget: "private",
        }),
      ).rejects.toMatchObject({ code: "notAnInstanceNoMeta", vars: { url: instanceUrl } });
    }
    expect(readDocument).not.toHaveBeenCalled();
  });

  it("rejects a meta.ttl without the #it subject", async () => {
    vi.mocked(readDocument).mockResolvedValue(readOf(datasetFrom(`${CONTAINER}meta.ttl`)));

    await expect(
      makeRepository().attachInstance({
        webId: WEBID,
        instanceUrl: CONTAINER,
        registrationTarget: "private",
      }),
    ).rejects.toThrow("its description cannot be read");
  });
});

describe("deleteInstance", () => {
  const instance = { url: "https://alice.example/solid-memo/main", name: "Main" };

  it("deletes the instance's data, then unregisters it from both indexes, saying what it kept", async () => {
    const order: string[] = [];
    vi.mocked(deleteInstanceData).mockImplementation(async (url) => {
      order.push(`data ${url}`);
      return { keptFolder: CONTAINER, keptReleases: false, keptDocuments: [] };
    });
    vi.mocked(removeInstanceRegistrations).mockImplementation(async (index) => {
      order.push(`unregister ${index}`);
    });
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });

    await expect(makeRepository().deleteInstance({ webId: WEBID, instance })).resolves.toEqual({
      keptFolder: CONTAINER,
      keptReleases: false,
      keptDocuments: [],
    });

    expect(order).toEqual([
      `data ${CONTAINER}`,
      `unregister ${PRIVATE_INDEX}`,
      `unregister ${PUBLIC_INDEX}`,
    ]);
    expect(removeInstanceRegistrations).toHaveBeenCalledWith(
      PRIVATE_INDEX,
      CONTAINER,
      expect.anything(),
    );
  });

  it("unregisters it from the one index there is", async () => {
    vi.mocked(deleteInstanceData).mockResolvedValue({
      keptFolder: null,
      keptReleases: false,
      keptDocuments: [],
    });
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: null,
      publicIndexUrl: PUBLIC_INDEX,
    });

    await expect(makeRepository().deleteInstance({ webId: WEBID, instance })).resolves.toEqual({
      keptFolder: null,
      keptReleases: false,
      keptDocuments: [],
    });

    expect(removeInstanceRegistrations).toHaveBeenCalledOnce();
    expect(removeInstanceRegistrations).toHaveBeenCalledWith(
      PUBLIC_INDEX,
      CONTAINER,
      expect.anything(),
    );
  });

  it("deletes the data through its own fetch, the registrations through the pod's", async () => {
    vi.mocked(deleteInstanceData).mockResolvedValue({
      keptFolder: null,
      keptReleases: false,
      keptDocuments: [],
    });
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: null,
    });
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    const dataFetch = vi.fn() as unknown as typeof globalThis.fetch;
    const repository = createSolidInstanceRepository({
      fetch,
      dataFetch,
      now: () => new Date(),
      randomId: () => "fixed-id",
    });

    await repository.deleteInstance({ webId: WEBID, instance });

    expect(deleteInstanceData).toHaveBeenCalledWith(CONTAINER, dataFetch);
    expect(locateTypeIndexes).toHaveBeenCalledWith(WEBID, fetch);
    expect(removeInstanceRegistrations).toHaveBeenCalledWith(PRIVATE_INDEX, CONTAINER, fetch);
  });

  it("keeps the registration when deleting the data fails", async () => {
    vi.mocked(deleteInstanceData).mockRejectedValue(new Error("403"));

    await expect(makeRepository().deleteInstance({ webId: WEBID, instance })).rejects.toThrow(
      "403",
    );

    expect(removeInstanceRegistrations).not.toHaveBeenCalled();
  });
});

describe("readMeta and upgradeMeta", () => {
  const META = `${CONTAINER}meta.ttl`;
  const meta = { name: "Main", createdAt: "2026-09-21T10:00:00.000Z", formatVersion: 1 };

  function metaDataset() {
    return setThing(
      datasetFrom(META),
      buildThing(createThing({ url: `${META}#it` }))
        .addIri("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", SM.Instance)
        .addStringNoLocale(DCTERMS.title, "Main")
        .addDatetime(DCTERMS.created, new Date(meta.createdAt))
        .addStringNoLocale("https://other.example/#note", "kept")
        .build(),
    );
  }

  it("reads the meta document, null when it is missing or has no subject", async () => {
    vi.mocked(readDocument).mockResolvedValue(readOf(metaDataset()));
    await expect(makeRepository().readMeta(CONTAINER)).resolves.toEqual(meta);
    vi.mocked(readDocument).mockRejectedValue({ statusCode: 404 });
    await expect(makeRepository().readMeta(CONTAINER)).resolves.toBeNull();
    vi.mocked(readDocument).mockResolvedValue(readOf(datasetFrom(META)));
    await expect(makeRepository().readMeta(CONTAINER)).resolves.toBeNull();
  });

  it("brings an outdated subject up to this app's format as read, in place, checked first", async () => {
    vi.mocked(readDocument).mockResolvedValue(readOf(metaDataset()));
    const checkWrite = vi.fn(async () => undefined);
    await expect(makeRepository(checkWrite).upgradeMeta(CONTAINER)).resolves.toBe(true);
    const [url, saved] = vi.mocked(writeDocument).mock.calls[0];
    expect(url).toBe(META);
    const thing = getThing(saved as Dataset, `${META}#it`)!;
    expect(getStringNoLocale(thing, DCTERMS.title)).toBe("Main");
    expect(getStringNoLocale(thing, "https://other.example/#note")).toBe("kept");
    expect(getInteger(thing, SM.formatVersion)).toBe(2);
    expect(checkWrite).toHaveBeenCalledWith(saved, [`${META}#it`], "pod");
  });

  it("writes nothing for a subject up to date, missing or unreadable, or no meta document", async () => {
    vi.mocked(readDocument).mockResolvedValue(
      readOf(
        setThing(
          metaDataset(),
          buildThing(getThing(metaDataset(), `${META}#it`)!)
            .setInteger(SM.formatVersion, 2)
            .build(),
        ),
      ),
    );
    await expect(makeRepository().upgradeMeta(CONTAINER)).resolves.toBe(false);
    vi.mocked(readDocument).mockResolvedValue(readOf(datasetFrom(META)));
    await expect(makeRepository().upgradeMeta(CONTAINER)).resolves.toBe(false);
    vi.mocked(readDocument).mockResolvedValue(
      readOf(
        setThing(
          datasetFrom(META),
          buildThing(createThing({ url: `${META}#it` }))
            .addIri("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", SM.Instance)
            .build(),
        ),
      ),
    );
    await expect(makeRepository().upgradeMeta(CONTAINER)).resolves.toBe(false);
    vi.mocked(readDocument).mockRejectedValue({ statusCode: 404 });
    await expect(makeRepository().upgradeMeta(CONTAINER)).resolves.toBe(false);
    expect(writeDocument).not.toHaveBeenCalled();
  });
});

describe("renameRegistrations", () => {
  it("renames the instance's registrations in each type index there is", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: null,
      publicIndexUrl: PUBLIC_INDEX,
    });
    vi.mocked(renameInstanceRegistrations).mockReset().mockResolvedValue(undefined);
    await makeRepository().renameRegistrations({
      webId: WEBID,
      instanceUrl: CONTAINER,
      title: "Languages",
    });
    expect(vi.mocked(renameInstanceRegistrations).mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [PUBLIC_INDEX, { containerUrl: CONTAINER, title: "Languages" }],
    ]);
  });
});

describe("saveMeta", () => {
  const META = `${CONTAINER}meta.ttl`;
  const meta = { name: "Main", createdAt: "2026-09-21T10:00:00.000Z", formatVersion: 1 };

  it("rewrites the subject in place, keeping foreign triples, checked first", async () => {
    vi.mocked(readDocument).mockResolvedValue(
      readOf(
        setThing(
          datasetFrom(META),
          buildThing(createThing({ url: `${META}#it` }))
            .addIri("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", SM.Instance)
            .addStringNoLocale(DCTERMS.title, "Main")
            .addDatetime(DCTERMS.created, new Date(meta.createdAt))
            .addStringNoLocale("https://other.example/#note", "kept")
            .build(),
        ),
      ),
    );
    const checkWrite = vi.fn(async () => undefined);
    await makeRepository(checkWrite).saveMeta(CONTAINER, { ...meta, name: "Renamed" });
    const [url, saved] = vi.mocked(writeDocument).mock.calls[0];
    expect(url).toBe(META);
    const thing = getThing(saved as Dataset, `${META}#it`)!;
    expect(getStringNoLocale(thing, DCTERMS.title)).toBe("Renamed");
    expect(getStringNoLocale(thing, "https://other.example/#note")).toBe("kept");
    expect(getInteger(thing, SM.formatVersion)).toBe(2);
    expect(checkWrite).toHaveBeenCalledWith(saved, [`${META}#it`], "pod");
  });

  it("refuses to save when the meta document or its subject is missing", async () => {
    vi.mocked(readDocument).mockRejectedValue({ statusCode: 404 });
    await expect(makeRepository().saveMeta(CONTAINER, meta)).rejects.toMatchObject({
      code: "noMetaToUpdate",
    });
    vi.mocked(readDocument).mockResolvedValue(readOf(datasetFrom(META)));
    await expect(makeRepository().saveMeta(CONTAINER, meta)).rejects.toMatchObject({
      code: "noMetaToUpdate",
    });
    expect(writeDocument).not.toHaveBeenCalled();
  });
});
