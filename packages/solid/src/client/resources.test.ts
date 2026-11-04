// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  FetchError,
  getSolidDataset as libraryGetSolidDataset,
  saveSolidDatasetAt as librarySaveSolidDatasetAt,
  type SolidDataset,
} from "@inrupt/solid-client";
import { describe, expect, it, vi } from "vitest";
import { MAX_DESCRIBING_HEADER_LENGTH } from "./linkHeader";
import { resourcesContract } from "../testing/contract/resources";
import { turtleAt } from "../testing/contract/rdf";
import { HttpError } from "./interface";
import * as rdf from "./rdf";
import * as resources from "./resources";

resourcesContract({ rdf, resources });

/** The responses the library's file, container and save requests were handed, newest last. */
const handed: Response[] = vi.hoisted(() => []);

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const library = await importOriginal<typeof import("@inrupt/solid-client")>();
  /** The library's function `call`, the responses of the fetch in its options (its last argument) noted in `handed`. */
  const noting = <F extends (...args: never[]) => unknown>(call: F): F =>
    ((...args: unknown[]) => {
      const options = args.at(-1) as { fetch?: typeof globalThis.fetch };
      const fetch = options.fetch;
      const noted =
        fetch &&
        (async (input: RequestInfo | URL, init?: RequestInit) => {
          const response = await fetch(input, init);
          handed.push(response);
          return response;
        });
      return (call as unknown as (...args: unknown[]) => unknown)(...args.slice(0, -1), {
        ...options,
        fetch: noted,
      });
    }) as unknown as F;
  return {
    ...library,
    createContainerAt: noting(library.createContainerAt),
    getFile: noting(library.getFile),
    overwriteFile: noting(library.overwriteFile),
    saveSolidDatasetAt: noting(library.saveSolidDatasetAt),
  };
});

const URL_ = "https://pod.example/decks/deck.ttl";

/** A missing document's answer. */
const missing: typeof globalThis.fetch = async (input) => {
  const response = new Response("", { status: 404 });
  Object.defineProperty(response, "url", { value: String(input) });
  return response;
};

describe("HttpError, over the library", () => {
  it("has the library's message, and the library's error as its cause", async () => {
    const expected = await libraryGetSolidDataset(URL_, { fetch: missing }).then(
      () => null,
      (failure: Error) => failure.message,
    );
    const error = await resources
      .getSolidDataset(URL_, { fetch: missing })
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).message).toBe(expected);
    expect((error as HttpError).cause).toBeInstanceOf(FetchError);
    expect((error as HttpError).cause).toHaveProperty("message", expected);
  });
});

describe("getSolidDataset, over the library", () => {
  it("reads with the global fetch when given none", async () => {
    vi.stubGlobal("fetch", vi.fn(turtleAt(`<${URL_}> <https://example.com/ns#p> "x" .`)));
    try {
      const dataset = await resources.getSolidDataset(URL_);
      expect(rdf.getThing(dataset, URL_)).not.toBeNull();
      expect(globalThis.fetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("writeDocument, over the library", () => {
  it("fails as the library does on a URL it cannot write to, sending nothing", async () => {
    let sent = 0;
    const fetch: typeof globalThis.fetch = async () => {
      sent++;
      return new Response("", { status: 201 });
    };
    await expect(
      resources.writeDocument("not a URL", rdf.createSolidDataset(), { fetch }),
    ).rejects.toThrow(TypeError);
    expect(sent).toBe(0);
  });
});

describe("writeDocument, beside the library's own save", () => {
  // writeDocument has the library make its request of the dataset as it
  // is, and save one with no subject, giving the subjects back resolved
  // itself: this holds while the library's only PUT creates the document
  // and its save resolves only the default graph's subjects made by name.
  const EX = "https://example.com/ns#";
  /** A new document's dataset: a subject made by name, naming another made by name. */
  const created = () => {
    const other = rdf.createThing({ name: "other" });
    const named = rdf
      .buildThing(rdf.createThing({ name: "named" }))
      .addIri(`${EX}p`, other)
      .addStringNoLocale(`${EX}q`, "text")
      .build();
    return rdf.setThing(
      rdf.setThing(rdf.createSolidDataset(), named),
      rdf.buildThing(other).addInteger(`${EX}n`, 1).build(),
    );
  };
  /** A fetch that answers a write as a pod does, noting each request. */
  const pod = () => {
    const requests: { method: string; body: string }[] = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      requests.push({ method: init?.method ?? "GET", body: String(init?.body ?? "") });
      const response = new Response("", { status: 201, headers: { ETag: '"v2"' } });
      Object.defineProperty(response, "url", { value: String(input) });
      return response;
    };
    return { fetch, requests };
  };
  const lines = (dataset: rdf.Dataset) =>
    [...rdf.toRdfJsDataset(dataset)]
      .map((quad) => `${quad.subject.value} ${quad.predicate.value} ${quad.object.value}`)
      .sort();

  it("creates a document with the library's request and gives back what the library's save does", async () => {
    const ours = pod();
    const theirs = pod();
    const written = await resources.writeDocument(URL_, created(), { fetch: ours.fetch });
    const saved = await librarySaveSolidDatasetAt(URL_, created() as unknown as SolidDataset, {
      fetch: theirs.fetch,
    });
    expect(ours.requests).toEqual(theirs.requests);
    expect(ours.requests.map(({ method }) => method)).toEqual(["PUT"]);
    expect(lines(written.dataset)).toEqual(lines(saved as unknown as rdf.Dataset));
    expect(rdf.getThingAll(written.dataset).map((subject) => subject.url)).toEqual(
      rdf.getThingAll(saved as unknown as rdf.Dataset).map((subject) => subject.url),
    );
  });
});

describe("the headers that describe a resource, over the library", () => {
  /** A Link header just past the bound: a long one makes the library's parser slow. */
  const LONG_LINK = `<${"a".repeat(MAX_DESCRIBING_HEADER_LENGTH)}>; rel="x"`;
  const FILE = "https://pod.example/media/image.png";
  /** A fetch that answers every request with `status`, a long Link header and `body`. */
  const longLinked =
    (status: number, body: string | null = null): typeof globalThis.fetch =>
    async (input) => {
      const response = new Response(body, {
        status,
        headers: { "Content-Type": "text/turtle", Link: LONG_LINK },
      });
      Object.defineProperty(response, "url", { value: String(input) });
      return response;
    };

  it("reads a file with the global fetch when given none, handing the library no long Link header", async () => {
    handed.length = 0;
    vi.stubGlobal("fetch", vi.fn(longLinked(200, "bytes")));
    try {
      expect(await (await resources.getFile(FILE, {})).text()).toBe("bytes");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(handed).toHaveLength(1);
    expect(handed.map((response) => response.headers.get("Link"))).toEqual([null]);
  });

  it("writes a file, a container and a document, handing the library no long Link header", async () => {
    handed.length = 0;
    await resources.overwriteFile(FILE, new Blob(["bytes"]), {
      fetch: longLinked(201),
      contentType: "image/png",
    });
    await resources.createContainerAt("https://pod.example/decks/", { fetch: longLinked(201) });
    const written = await resources.writeDocument(URL_, rdf.createSolidDataset(), {
      fetch: longLinked(201),
    });
    expect(rdf.getThingAll(written.dataset)).toEqual([]);
    expect(handed.length).toBeGreaterThanOrEqual(3);
    expect(handed.every((response) => response.headers.get("Link") === null)).toBe(true);
  });
});
