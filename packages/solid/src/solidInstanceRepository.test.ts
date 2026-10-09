import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  deleteContainer,
  deleteSolidDataset,
  getInteger,
  getSolidDataset,
  getStringNoLocale,
  getThing,
  mockSolidDatasetFrom,
  saveSolidDatasetAt,
  setThing,
  type SolidDataset,
} from "@inrupt/solid-client";
import { createSolidInstanceRepository } from "./solidInstanceRepository";
import {
  addCatalogRegistration,
  addInstanceRegistration,
  ensureTypeIndex,
  locateTypeIndexes,
  readInstanceRegistrations,
  removeInstanceRegistrations,
  switchInstanceRegistrations,
} from "./typeIndex";
import { DCTERMS, SM } from "./vocab";
import { deleteInstanceData } from "./instanceData";

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@inrupt/solid-client")>();
  return {
    ...actual,
    getSolidDataset: vi.fn(),
    saveSolidDatasetAt: vi.fn(),
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

function makeRepository() {
  return createSolidInstanceRepository({
    fetch: vi.fn() as unknown as typeof globalThis.fetch,
    now: () => new Date("2026-09-21T10:00:00.000Z"),
    randomId: () => "fixed-id",
  });
}

beforeEach(() => {
  vi.mocked(getSolidDataset).mockReset();
  vi.mocked(saveSolidDatasetAt).mockReset();
  vi.mocked(deleteSolidDataset).mockReset();
  vi.mocked(deleteContainer).mockReset();
  vi.mocked(locateTypeIndexes).mockReset();
  vi.mocked(ensureTypeIndex).mockReset();
  vi.mocked(readInstanceRegistrations).mockReset();
  vi.mocked(addInstanceRegistration).mockReset();
  vi.mocked(addCatalogRegistration).mockReset();
  vi.mocked(switchInstanceRegistrations).mockReset();
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
      .mockResolvedValueOnce([
        { containerUrl: CONTAINER, title: "Duplicate" },
      ]);

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
    vi.mocked(readInstanceRegistrations).mockRejectedValue(
      new Error("403 Forbidden"),
    );

    await expect(makeRepository().listInstances(WEBID)).resolves.toEqual([]);
  });
});

describe("getRegistrationOptions", () => {
  it("maps index locations to existence flags", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: null,
      publicIndexUrl: "https://alice.example/settings/publicTypeIndex.ttl",
    });
    await expect(
      makeRepository().getRegistrationOptions(WEBID),
    ).resolves.toEqual({
      privateIndexExists: false,
      publicIndexExists: true,
    });
  });
});

describe("switchInstance", () => {
  const COPY = "https://alice.example/solid-memo/main-0f3a/";
  const args = { webId: WEBID, from: CONTAINER, to: COPY, title: "Main" };
  const both = { privateIndexUrl: PRIVATE_INDEX, publicIndexUrl: PUBLIC_INDEX };

  it("switches every index that registers the instance", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue(both);
    vi.mocked(switchInstanceRegistrations).mockImplementation(async (url) => url === PRIVATE_INDEX);
    await makeRepository().switchInstance(args);
    expect(vi.mocked(switchInstanceRegistrations).mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [PRIVATE_INDEX, { from: CONTAINER, to: COPY, title: "Main", catalogId: "sm-cat-fixed-id" }],
      [PUBLIC_INDEX, { from: CONTAINER, to: COPY, title: "Main", catalogId: "sm-cat-fixed-id" }],
    ]);
  });

  it("switches the earlier indexes back when a later one fails, even if a switch back fails too", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue(both);
    vi.mocked(switchInstanceRegistrations)
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("public index refused"))
      .mockRejectedValueOnce(new Error("revert refused"));
    await expect(makeRepository().switchInstance(args)).rejects.toThrow("public index refused");
    expect(vi.mocked(switchInstanceRegistrations).mock.calls[2]).toEqual([
      PRIVATE_INDEX,
      { from: COPY, to: CONTAINER, title: "Main", catalogId: "sm-cat-fixed-id" },
      expect.anything(),
    ]);
  });

  it("refuses an instance no index registers", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({ privateIndexUrl: PRIVATE_INDEX, publicIndexUrl: null });
    vi.mocked(switchInstanceRegistrations).mockResolvedValue(false);
    await expect(makeRepository().switchInstance(args)).rejects.toThrow(
      `That instance is no longer on your list of instances, so there is nothing to switch. Reload the page and try again.\nurl: ${CONTAINER}`,
    );
  });
});

describe("registerCatalog", () => {
  it("registers the catalogue in each type index that registers the instance", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });
    vi.mocked(readInstanceRegistrations).mockImplementation(async (indexUrl) =>
      indexUrl === PRIVATE_INDEX ? [{ containerUrl: "https://alice.example/solid-memo/main", title: "Main" }] : [],
    );
    await makeRepository().registerCatalog({ webId: WEBID, instanceUrl: CONTAINER, title: "Main" });
    expect(addCatalogRegistration).toHaveBeenCalledExactlyOnceWith(
      PRIVATE_INDEX,
      { id: "sm-cat-fixed-id", catalogUrl: `${CONTAINER}catalog.ttl#catalog`, title: "Main" },
      expect.anything(),
    );
  });

  it("registers nothing without a type index", async () => {
    vi.mocked(locateTypeIndexes).mockResolvedValue({ privateIndexUrl: null, publicIndexUrl: null });
    await makeRepository().registerCatalog({ webId: WEBID, instanceUrl: CONTAINER, title: "Main" });
    expect(addCatalogRegistration).not.toHaveBeenCalled();
  });
});

describe("createInstance", () => {
  it("writes meta.ttl, registers the container, and returns the instance", async () => {
    vi.mocked(ensureTypeIndex).mockResolvedValue(PRIVATE_INDEX);

    const instance = await makeRepository().createInstance({
      webId: WEBID,
      containerUrl: "https://alice.example/solid-memo/main",
      name: "Main",
      registrationTarget: "private",
    });

    expect(instance).toEqual({ url: CONTAINER, name: "Main" });

    const [metaUrl, metaDataset] =
      vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(metaUrl).toBe(`${CONTAINER}meta.ttl`);
    const meta = getThing(
      metaDataset as SolidDataset,
      `${CONTAINER}meta.ttl#it`,
    )!;
    expect(getStringNoLocale(meta, DCTERMS.title)).toBe("Main");
    expect(getInteger(meta, SM.formatVersion)).toBe(2);

    expect(ensureTypeIndex).toHaveBeenCalledWith(
      "private",
      WEBID,
      CONTAINER,
      expect.anything(),
    );
    expect(addInstanceRegistration).toHaveBeenCalledWith(
      PRIVATE_INDEX,
      { id: "sm-inst-fixed-id", containerUrl: CONTAINER, title: "Main" },
      expect.anything(),
    );
    expect(addCatalogRegistration).toHaveBeenCalledWith(
      PRIVATE_INDEX,
      { id: "sm-cat-fixed-id", catalogUrl: `${CONTAINER}catalog.ttl#catalog`, title: "Main" },
      expect.anything(),
    );
  });

  it("cleans up the container and rethrows when registration fails", async () => {
    vi.mocked(ensureTypeIndex).mockRejectedValue(
      new Error("cannot create index"),
    );

    await expect(
      makeRepository().createInstance({
        webId: WEBID,
        containerUrl: CONTAINER,
        name: "Main",
        registrationTarget: "private",
      }),
    ).rejects.toThrow("cannot create index");

    expect(deleteSolidDataset).toHaveBeenCalledWith(
      `${CONTAINER}meta.ttl`,
      expect.anything(),
    );
    expect(deleteContainer).toHaveBeenCalledWith(
      CONTAINER,
      expect.anything(),
    );
  });

  it("rethrows the original error even when cleanup fails too", async () => {
    vi.mocked(ensureTypeIndex).mockRejectedValue(new Error("original"));
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
    let thing = buildThing(
      createThing({ url: `${CONTAINER}meta.ttl#it` }),
    )
      .addIri("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", SM.Instance)
      .addDatetime(DCTERMS.created, new Date("2026-09-21T10:00:00.000Z"));
    if (withTitle) {
      thing = thing.addStringNoLocale(DCTERMS.title, "Attached");
    }
    return setThing(
      mockSolidDatasetFrom(`${CONTAINER}meta.ttl`),
      thing.build(),
    );
  }

  it("registers an existing instance and returns its name", async () => {
    vi.mocked(getSolidDataset).mockResolvedValue(metaDataset(true));
    vi.mocked(ensureTypeIndex).mockResolvedValue(PRIVATE_INDEX);
    vi.mocked(readInstanceRegistrations).mockResolvedValue([]);

    await expect(
      makeRepository().attachInstance({
        webId: WEBID,
        instanceUrl: "https://alice.example/solid-memo/main",
        registrationTarget: "public",
      }),
    ).resolves.toEqual({ url: CONTAINER, name: "Attached" });

    expect(addInstanceRegistration).toHaveBeenCalledWith(
      PRIVATE_INDEX,
      { id: "sm-inst-fixed-id", containerUrl: CONTAINER, title: "Attached" },
      expect.anything(),
    );
  });

  it("is idempotent when the container is already registered", async () => {
    vi.mocked(getSolidDataset).mockResolvedValue(metaDataset(true));
    vi.mocked(ensureTypeIndex).mockResolvedValue(PRIVATE_INDEX);
    vi.mocked(readInstanceRegistrations).mockResolvedValue([
      { containerUrl: CONTAINER, title: "Attached" },
    ]);

    await makeRepository().attachInstance({
      webId: WEBID,
      instanceUrl: CONTAINER,
      registrationTarget: "private",
    });
    expect(addInstanceRegistration).not.toHaveBeenCalled();
  });

  it("falls back to the container slug when meta.ttl has no title", async () => {
    vi.mocked(getSolidDataset).mockResolvedValue(metaDataset(false));
    vi.mocked(ensureTypeIndex).mockResolvedValue(PRIVATE_INDEX);
    vi.mocked(readInstanceRegistrations).mockResolvedValue([]);

    await expect(
      makeRepository().attachInstance({
        webId: WEBID,
        instanceUrl: CONTAINER,
        registrationTarget: "private",
      }),
    ).resolves.toEqual({ url: CONTAINER, name: "main" });
  });

  it("rejects a container without a readable meta.ttl", async () => {
    vi.mocked(getSolidDataset).mockRejectedValue(new Error("404"));

    await expect(
      makeRepository().attachInstance({
        webId: WEBID,
        instanceUrl: CONTAINER,
        registrationTarget: "private",
      }),
    ).rejects.toThrow("not a Solid Memo instance");
  });

  it("rejects a meta.ttl without the #it subject", async () => {
    vi.mocked(getSolidDataset).mockResolvedValue(
      mockSolidDatasetFrom(`${CONTAINER}meta.ttl`),
    );

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
      return { keptFolder: CONTAINER };
    });
    vi.mocked(removeInstanceRegistrations).mockImplementation(async (index) => {
      order.push(`unregister ${index}`);
    });
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: PRIVATE_INDEX,
      publicIndexUrl: PUBLIC_INDEX,
    });

    await expect(makeRepository().deleteInstance({ webId: WEBID, instance })).resolves.toEqual({ keptFolder: CONTAINER });

    expect(order).toEqual([`data ${CONTAINER}`, `unregister ${PRIVATE_INDEX}`, `unregister ${PUBLIC_INDEX}`]);
    expect(removeInstanceRegistrations).toHaveBeenCalledWith(PRIVATE_INDEX, CONTAINER, expect.anything());
  });

  it("unregisters it from the one index there is", async () => {
    vi.mocked(deleteInstanceData).mockResolvedValue({ keptFolder: null });
    vi.mocked(locateTypeIndexes).mockResolvedValue({
      privateIndexUrl: null,
      publicIndexUrl: PUBLIC_INDEX,
    });

    await expect(makeRepository().deleteInstance({ webId: WEBID, instance })).resolves.toEqual({ keptFolder: null });

    expect(removeInstanceRegistrations).toHaveBeenCalledOnce();
    expect(removeInstanceRegistrations).toHaveBeenCalledWith(PUBLIC_INDEX, CONTAINER, expect.anything());
  });

  it("keeps the registration when deleting the data fails", async () => {
    vi.mocked(deleteInstanceData).mockRejectedValue(new Error("403"));

    await expect(makeRepository().deleteInstance({ webId: WEBID, instance })).rejects.toThrow("403");

    expect(removeInstanceRegistrations).not.toHaveBeenCalled();
  });

  it("deletes an instance's data alone, its registrations left as they are", async () => {
    vi.mocked(deleteInstanceData).mockResolvedValue({ keptFolder: null });

    await expect(makeRepository().deleteInstanceData(CONTAINER)).resolves.toEqual({ keptFolder: null });

    expect(deleteInstanceData).toHaveBeenCalledWith(CONTAINER, expect.anything());
    expect(locateTypeIndexes).not.toHaveBeenCalled();
    expect(removeInstanceRegistrations).not.toHaveBeenCalled();
  });
});

describe("readMeta and saveMeta", () => {
  const META = `${CONTAINER}meta.ttl`;
  const meta = { name: "Main", createdAt: "2026-09-21T10:00:00.000Z", formatVersion: 1 };

  function metaDataset() {
    return setThing(
      mockSolidDatasetFrom(META),
      buildThing(createThing({ url: `${META}#it` }))
        .addIri("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", SM.Instance)
        .addStringNoLocale(DCTERMS.title, "Main")
        .addDatetime(DCTERMS.created, new Date(meta.createdAt))
        .addStringNoLocale("https://other.example/#note", "kept")
        .build(),
    );
  }

  it("reads the meta document, null when it is missing or has no subject", async () => {
    vi.mocked(getSolidDataset).mockResolvedValue(metaDataset());
    await expect(makeRepository().readMeta(CONTAINER)).resolves.toEqual(meta);
    vi.mocked(getSolidDataset).mockRejectedValue({ statusCode: 404 });
    await expect(makeRepository().readMeta(CONTAINER)).resolves.toBeNull();
    vi.mocked(getSolidDataset).mockResolvedValue(mockSolidDatasetFrom(META));
    await expect(makeRepository().readMeta(CONTAINER)).resolves.toBeNull();
  });

  it("rewrites the subject in place, keeping foreign triples", async () => {
    vi.mocked(getSolidDataset).mockResolvedValue(metaDataset());
    await makeRepository().saveMeta(CONTAINER, { ...meta, name: "Renamed" });
    const [url, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(url).toBe(META);
    const thing = getThing(saved as SolidDataset, `${META}#it`)!;
    expect(getStringNoLocale(thing, DCTERMS.title)).toBe("Renamed");
    expect(getStringNoLocale(thing, "https://other.example/#note")).toBe("kept");
    expect(getInteger(thing, SM.formatVersion)).toBe(2);
  });

  it("refuses to save when the meta document or its subject is missing", async () => {
    vi.mocked(getSolidDataset).mockRejectedValue({ statusCode: 404 });
    await expect(makeRepository().saveMeta(CONTAINER, meta)).rejects.toThrow(
      `This instance has no description to update. Reload the page and try again.\nurl: ${CONTAINER}`,
    );
    vi.mocked(getSolidDataset).mockResolvedValue(mockSolidDatasetFrom(META));
    await expect(makeRepository().saveMeta(CONTAINER, meta)).rejects.toThrow(
      "has no description to update.",
    );
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});
