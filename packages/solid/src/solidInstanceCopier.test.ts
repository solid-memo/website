import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createContainerAt,
  createThing,
  deleteContainer,
  deleteFile,
  getFile,
  getSolidDataset,
  getThing,
  getUrl,
  getDatetime,
  mockContainerFrom,
  mockSolidDatasetFrom,
  overwriteFile,
  saveSolidDatasetAt,
  setThing,
  type SolidDataset,
} from "@inrupt/solid-client";
import { getSolidDatasetOrNull } from "./datasets";
import { createSolidInstanceCopier } from "./solidInstanceCopier";

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inrupt/solid-client")>();
  return {
    ...actual,
    createContainerAt: vi.fn(),
    deleteContainer: vi.fn(),
    deleteFile: vi.fn(),
    getFile: vi.fn(),
    getSolidDataset: vi.fn(),
    overwriteFile: vi.fn(),
    saveSolidDatasetAt: vi.fn(),
  };
});
vi.mock("./datasets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./datasets")>()),
  getSolidDatasetOrNull: vi.fn(),
}));

const FROM = "https://pod.example/solid-memo/main/";
const TO = "https://pod.example/solid-memo/main-0f3a/";
const MOVE = { from: FROM, to: TO };
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const LDP_CONTAINS = "http://www.w3.org/ns/ldp#contains";

/** A fetch that answers HEAD and GET requests from a table of URL → response parts. */
function fetchOf(responses: Record<string, { status?: number; headers?: Record<string, string>; body?: string }>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const response = responses[String(input)] ?? { status: 404 };
    return new Response(response.body ?? null, { status: response.status ?? 200, headers: response.headers });
  }) as unknown as typeof fetch;
}

function copier(fetch = fetchOf({})) {
  return createSolidInstanceCopier({ fetch });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("ensureAbsent", () => {
  it("passes when nothing is there, and refuses a URL in use or unreadable", async () => {
    await expect(copier().ensureAbsent(TO)).resolves.toBeUndefined();
    await expect(copier(fetchOf({ [TO]: {} })).ensureAbsent(TO)).rejects.toThrow(`Something is already kept at that place in your Pod. Choose another place.\nurl: ${TO}`);
    await expect(copier(fetchOf({ [TO]: { status: 403 } })).ensureAbsent(TO)).rejects.toThrow(
      `Solid Memo could not check your Pod. Check your connection and try again.\nurl: ${TO}\nstatus: 403`,
    );
  });
});

describe("copyResource", () => {
  it("creates a container for a container, and for the new instance itself", async () => {
    await copier().copyResource(`${FROM}decks/`, `${TO}decks/`, MOVE);
    expect(createContainerAt).toHaveBeenCalledWith(`${TO}decks/`, expect.anything());
    await copier().createContainer(TO);
    expect(createContainerAt).toHaveBeenLastCalledWith(TO, expect.anything());
  });

  it("copies a Turtle document with every IRI under the old container moved, and nothing else", async () => {
    vi.mocked(getSolidDataset).mockResolvedValue(
      setThing(
        mockSolidDatasetFrom(`${FROM}catalog.ttl`),
        buildThing(createThing({ url: `${FROM}catalog.ttl#deck-1` }))
          .addIri(`${SM}cardsDocument`, `${FROM}decks/deck-1.ttl`)
          .addIri("http://www.w3.org/ns/prov#wasDerivedFrom", "https://solid-memo.com/decks/capitals/v1.ttl")
          .addDatetime("http://purl.org/dc/terms/created", new Date("2026-09-21T10:00:00.000Z"))
          .build(),
      ) as never,
    );
    const fetch = fetchOf({ [`${FROM}catalog.ttl`]: { headers: { "Content-Type": "text/turtle; charset=utf-8" } } });
    await copier(fetch).copyResource(`${FROM}catalog.ttl`, `${TO}catalog.ttl`, MOVE);
    const [url, saved] = vi.mocked(saveSolidDatasetAt).mock.calls[0];
    expect(url).toBe(`${TO}catalog.ttl`);
    expect(getThing(saved as SolidDataset, `${FROM}catalog.ttl#deck-1`)).toBeNull();
    const deck = getThing(saved as SolidDataset, `${TO}catalog.ttl#deck-1`)!;
    expect(getUrl(deck, `${SM}cardsDocument`)).toBe(`${TO}decks/deck-1.ttl`);
    expect(getUrl(deck, "http://www.w3.org/ns/prov#wasDerivedFrom")).toBe("https://solid-memo.com/decks/capitals/v1.ttl");
    expect(getDatetime(deck, "http://purl.org/dc/terms/created")?.toISOString()).toBe("2026-09-21T10:00:00.000Z");
  });

  it("renames the IRIs it is told to, wherever they are", async () => {
    const guest = "https://guest.example/profile/card#me";
    const user = "https://alice.example/profile/card#me";
    vi.mocked(getSolidDataset).mockResolvedValue(
      setThing(
        mockSolidDatasetFrom(`${FROM}catalog.ttl`),
        buildThing(createThing({ url: `${FROM}catalog.ttl#catalog` }))
          .addIri("http://purl.org/dc/terms/publisher", guest)
          .addIri("http://purl.org/dc/terms/rightsHolder", "https://someone.example/#me")
          .build(),
      ) as never,
    );
    const fetch = fetchOf({ [`${FROM}catalog.ttl`]: { headers: { "Content-Type": "text/turtle" } } });
    await copier(fetch).copyResource(`${FROM}catalog.ttl`, `${TO}catalog.ttl`, { ...MOVE, renames: { [guest]: user } });
    const saved = vi.mocked(saveSolidDatasetAt).mock.calls[0]![1] as SolidDataset;
    const catalog = getThing(saved, `${TO}catalog.ttl#catalog`)!;
    expect(getUrl(catalog, "http://purl.org/dc/terms/publisher")).toBe(user);
    expect(getUrl(catalog, "http://purl.org/dc/terms/rightsHolder")).toBe("https://someone.example/#me");
  });

  it("copies any other file byte for byte, with its content type", async () => {
    const picture = new Blob(["png"], { type: "image/png" });
    vi.mocked(getFile).mockResolvedValue(picture as never);
    const fetch = fetchOf({ [`${FROM}flag.png`]: { headers: { "Content-Type": "image/png" } } });
    await copier(fetch).copyResource(`${FROM}flag.png`, `${TO}flag.png`, MOVE);
    expect(overwriteFile).toHaveBeenCalledWith(`${TO}flag.png`, picture, expect.objectContaining({ contentType: "image/png" }));
    await copier(fetchOf({ [`${FROM}x`]: {} })).copyResource(`${FROM}x`, `${TO}x`, MOVE);
    expect(overwriteFile).toHaveBeenLastCalledWith(`${TO}x`, picture, expect.objectContaining({ contentType: "image/png" }));
  });
});

describe("the version a copy was made from", () => {
  /** A fetch answering from a table, recording each request's method and headers. */
  function recordingFetch(responses: Record<string, { status?: number; headers?: Record<string, string>; body?: string }>) {
    const requests: { url: string; method: string; headers: Headers }[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), method: init?.method ?? "GET", headers: new Headers(init?.headers) });
      const response = responses[String(input)] ?? { status: 404 };
      return new Response(response.body ?? null, { status: response.status ?? 200, headers: response.headers });
    }) as unknown as typeof globalThis.fetch;
    return { fetch, requests };
  }

  it("is taken from the response the copy was made from, and checked with If-None-Match and the same Accept", async () => {
    const source = recordingFetch({
      [`${FROM}catalog.ttl`]: { headers: { "Content-Type": "text/turtle", ETag: '"v1-text/turtle"' } },
    });
    vi.mocked(getSolidDataset).mockImplementation((async (url: string, options: { fetch: typeof fetch }) => {
      await options.fetch(url, { headers: { Accept: "text/turtle" } });
      return mockSolidDatasetFrom(url);
    }) as never);
    const version = await copier(source.fetch).copyResource(`${FROM}catalog.ttl`, `${TO}catalog.ttl`, MOVE);

    const now = (status: number, etag?: string) =>
      recordingFetch({ [`${FROM}catalog.ttl`]: { status, headers: etag === undefined ? {} : { ETag: etag } } });
    const unchanged = now(304);
    await expect(copier(unchanged.fetch).isUnchanged(`${FROM}catalog.ttl`, version)).resolves.toBe(true);
    expect(unchanged.requests[0]!.method).toBe("HEAD");
    expect(unchanged.requests[0]!.headers.get("If-None-Match")).toBe('"v1-text/turtle"');
    expect(unchanged.requests[0]!.headers.get("Accept")).toBe("text/turtle");
    // A pod that ignores the condition answers 200, with the ETag it has now.
    await expect(copier(now(200, '"v1-text/turtle"').fetch).isUnchanged(`${FROM}catalog.ttl`, version)).resolves.toBe(true);
    await expect(copier(now(200, '"v2-text/turtle"').fetch).isUnchanged(`${FROM}catalog.ttl`, version)).resolves.toBe(false);
    await expect(copier(now(404).fetch).isUnchanged(`${FROM}catalog.ttl`, version)).resolves.toBe(false);
  });

  it("falls back to Last-Modified (If-Modified-Since), then to a hash of the body", async () => {
    const date = "Mon, 28 Sep 2026 10:00:00 GMT";
    vi.mocked(getFile).mockImplementation((async (url: string, options: { fetch: typeof fetch }) => {
      await options.fetch(url);
      return new Blob(["png"]);
    }) as never);
    const dated = await copier(recordingFetch({ [`${FROM}a.png`]: { headers: { "Last-Modified": date } } }).fetch).copyResource(
      `${FROM}a.png`,
      `${TO}a.png`,
      MOVE,
    );
    const check = recordingFetch({ [`${FROM}a.png`]: { status: 304 } });
    await expect(copier(check.fetch).isUnchanged(`${FROM}a.png`, dated)).resolves.toBe(true);
    expect(check.requests[0]!.headers.get("If-Modified-Since")).toBe(date);
    await expect(
      copier(recordingFetch({ [`${FROM}a.png`]: { headers: { "Last-Modified": date } } }).fetch).isUnchanged(`${FROM}a.png`, dated),
    ).resolves.toBe(true);
    await expect(
      copier(recordingFetch({ [`${FROM}a.png`]: { headers: { "Last-Modified": "Tue, 29 Sep 2026 10:00:00 GMT" } } }).fetch).isUnchanged(
        `${FROM}a.png`,
        dated,
      ),
    ).resolves.toBe(false);

    const hashed = await copier(recordingFetch({ [`${FROM}b.png`]: { body: "abc" } }).fetch).copyResource(`${FROM}b.png`, `${TO}b.png`, MOVE);
    expect(JSON.parse(hashed).sha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    await expect(copier(recordingFetch({ [`${FROM}b.png`]: { body: "abc" } }).fetch).isUnchanged(`${FROM}b.png`, hashed)).resolves.toBe(true);
    await expect(copier(recordingFetch({ [`${FROM}b.png`]: { body: "abd" } }).fetch).isUnchanged(`${FROM}b.png`, hashed)).resolves.toBe(false);
    await expect(copier(recordingFetch({}).fetch).isUnchanged(`${FROM}b.png`, hashed)).resolves.toBe(false);
  });

  it("of a container is what it lists, read with a HEAD", async () => {
    const source = recordingFetch({ [`${FROM}decks/`]: { headers: { ETag: '"c1"' } } });
    const version = await copier(source.fetch).copyResource(`${FROM}decks/`, `${TO}decks/`, MOVE);
    expect(source.requests[0]).toMatchObject({ url: `${FROM}decks/`, method: "HEAD" });
    expect(JSON.parse(version)).toMatchObject({ etag: '"c1"', accept: "text/turtle" });
  });

  it("of a document now is read as the app reads it, never from a browser's cache, in the same form", async () => {
    const tagged = recordingFetch({ [`${FROM}catalog.ttl`]: { headers: { ETag: '"v1"' } } });
    expect(JSON.parse((await copier(tagged.fetch).versionOf(`${FROM}catalog.ttl`))!)).toEqual({ accept: "text/turtle", etag: '"v1"' });
    expect(tagged.requests[0]).toMatchObject({ url: `${FROM}catalog.ttl`, method: "GET" });
    expect(tagged.requests[0]!.headers.get("Accept")).toBe("text/turtle");
    expect(vi.mocked(tagged.fetch).mock.calls[0]![1]).toMatchObject({ cache: "no-store" });
    // Without an ETag or a modification time, a hash of the bytes: the same bytes, the same version.
    const hashed = (body: string) => copier(recordingFetch({ [`${FROM}a.ttl`]: { body } }).fetch).versionOf(`${FROM}a.ttl`);
    expect(await hashed("abc")).toBe(await hashed("abc"));
    expect(await hashed("abc")).not.toBe(await hashed("abd"));
    await expect(copier(recordingFetch({}).fetch).versionOf(`${FROM}gone.ttl`)).resolves.toBeNull();
    await expect(copier(recordingFetch({ [`${FROM}a.ttl`]: { status: 403 } }).fetch).versionOf(`${FROM}a.ttl`)).rejects.toThrow(
      `url: ${FROM}a.ttl\nstatus: 403`,
    );
  });

  it("makes a copy only where nothing is yet: If-None-Match: *", async () => {
    vi.mocked(getFile).mockResolvedValue(new Blob(["png"]) as never);
    const target = recordingFetch({ [`${TO}a.png`]: { status: 201 } });
    vi.mocked(overwriteFile).mockImplementation((async (url: string, _file: Blob, options: { fetch: typeof fetch }) => {
      await options.fetch(url, { method: "PUT" });
      await options.fetch(url, { method: "HEAD" });
      await options.fetch(url);
    }) as never);
    await copier(target.fetch).copyResource(`${FROM}a.png`, `${TO}a.png`, MOVE);
    const put = target.requests.find((r) => r.method === "PUT")!;
    expect(put.headers.get("If-None-Match")).toBe("*");
    expect(target.requests.find((r) => r.url === `${TO}a.png` && r.method === "HEAD")!.headers.has("If-None-Match")).toBe(false);

    vi.mocked(overwriteFile).mockRejectedValueOnce(Object.assign(new Error("412"), { statusCode: 412 }));
    await expect(copier(target.fetch).copyResource(`${FROM}a.png`, `${TO}a.png`, MOVE)).rejects.toThrow(
      `url: ${TO}a.png`,
    );
    vi.mocked(overwriteFile).mockRejectedValueOnce(new Error("offline"));
    await expect(copier(target.fetch).copyResource(`${FROM}a.png`, `${TO}a.png`, MOVE)).rejects.toThrow("offline");
  });
});

describe("mentions", () => {
  it("says whether a resource's content holds the text", async () => {
    const fetch = fetchOf({ [`${TO}a.ttl`]: { body: "<https://guest.example/x> <p> <o> ." } });
    expect(await copier(fetch).mentions(`${TO}a.ttl`, "https://guest.example/")).toBe(true);
    expect(await copier(fetch).mentions(`${TO}a.ttl`, "https://other.example/")).toBe(false);
  });

  it("fails when the resource cannot be read", async () => {
    await expect(copier().mentions(`${TO}a.ttl`, "x")).rejects.toThrow(`url: ${TO}a.ttl\nstatus: 404`);
  });
});

describe("listResources and deleteRecursively", () => {
  function container(url: string, children: string[]) {
    let thing = buildThing(createThing({ url }));
    for (const child of children) thing = thing.addIri(LDP_CONTAINS, child);
    return setThing(mockContainerFrom(url), thing.build());
  }
  const tree: Record<string, SolidDataset> = {
    // The listing also names the container itself and a stranger outside it: neither is followed.
    [FROM]: container(FROM, [`${FROM}meta.ttl`, `${FROM}decks/`, `${FROM}catalog.ttl`, FROM, `${TO}elsewhere.ttl`]),
    [`${FROM}decks/`]: container(`${FROM}decks/`, [`${FROM}decks/deck-1.ttl`]),
  };

  it("list everything below the container, depth first, and nothing for a container that is gone", async () => {
    vi.mocked(getSolidDatasetOrNull).mockImplementation((async (url: string) => tree[url] ?? null) as never);
    await expect(copier().listResources(FROM)).resolves.toEqual([
      `${FROM}catalog.ttl`,
      `${FROM}decks/`,
      `${FROM}decks/deck-1.ttl`,
      `${FROM}meta.ttl`,
    ]);
    await expect(copier().listResources(TO)).resolves.toEqual([]);
  });

  it("delete everything below the container, then the container; one that is gone counts as deleted", async () => {
    vi.mocked(getSolidDatasetOrNull).mockImplementation((async (url: string) => tree[url] ?? null) as never);
    await copier().deleteRecursively(TO);
    expect(deleteContainer).not.toHaveBeenCalled();
    await copier().deleteRecursively(FROM);
    expect(vi.mocked(deleteFile).mock.calls.map((c) => c[0])).toEqual([
      `${FROM}decks/deck-1.ttl`,
      `${FROM}catalog.ttl`,
      `${FROM}meta.ttl`,
    ]);
    expect(vi.mocked(deleteContainer).mock.calls.map((c) => c[0])).toEqual([`${FROM}decks/`, FROM]);
  });
});
