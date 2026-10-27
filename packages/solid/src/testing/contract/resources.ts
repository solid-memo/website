// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { HttpError } from "../../client/interface";
import { MAX_PATCH_BYTES, patchBody } from "../../client/sparqlUpdate";
import { type DataClient, turtleAt } from "./rdf";

const URL_ = "https://pod.example/decks/deck.ttl";
const EX = "https://example.com/ns#";
const XSD = "http://www.w3.org/2001/XMLSchema#";

/** How the pod answers a request; the body is the Turtle of one subject unless given. */
interface Answer {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

/** A request the pod got. */
interface Sent {
  method: string;
  url: string;
  headers: Headers;
  body: unknown;
  cache: RequestCache | undefined;
}

/**
 * A pod that notes every request and answers each with the next of
 * `answers`, the last one again once they run out: by default a 200 of
 * a Turtle document of one subject.
 */
function pod(...answers: Answer[]) {
  const sent: Sent[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    sent.push({
      method: init?.method ?? "GET",
      url,
      headers: new Headers(init?.headers),
      body: init?.body,
      cache: init?.cache,
    });
    const {
      status = 200,
      body = `<#a> <${EX}p> "x" .`,
      headers = {},
    } = answers[Math.min(sent.length - 1, answers.length - 1)] ?? {};
    const response = new Response([204, 304].includes(status) ? null : body, {
      status,
      headers: { "Content-Type": "text/turtle", ...headers },
    });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };
  return { fetch, sent };
}

/**
 * What the app relies on of the resource module (client/resources.ts):
 * the requests it makes and how it reads their answers. An
 * implementation passes these, or a caller breaks; the end-to-end tests
 * (e2e/pod) hold the same requests to real Solid servers.
 */
export function resourcesContract({ rdf, resources }: DataClient): void {
  const { buildThing, createSolidDataset, createThing, getThing, getThingAll, setThing } = rdf;
  const {
    createContainerAt,
    deleteContainer,
    deleteFile,
    deleteSolidDataset,
    getContainedResourceUrlAll,
    getFile,
    getProfileStorages,
    getSolidDataset,
    getSolidDatasetLinear,
    getSourceUrl,
    hasResourceInfo,
    overwriteFile,
    parseQuads,
    readDocument,
    solidDatasetAsTurtle,
    writeDocument,
  } = resources;

  /** The document at URL_ as read, holding `turtle`. */
  const read = (turtle = `<#a> <${EX}p> "x" .`) =>
    getSolidDatasetLinear(URL_, { fetch: turtleAt(turtle) });

  /** How many changes a dataset still holds to be written: none once it is saved. */
  const pending = (dataset: Parameters<typeof rdf.changesOf>[0]) => {
    const changes = rdf.changesOf(dataset);
    return (changes?.additions.length ?? 0) + (changes?.deletions.length ?? 0);
  };

  /** A dataset not read from anywhere, of one subject made by name. */
  const created = () =>
    setThing(
      createSolidDataset(),
      buildThing(createThing({ name: "a" }))
        .addStringNoLocale(`${EX}p`, "x")
        .build(),
    );

  describe("HttpError", () => {
    it("is what a failed request rejects with: the status and the response, and a message naming the URL and the status", async () => {
      const error = await getSolidDataset(URL_, {
        fetch: pod({ status: 404, body: "" }).fetch,
      }).catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({
        name: "HttpError",
        statusCode: 404,
        response: { status: 404 },
      });
      expect((error as HttpError).message).toContain(URL_);
      expect((error as HttpError).message).toContain("404");
    });

    it("is what a refused write rejects with", async () => {
      const { fetch } = pod({ status: 412, body: "" });
      await expect(writeDocument(URL_, createSolidDataset(), { fetch })).rejects.toMatchObject({
        statusCode: 412,
      });
    });

    it("is not made of a failure that is no answer of the server's: a text that does not parse", async () => {
      const error = await getSolidDatasetLinear(URL_, {
        fetch: pod({ body: "<#a> <#b> ." }).fetch,
      }).catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(HttpError);
    });
  });

  describe("reading documents", () => {
    it("reads a document through the fetch given, with the same Accept either way", async () => {
      const { fetch, sent } = pod();
      for (const reading of [getSolidDataset, getSolidDatasetLinear]) {
        const dataset = await reading(URL_, { fetch });
        expect(getThing(dataset, `${URL_}#a`)).not.toBeNull();
      }
      expect(sent.map(({ method, url }) => [method, url])).toEqual([
        ["GET", URL_],
        ["GET", URL_],
      ]);
      expect(sent[0]!.headers.get("Accept")).toBe(sent[1]!.headers.get("Accept"));
    });

    it("reads in one pass what getSolidDataset reads, frozen", async () => {
      const turtle = `<#a> <${EX}p> "x", 3 ; <${EX}q> <#b> .\n<#b> <${EX}p> "y"@en .`;
      const linear = await getSolidDatasetLinear(URL_, { fetch: turtleAt(turtle) });
      const plain = await getSolidDataset(URL_, { fetch: turtleAt(turtle) });
      const quads = (dataset: typeof plain) =>
        [...rdf.toRdfJsDataset(dataset)].map(
          (one) => `${one.subject.value} ${one.predicate.value} ${one.object.value}`,
        );
      expect(quads(linear).sort()).toEqual(quads(plain).sort());
      expect(getSourceUrl(linear)).toBe(URL_);
      expect(Object.isFrozen(linear)).toBe(true);
    });
  });

  describe("readDocument", () => {
    it("asks the pod, never the browser's cache, and gives the dataset with the version the pod gave", async () => {
      const { fetch, sent } = pod({ headers: { ETag: '"v1"' } });
      const answer = await readDocument(URL_, { fetch });
      if ("notModified" in answer)
        throw new Error("A read that asks for no version is never unchanged.");
      expect(answer.etag).toBe('"v1"');
      expect(getThing(answer.dataset, `${URL_}#a`)).not.toBeNull();
      expect(
        sent.map(({ method, cache, headers }) => [method, cache, headers.get("If-None-Match")]),
      ).toEqual([["GET", "no-store", null]]);
    });

    it("asks only for a version other than ifNoneMatch, and says when the document is still at it", async () => {
      const { fetch, sent } = pod({ status: 304 });
      await expect(readDocument(URL_, { fetch, ifNoneMatch: '"v1"' })).resolves.toEqual({
        notModified: true,
      });
      expect(sent.map(({ headers }) => headers.get("If-None-Match"))).toEqual(['"v1"']);
    });

    it("gives the document as it now is when it changed, and no version when the pod gives none", async () => {
      const changed = await readDocument(URL_, {
        fetch: pod({ headers: { ETag: '"v2"' } }).fetch,
        ifNoneMatch: '"v1"',
      });
      expect(changed).toMatchObject({ etag: '"v2"' });
      await expect(readDocument(URL_, { fetch: pod().fetch })).resolves.toMatchObject({
        etag: undefined,
      });
    });

    it("rejects as the server answered, a 304 never asked for among it", async () => {
      await expect(
        readDocument(URL_, { fetch: pod({ status: 404, body: "" }).fetch }),
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(readDocument(URL_, { fetch: pod({ status: 304 }).fetch })).rejects.toBeDefined();
    });
  });

  describe("writeDocument", () => {
    it("creates a new document with one PUT that only creates, and gives it as saved, with the version answered", async () => {
      const { fetch, sent } = pod({ status: 201, body: "", headers: { ETag: '"w1"' } });
      const written = await writeDocument(URL_, created(), { fetch });
      expect(getThing(written.dataset, `${URL_}#a`)).not.toBeNull();
      expect(getSourceUrl(written.dataset)).toBe(URL_);
      expect(written.etag).toBe('"w1"');
      expect(pending(written.dataset)).toBe(0);
      expect(
        sent.map(({ method, url, headers }) => [
          method,
          url,
          headers.get("If-None-Match"),
          headers.get("Content-Type"),
        ]),
      ).toEqual([["PUT", URL_, "*", "text/turtle"]]);
    });

    it("writes an edit of the document read as one PATCH of the app's own body, If-Match the version given", async () => {
      const edited = setThing(
        await read(),
        buildThing(getThing(await read(), `${URL_}#a`)!)
          .removeAll(`${EX}p`)
          .addStringNoLocale(`${EX}p`, "y")
          .build(),
      );
      const { fetch, sent } = pod({ status: 205, body: "" });
      const written = await writeDocument(URL_, edited, { fetch, ifMatch: '"v1"' });
      expect(written.etag).toBeUndefined();
      expect(pending(written.dataset)).toBe(0);
      expect(getThingAll(written.dataset).map((thing) => thing.url)).toEqual([`${URL_}#a`]);
      expect(
        sent.map(({ method, headers, body }) => [
          method,
          headers.get("If-Match"),
          headers.get("Content-Type"),
          body,
        ]),
      ).toEqual([
        [
          "PATCH",
          '"v1"',
          "application/sparql-update",
          patchBody(rdf.changesOf(edited), rdf.localNameOf),
        ],
      ]);
    });

    it("sends a PATCH refused as a conflict once more, its deleted decimals spelled as numbers", async () => {
      const dataset = await read(`<#a> <${EX}n> "1.0"^^<${XSD}decimal> .`);
      const edited = setThing(
        dataset,
        buildThing(getThing(dataset, `${URL_}#a`)!)
          .removeAll(`${EX}n`)
          .addDecimal(`${EX}n`, 2)
          .build(),
      );
      const { fetch, sent } = pod({ status: 409, body: "" }, { status: 205, body: "" });
      await writeDocument(URL_, edited, { fetch });
      expect(sent.map(({ method, body }) => [method, body])).toEqual([
        ["PATCH", patchBody(rdf.changesOf(edited), rdf.localNameOf)],
        ["PATCH", patchBody(rdf.changesOf(edited), rdf.localNameOf, true)],
      ]);
      expect(String(sent[1]!.body)).toContain(`"1"^^<${XSD}decimal>`);
    });

    it("writes an edit too large for one PATCH, or one asked to be whole, as one PUT of the document, If-Match", async () => {
      const large = setThing(
        await read(),
        buildThing(createThing({ url: `${URL_}#b` }))
          .addStringNoLocale(`${EX}p`, "x".repeat(MAX_PATCH_BYTES))
          .build(),
      );
      const small = setThing(await read(), createThing({ url: `${URL_}#b` }));
      for (const [dataset, whole] of [
        [large, false],
        [small, true],
      ] as const) {
        const { fetch, sent } = pod({ status: 205, body: "" });
        await writeDocument(URL_, dataset, { fetch, ifMatch: '"v1"', whole });
        expect(
          sent.map(({ method, headers }) => [
            method,
            headers.get("If-Match"),
            headers.get("Content-Type"),
          ]),
        ).toEqual([["PUT", '"v1"', "text/turtle"]]);
        expect(String(sent[0]!.body)).toContain(`<${URL_}#a>`);
      }
    });

    it("refuses a term Turtle cannot write as it is, sending nothing: in a new document, an edit, or a whole write", async () => {
      // A `>` would end the IRI, and what follows be read as statements (GHSA-x937-hx25-qfp4).
      const injected = `https://img.example/a.png#p> . <${URL_}> <${EX}q> <https://attacker.example/o`;
      const card = (dataset: ReturnType<typeof createSolidDataset>) =>
        setThing(
          dataset,
          buildThing(createThing({ url: `${URL_}#card` }))
            .addIri(`${EX}image`, injected)
            .build(),
        );
      const { fetch, sent } = pod({ status: 205, body: "" });
      for (const [dataset, whole] of [
        [card(createSolidDataset()), false],
        [card(await read()), false],
        [card(await read()), true],
      ] as const) {
        await expect(writeDocument(URL_, dataset, { fetch, whole })).rejects.toMatchObject({
          code: "unwritableTerm",
        });
      }
      expect(sent).toEqual([]);
    });
  });

  describe("deleteSolidDataset", () => {
    it("deletes the document, If-Match the version given", async () => {
      const { fetch, sent } = pod({ status: 204 });
      await deleteSolidDataset(URL_, { fetch });
      await deleteSolidDataset(URL_, { fetch, ifMatch: '"v1"' });
      expect(
        sent.map(({ method, url, headers }) => [method, url, headers.get("If-Match")]),
      ).toEqual([
        ["DELETE", URL_, null],
        ["DELETE", URL_, '"v1"'],
      ]);
    });
  });

  describe("containers and files", () => {
    it("creates and deletes a container, and writes, reads and deletes a file", async () => {
      const { fetch, sent } = pod({ status: 201, body: "" });
      await createContainerAt("https://pod.example/decks/", { fetch });
      await overwriteFile("https://pod.example/a.png", new Blob(["png"]), {
        contentType: "image/png",
        fetch,
      });
      const file = await getFile("https://pod.example/a.png", {
        fetch: pod({ body: "png", headers: { "Content-Type": "image/png" } }).fetch,
      });
      expect(await file.text()).toBe("png");
      await deleteFile("https://pod.example/a.png", { fetch: pod({ status: 204 }).fetch });
      await deleteContainer("https://pod.example/decks/", { fetch: pod({ status: 204 }).fetch });
      expect(
        sent.map(({ method, url, headers }) => [method, url, headers.get("Content-Type")]),
      ).toEqual([
        ["PUT", "https://pod.example/decks/", "text/turtle"],
        ["PUT", "https://pod.example/a.png", "image/png"],
      ]);
    });

    it("lists what a container read says it contains", async () => {
      const container = await getSolidDataset("https://pod.example/decks/", {
        fetch: pod({
          body: `<> <http://www.w3.org/ns/ldp#contains> <a.ttl>, <b/> .`,
        }).fetch,
      });
      expect(getContainedResourceUrlAll(container).sort()).toEqual([
        "https://pod.example/decks/a.ttl",
        "https://pod.example/decks/b/",
      ]);
    });
  });

  describe("getSourceUrl and hasResourceInfo", () => {
    it("name the document a dataset was read from, and none for one built here", async () => {
      const dataset = await read();
      expect([getSourceUrl(dataset), hasResourceInfo(dataset)]).toEqual([URL_, true]);
      const built = createSolidDataset();
      expect([getSourceUrl(built), hasResourceInfo(built)]).toEqual([null, false]);
    });
  });

  describe("solidDatasetAsTurtle", () => {
    it("writes a dataset as Turtle that reads back the same, with the prefixes given", async () => {
      const turtle = await solidDatasetAsTurtle(await read(), { prefixes: { ex: EX } });
      expect(turtle).toContain(`@prefix ex: <${EX}>`);
      const again = await getSolidDataset(URL_, { fetch: turtleAt(turtle) });
      expect(rdf.getStringNoLocale(getThing(again, `${URL_}#a`)!, `${EX}p`)).toBe("x");
    });
  });

  describe("getProfileStorages", () => {
    it("finds the pods a WebID document names", async () => {
      const webId = "https://alice.example/profile/card#me";
      const { fetch } = pod({
        body: `<#me> <http://www.w3.org/ns/pim/space#storage> <https://alice.example/> .`,
      });
      const webIdProfile = await getSolidDataset("https://alice.example/profile/card", { fetch });
      await expect(getProfileStorages(webId, { fetch, webIdProfile })).resolves.toEqual([
        "https://alice.example/",
      ]);
    });
  });

  describe("parseQuads", () => {
    it("reads Turtle, its relative IRIs resolved against the base", async () => {
      const quads = await parseQuads(`<#a> <${EX}p> "x" .`, "turtle", URL_);
      expect(quads.map((one) => [one.subject.value, one.object.value])).toEqual([
        [`${URL_}#a`, "x"],
      ]);
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
}
