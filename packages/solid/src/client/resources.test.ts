// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { FetchError, getSolidDataset as libraryGetSolidDataset } from "@inrupt/solid-client";
import { describe, expect, it } from "vitest";
import { buildThing, createSolidDataset, createThing, getThing, setThing } from "./rdf";
import {
  HttpError,
  createContainerAt,
  deleteContainer,
  deleteFile,
  deleteSolidDataset,
  getFile,
  getPodUrlAllFrom,
  getProfileAll,
  getSolidDataset,
  getSolidDatasetLinear,
  overwriteFile,
  parseQuads,
  saveSolidDatasetAt,
} from "./resources";

const URL_ = "https://pod.example/decks/deck.ttl";
const EX = "https://example.com/ns#";

/** A pod of one document at a time: every request noted, each answered with `status` and `body`. */
function pod(status = 200, body = `<#a> <${EX}p> "x" .`, contentType = "text/turtle") {
  const requests: { method: string; url: string; headers: Headers; body: unknown }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({
      method: init?.method ?? "GET",
      url,
      headers: new Headers(init?.headers),
      body: init?.body,
    });
    const response = new Response(status === 204 ? null : body, {
      status,
      headers: { "Content-Type": contentType },
    });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };
  return { fetch, requests };
}

describe("HttpError", () => {
  it("is what a failed request rejects with: the library's message, the status and the response, the library's error its cause", async () => {
    const { fetch } = pod(404, "");
    const expected = await libraryGetSolidDataset(URL_, { fetch }).then(
      () => null,
      (failure: Error) => failure.message,
    );
    const error = await getSolidDataset(URL_, { fetch }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      name: "HttpError",
      message: expected,
      statusCode: 404,
      response: { status: 404 },
    });
    expect((error as HttpError).cause).toBeInstanceOf(FetchError);
    expect((error as HttpError).cause).toHaveProperty("message", expected);
  });

  it("is what a refused write rejects with", async () => {
    const { fetch } = pod(412, "");
    await expect(saveSolidDatasetAt(URL_, createSolidDataset(), { fetch })).rejects.toMatchObject({
      statusCode: 412,
    });
  });

  it("is not made of a failure that is no answer of the server's", async () => {
    const error = await getSolidDatasetLinear(URL_, { fetch: pod(200, "<#a> <#b> .").fetch }).catch(
      (failure: unknown) => failure,
    );
    expect(error).not.toBeInstanceOf(HttpError);
    expect(error).toHaveProperty(
      "message",
      expect.stringContaining(`Encountered an error parsing the Resource at [${URL_}]`),
    );
  });
});

describe("reading documents", () => {
  it("reads a document as the library does, through the fetch given", async () => {
    const { fetch, requests } = pod();
    for (const read of [getSolidDataset, getSolidDatasetLinear]) {
      const dataset = await read(URL_, { fetch });
      expect(getThing(dataset, `${URL_}#a`)).not.toBeNull();
    }
    expect(requests.map(({ method, url }) => [method, url])).toEqual([
      ["GET", URL_],
      ["GET", URL_],
    ]);
    expect(requests[0]!.headers.get("Accept")).toBe(requests[1]!.headers.get("Accept"));
  });
});

describe("writing resources", () => {
  it("saves and deletes a document", async () => {
    const { fetch, requests } = pod(201, "");
    const dataset = setThing(
      createSolidDataset(),
      buildThing(createThing({ name: "a" }))
        .addStringNoLocale(`${EX}p`, "x")
        .build(),
    );
    const saved = await saveSolidDatasetAt(URL_, dataset, { fetch });
    expect(getThing(saved, `${URL_}#a`)).not.toBeNull();
    await deleteSolidDataset(URL_, { fetch: pod(204).fetch });
    expect(requests.map(({ method, headers }) => [method, headers.get("If-None-Match")])).toEqual([
      ["PUT", "*"],
    ]);
  });

  it("creates and deletes a container, and writes, reads and deletes a file", async () => {
    const { fetch, requests } = pod(201, "");
    await createContainerAt("https://pod.example/decks/", { fetch });
    await overwriteFile("https://pod.example/a.png", new Blob(["png"]), {
      contentType: "image/png",
      fetch,
    });
    const file = await getFile("https://pod.example/a.png", {
      fetch: pod(200, "png", "image/png").fetch,
    });
    expect(await file.text()).toBe("png");
    await deleteFile("https://pod.example/a.png", { fetch: pod(204).fetch });
    await deleteContainer("https://pod.example/decks/", { fetch: pod(204).fetch });
    expect(
      requests.map(({ method, url, headers }) => [method, url, headers.get("Content-Type")]),
    ).toEqual([
      ["PUT", "https://pod.example/decks/", "text/turtle"],
      ["PUT", "https://pod.example/a.png", "image/png"],
    ]);
  });
});

describe("getProfileAll", () => {
  it("finds the pods a WebID document names", async () => {
    const webId = "https://alice.example/profile/card#me";
    const { fetch } = pod(
      200,
      `<#me> <http://www.w3.org/ns/pim/space#storage> <https://alice.example/> .`,
    );
    const webIdProfile = await getSolidDataset("https://alice.example/profile/card", { fetch });
    const profiles = await getProfileAll(webId, { fetch, webIdProfile });
    expect(getPodUrlAllFrom(profiles, webId)).toEqual(["https://alice.example/"]);
  });
});

describe("parseQuads", () => {
  it("reads Turtle, its relative IRIs resolved against the base", async () => {
    const quads = await parseQuads(`<#a> <${EX}p> "x" .`, "turtle", URL_);
    expect(quads.map((one) => [one.subject.value, one.object.value])).toEqual([[`${URL_}#a`, "x"]]);
  });

  it("reads JSON-LD, in every graph it names", async () => {
    const quads = await parseQuads(
      JSON.stringify({
        "@id": "https://example.com/g",
        "@graph": [{ "@id": "#a", [`${EX}p`]: "x" }],
      }),
      "jsonld",
      URL_,
    );
    expect(quads.map((one) => [one.subject.value, one.graph.value])).toEqual([
      [`${URL_}#a`, "https://example.com/g"],
    ]);
  });

  it("rejects a text that does not parse", async () => {
    await expect(parseQuads("<#a> <#b> .", "turtle", URL_)).rejects.toBeDefined();
  });
});
