// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  buildThing,
  createSolidDataset,
  createThing,
  type Dataset,
  setThing,
  toRdfJsDataset,
} from "./client/rdf";
import {
  deleteDataset,
  getSolidDatasetOrNull,
  keptDataset,
  MAX_PATCH_BYTES,
  PreconditionFailedError,
  readDataset,
  saveDataset,
} from "./datasets";

/**
 * The preconditions through the real Solid client library (client/),
 * against a fake pod that holds one document and answers as a Solid
 * server does: 412 when If-Match names another version, or
 * If-None-Match: * finds one, and 304 when a read's If-None-Match names the version there. With
 * `written`, a write gives the document a new version and answers with
 * it (`"w1"`, `"w2"`…; weak with `W/` before), from the URL written to
 * unless `answeredFrom` is "nowhere", as a mocked fetch answers.
 */
const DOC = "https://pod.example/doc.ttl";
const NEW = "https://pod.example/new.ttl";

function pod({
  etag = '"v1"',
  exists = new Set([DOC]),
  written,
  answeredFrom = "url",
}: {
  etag?: string | null;
  exists?: Set<string>;
  written?: "strong" | "weak";
  answeredFrom?: "url" | "nowhere";
} = {}) {
  const writes: {
    method: string;
    url: string;
    ifMatch: string | null;
    ifNoneMatch: string | null;
  }[] = [];
  const bodies: { contentType: string | null; body: string }[] = [];
  const reads: { ifNoneMatch: string | null; status: number }[] = [];
  let current = etag;
  let versions = 0;
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    if (method === "GET" || method === "HEAD") {
      const ifNoneMatch = headers.get("If-None-Match");
      const status = !exists.has(url)
        ? 404
        : ifNoneMatch !== null && ifNoneMatch === current
          ? 304
          : 200;
      reads.push({ ifNoneMatch, status });
      if (status !== 200) return new Response(null, { status });
      const response = new Response(`<#it> <https://example.com/ns#n> "1" .`, {
        headers: { "Content-Type": "text/turtle", ...(current === null ? {} : { ETag: current }) },
      });
      Object.defineProperty(response, "url", { value: url });
      return response;
    }
    writes.push({
      method,
      url,
      ifMatch: headers.get("If-Match"),
      ifNoneMatch: headers.get("If-None-Match"),
    });
    bodies.push({ contentType: headers.get("Content-Type"), body: String(init?.body ?? "") });
    const ifMatch = headers.get("If-Match");
    if (ifMatch !== null && (!exists.has(url) || ifMatch !== current))
      return new Response("", { status: 412 });
    if (headers.get("If-None-Match") === "*" && exists.has(url))
      return new Response("", { status: 412 });
    exists.add(url);
    if (written === undefined) return new Response("", { status: method === "DELETE" ? 204 : 205 });
    current = `${written === "weak" ? "W/" : ""}"w${++versions}"`;
    const response = new Response("", { status: 205, headers: { ETag: current } });
    if (answeredFrom === "url") Object.defineProperty(response, "url", { value: url });
    return response;
  }) as typeof globalThis.fetch;
  return {
    fetch,
    writes,
    bodies,
    reads,
    /** Someone else writes the document: it gets a new version. */
    changeElsewhere(next: string) {
      current = next;
    },
  };
}

/** A dataset's objects, each a line, for a look at what it holds. */
const objectsOf = (dataset: Dataset) =>
  [...toRdfJsDataset(dataset)].map((quad) => `"${quad.object.value}"`);

const edited = <T extends Parameters<typeof setThing>[0]>(dataset: T) =>
  setThing(
    dataset,
    buildThing(createThing({ url: `${DOC}#new` }))
      .addStringNoLocale("https://example.com/ns#n", "2")
      .build(),
  );

/**
 * The dataset with an edit larger than MAX_PATCH_BYTES: 20 cards of 4 KiB
 * each. Few Things, as a dataset is copied on every change.
 */
const large = <T extends Parameters<typeof setThing>[0]>(dataset: T) => {
  let edited = dataset;
  for (let i = 0; i < 20; i++) {
    edited = setThing(
      edited,
      buildThing(createThing({ url: `${DOC}#card-${i}` }))
        .addStringNoLocale("https://example.com/ns#back", "x".repeat(4096))
        .build(),
    );
  }
  return edited;
};

describe("saving with preconditions", () => {
  it("saves an edit only if the document is as it was read (If-Match: its ETag)", async () => {
    const server = pod();
    await saveDataset(DOC, edited(await readDataset(DOC, server.fetch)), server.fetch);
    expect(server.writes).toEqual([
      { method: "PATCH", url: DOC, ifMatch: '"v1"', ifNoneMatch: null },
    ]);
  });

  it("refuses to save an edit of a document changed since it was read, naming it", async () => {
    const server = pod();
    const dataset = await getSolidDatasetOrNull(DOC, server.fetch);
    server.changeElsewhere('"v2"');
    const error = await saveDataset(DOC, edited(dataset!), server.fetch).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PreconditionFailedError);
    expect(error).toMatchObject({ url: DOC, expected: "unchanged" });
    expect(String(error)).toContain(
      `This was changed elsewhere, perhaps in another tab or app, since Solid Memo read it, so nothing was saved. Reload the page and try again.\nurl: ${DOC}`,
    );
  });

  it("creates a document only if nothing is there yet (If-None-Match: *), naming it when something is", async () => {
    const server = pod();
    await saveDataset(NEW, edited(createSolidDataset()), server.fetch);
    expect(server.writes[0]).toMatchObject({
      method: "PUT",
      url: NEW,
      ifNoneMatch: "*",
      ifMatch: null,
    });
    const error = await saveDataset(NEW, edited(createSolidDataset()), server.fetch).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ url: NEW, expected: "absent" });
    expect(String(error)).toContain(
      `was created elsewhere, perhaps in another tab or app, just as Solid Memo was about to create it, so nothing was saved. Reload the page and try again.\nurl: ${NEW}`,
    );
  });

  it("sends no If-Match for a weak ETag or none, nor for a dataset saved since it was read", async () => {
    for (const etag of ['W/"v1"', null]) {
      const server = pod({ etag });
      await saveDataset(DOC, edited(await readDataset(DOC, server.fetch)), server.fetch);
      expect(server.writes[0]!.ifMatch).toBeNull();
    }
    const server = pod();
    const dataset = edited(await readDataset(DOC, server.fetch));
    await saveDataset(DOC, dataset, server.fetch);
    server.changeElsewhere('"v2"');
    await saveDataset(DOC, dataset, server.fetch);
    expect(server.writes.map((w) => w.ifMatch)).toEqual(['"v1"', null]);
  });

  it("saves a dataset read from elsewhere as a creation at the new address", async () => {
    const server = pod();
    await saveDataset(NEW, await readDataset(DOC, server.fetch), server.fetch);
    expect(server.writes[0]).toMatchObject({ url: NEW, ifMatch: null, ifNoneMatch: "*" });
  });

  it("writes an edit too large for one PATCH as one PUT of the whole document, still only if it is as it was read", async () => {
    const server = pod();
    let dataset = await readDataset(DOC, server.fetch);
    dataset = large(dataset);
    await saveDataset(DOC, dataset, server.fetch);
    expect(server.writes).toEqual([
      { method: "PUT", url: DOC, ifMatch: '"v1"', ifNoneMatch: null },
    ]);
    expect(server.bodies[0].contentType).toBe("text/turtle");
    expect(server.bodies[0].body).toContain("#card-19>");
    expect(server.bodies[0].body).toContain('"1"');
    expect(new TextEncoder().encode(server.bodies[0].body).length).toBeGreaterThan(MAX_PATCH_BYTES);

    const changed = pod();
    const read = await readDataset(DOC, changed.fetch);
    changed.changeElsewhere('"v2"');
    await expect(saveDataset(DOC, large(read), changed.fetch)).rejects.toBeInstanceOf(
      PreconditionFailedError,
    );
  });

  it("writes even a small edit as one PUT of the whole document when asked (whole), still only if it is as it was read", async () => {
    const server = pod();
    await saveDataset(DOC, edited(await readDataset(DOC, server.fetch)), server.fetch, {
      whole: true,
    });
    expect(server.writes).toEqual([
      { method: "PUT", url: DOC, ifMatch: '"v1"', ifNoneMatch: null },
    ]);
    expect(server.bodies[0].contentType).toBe("text/turtle");
    expect(server.bodies[0].body).toContain('"2"');

    const changed = pod();
    const read = await readDataset(DOC, changed.fetch);
    changed.changeElsewhere('"v2"');
    await expect(
      saveDataset(DOC, edited(read), changed.fetch, { whole: true }),
    ).rejects.toBeInstanceOf(PreconditionFailedError);
  });

  it("passes on other failures", async () => {
    const failing = (async () =>
      new Response("", { status: 500 })) as unknown as typeof globalThis.fetch;
    await expect(
      saveDataset(NEW, edited(createSolidDataset()), failing),
    ).rejects.not.toBeInstanceOf(PreconditionFailedError);
    await expect(deleteDataset(NEW, createSolidDataset(), failing)).rejects.not.toBeInstanceOf(
      PreconditionFailedError,
    );
  });
});

describe("keeping what was written", () => {
  it("keeps an edit at the version the pod answers with: edited again with If-Match on it, and no read first", async () => {
    const server = pod({ written: "strong" });
    await saveDataset(DOC, edited(await readDataset(DOC, server.fetch)), server.fetch);
    const kept = keptDataset(DOC, server.fetch)!;
    expect(objectsOf(kept)).toContain('"2"');
    await saveDataset(DOC, edited(kept), server.fetch);
    expect(server.writes.map((w) => w.ifMatch)).toEqual(['"v1"', '"w1"']);
    expect(server.reads).toHaveLength(1);
  });

  it("asks the next read If-None-Match with the written version, and gives what was written on 304", async () => {
    const server = pod({ written: "strong" });
    const dataset = edited(await readDataset(DOC, server.fetch));
    await saveDataset(DOC, dataset, server.fetch);
    const read = await readDataset(DOC, server.fetch);
    expect(server.reads.at(-1)).toEqual({ ifNoneMatch: '"w1"', status: 304 });
    expect(read).toBe(keptDataset(DOC, server.fetch));
  });

  it("keeps a creation, made only where nothing was (If-None-Match: *)", async () => {
    const server = pod({ written: "strong" });
    await saveDataset(NEW, edited(createSolidDataset()), server.fetch);
    await saveDataset(NEW, edited(keptDataset(NEW, server.fetch)!), server.fetch);
    expect(server.writes.map((w) => w.ifMatch)).toEqual([null, '"w1"']);
  });

  it("refuses an edit of what it kept once the document changed elsewhere", async () => {
    const server = pod({ written: "strong" });
    await saveDataset(DOC, edited(await readDataset(DOC, server.fetch)), server.fetch);
    server.changeElsewhere('"v2"');
    await expect(
      saveDataset(DOC, edited(keptDataset(DOC, server.fetch)!), server.fetch),
    ).rejects.toMatchObject({ url: DOC, expected: "unchanged" });
    expect(keptDataset(DOC, server.fetch)).toBeUndefined();
  });

  it("keeps nothing when the pod gives no new ETag, a weak one, or the answer no address, nor for an edit made without If-Match", async () => {
    for (const server of [
      pod(),
      pod({ written: "weak" }),
      pod({ written: "strong", answeredFrom: "nowhere" }),
      pod({ written: "strong", etag: null }),
    ]) {
      await saveDataset(DOC, edited(await readDataset(DOC, server.fetch)), server.fetch);
      expect(keptDataset(DOC, server.fetch)).toBeUndefined();
    }
  });

  it("knows nothing of a document nothing read or wrote", () => {
    expect(keptDataset(DOC, pod().fetch)).toBeUndefined();
  });

  it("gives a read kept at a strong version, never one at a weak version, which If-Match cannot name", async () => {
    const strong = pod();
    const read = await readDataset(DOC, strong.fetch);
    expect(keptDataset(DOC, strong.fetch)).toBe(read);
    const weak = pod({ etag: 'W/"v1"' });
    await readDataset(DOC, weak.fetch);
    expect(keptDataset(DOC, weak.fetch)).toBeUndefined();
  });
});

describe("deleting with preconditions", () => {
  it("deletes a document only if it is as it was read", async () => {
    const server = pod();
    await deleteDataset(DOC, await readDataset(DOC, server.fetch), server.fetch);
    expect(server.writes).toEqual([
      { method: "DELETE", url: DOC, ifMatch: '"v1"', ifNoneMatch: null },
    ]);

    const again = pod();
    const dataset = await readDataset(DOC, again.fetch);
    again.changeElsewhere('"v2"');
    await expect(deleteDataset(DOC, dataset, again.fetch)).rejects.toMatchObject({
      url: DOC,
      expected: "unchanged",
    });
    await deleteDataset(DOC, createSolidDataset(), again.fetch);
    expect(again.writes.at(-1)!.ifMatch).toBeNull();
  });
});
