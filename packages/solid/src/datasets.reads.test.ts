import { describe, expect, it } from "vitest";
import { buildThing, createSolidDataset, createThing, setThing } from "@inrupt/solid-client";
import { deleteDataset, getSolidDatasetOrNull, readDataset, saveDataset } from "./datasets";

/**
 * Reading the same document more than once, through the real
 * @inrupt/solid-client, against a fake pod that answers If-None-Match as
 * a Solid server does: 304 when it names the current version.
 */
const DOC = "https://pod.example/doc.ttl";

function pod({ etag = '"v1"' as string | null, honoursIfNoneMatch = true } = {}) {
  const gets: { ifNoneMatch: string | null }[] = [];
  const caches: (RequestCache | undefined)[] = [];
  let current = etag;
  let exists = true;
  let release: (() => void) | undefined;
  let held: Promise<void> | undefined;
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    if (method !== "GET") {
      if (method === "DELETE") exists = false;
      return new Response("", { status: method === "DELETE" ? 204 : 205 });
    }
    gets.push({ ifNoneMatch: headers.get("If-None-Match") });
    caches.push(init?.cache);
    await held;
    if (!exists) return new Response("", { status: 404 });
    const response =
      honoursIfNoneMatch && current !== null && headers.get("If-None-Match") === current
        ? new Response(null, { status: 304, headers: { ETag: current } })
        : new Response(`<#it> <https://example.com/ns#n> "${current?.replaceAll('"', "")}" .`, {
            headers: { "Content-Type": "text/turtle", ...(current === null ? {} : { ETag: current }) },
          });
    Object.defineProperty(response, "url", { value: url });
    return response;
  }) as typeof globalThis.fetch;
  return {
    fetch,
    gets,
    caches,
    /** Answers wait until let go. */
    hold() {
      held = new Promise((resolve) => (release = resolve));
    },
    letGo() {
      release?.();
    },
    changeElsewhere(next: string) {
      current = next;
    },
    removeElsewhere() {
      exists = false;
    },
  };
}

const edited = <T extends Parameters<typeof setThing>[0]>(dataset: T) =>
  setThing(dataset, buildThing(createThing({ url: `${DOC}#new` })).addStringNoLocale("https://example.com/ns#n", "2").build());

describe("reading a document more than once", () => {
  it("shares a read already under way", async () => {
    const server = pod();
    server.hold();
    const first = readDataset(DOC, server.fetch);
    const second = getSolidDatasetOrNull(DOC, server.fetch);
    server.letGo();
    expect(await second).toBe(await first);
    expect(server.gets).toHaveLength(1);
  });

  it("asks the pod every time, never a browser's cache: the read it keeps is the only one", async () => {
    const server = pod();
    await readDataset(DOC, server.fetch);
    await readDataset(DOC, server.fetch);
    expect(server.caches).toEqual(["no-store", "no-store"]);
  });

  it("asks again with the ETag it read, and keeps the dataset when the pod says it is unchanged (304)", async () => {
    const server = pod();
    const first = await readDataset(DOC, server.fetch);
    const again = await readDataset(DOC, server.fetch);
    expect(again).toBe(first);
    expect(server.gets).toEqual([{ ifNoneMatch: null }, { ifNoneMatch: '"v1"' }]);
  });

  it("reads the document anew when it changed elsewhere", async () => {
    const server = pod();
    const first = await readDataset(DOC, server.fetch);
    server.changeElsewhere('"v2"');
    const again = await readDataset(DOC, server.fetch);
    expect(again).not.toBe(first);
    expect(server.gets.map((g) => g.ifNoneMatch)).toEqual([null, '"v1"']);
    await readDataset(DOC, server.fetch);
    expect(server.gets.at(-1)).toEqual({ ifNoneMatch: '"v2"' });
  });

  it("asks without a version after a write to the document, and after a read that found none", async () => {
    const server = pod();
    await saveDataset(DOC, edited(await readDataset(DOC, server.fetch)), server.fetch);
    await readDataset(DOC, server.fetch);
    server.removeElsewhere();
    expect(await getSolidDatasetOrNull(DOC, server.fetch)).toBeNull();
    expect(server.gets.map((g) => g.ifNoneMatch)).toEqual([null, null, '"v1"']);
  });

  it("asks without a version after a write to the document it read by one of its subjects (a WebID)", async () => {
    // A server whose ETag an edit in the same second keeps would say 304 to the version read before.
    const server = pod();
    const profile = await readDataset(`${DOC}#me`, server.fetch);
    await saveDataset(DOC, edited(profile), server.fetch);
    await readDataset(`${DOC}#me`, server.fetch);
    expect(server.gets.map((g) => g.ifNoneMatch)).toEqual([null, null]);
  });

  it("asks without a version after deleting the document", async () => {
    const server = pod();
    const dataset = await readDataset(DOC, server.fetch);
    await deleteDataset(DOC, dataset, server.fetch);
    expect(await getSolidDatasetOrNull(DOC, server.fetch)).toBeNull();
    expect(server.gets.map((g) => g.ifNoneMatch)).toEqual([null, null]);
  });

  it("starts a new read when a write ends the sharing of one under way", async () => {
    const server = pod();
    server.hold();
    const before = readDataset(DOC, server.fetch);
    await saveDataset(DOC, edited(createSolidDataset()), server.fetch);
    const after = readDataset(DOC, server.fetch);
    server.letGo();
    await Promise.all([before, after]);
    expect(server.gets).toHaveLength(2);
    // The read the write ended does not end the one that replaced it.
    await readDataset(DOC, server.fetch);
    expect(server.gets).toHaveLength(3);
  });

  it("remembers nothing of a document served without an ETag", async () => {
    const server = pod({ etag: null });
    await readDataset(DOC, server.fetch);
    await readDataset(DOC, server.fetch);
    expect(server.gets.map((g) => g.ifNoneMatch)).toEqual([null, null]);
  });

  it("fails on a 304 it did not ask for, as before", async () => {
    const fetch = (async () => new Response(null, { status: 304 })) as unknown as typeof globalThis.fetch;
    await expect(readDataset(DOC, fetch)).rejects.toThrow();
  });
});
