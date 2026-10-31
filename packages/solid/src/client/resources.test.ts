// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  FetchError,
  getSolidDataset as libraryGetSolidDataset,
  saveSolidDatasetAt as librarySaveSolidDatasetAt,
  type SolidDataset,
} from "@inrupt/solid-client";
import { describe, expect, it } from "vitest";
import { resourcesContract } from "../testing/contract/resources";
import { HttpError } from "./interface";
import * as rdf from "./rdf";
import * as resources from "./resources";

resourcesContract({ rdf, resources });

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
