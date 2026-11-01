// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { growthAsync } from "@solid-memo/domain/testing/growth";
import { JsonLdParser } from "jsonld-streaming-parser";
import { describe, expect, it, vi } from "vitest";
import { HttpError, ReadLimitError } from "../../client/interface";
import { limitedFetch, NO_SIZE_LIMITS, RELEASE_LIMITS } from "../../client/readLimits";
import { MAX_PATCH_BYTES, patchBody } from "../../client/sparqlUpdate";
import { type DataClient, turtleAt } from "./rdf";

const URL_ = "https://pod.example/decks/deck.ttl";
const EX = "https://example.com/ns#";

/** The parser's job for each JSON value it reads, which a test counts. */
type ValueJobs = { newOnValueJob: (...args: unknown[]) => Promise<void> };
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

  describe("read limits", () => {
    const turtle = `<#a> <${EX}p> "x", "y", "z" .`;

    it("reads a document within its limits as any other", async () => {
      const fetch = limitedFetch(turtleAt(turtle), {
        bytes: turtle.length,
        quads: 3,
        characters: 1000,
      });
      const dataset = await getSolidDatasetLinear(URL_, { fetch });
      expect(getThing(dataset, `${URL_}#a`)).not.toBeNull();
      const answer = await readDocument(URL_, { fetch });
      expect("dataset" in answer).toBe(true);
    });

    it("refuses a body past its bytes, and a document past its triples, with a ReadLimitError", async () => {
      const limits = [
        { bytes: turtle.length - 1, quads: 3, characters: 1000 },
        { bytes: turtle.length, quads: 2, characters: 1000 },
        { bytes: turtle.length, quads: 3, characters: 200 },
      ];
      for (const limit of limits) {
        const fetch = limitedFetch(turtleAt(turtle), limit);
        for (const read of [
          () => getSolidDatasetLinear(URL_, { fetch }),
          () => readDocument(URL_, { fetch }),
        ]) {
          const error = await read().catch((failure: unknown) => failure);
          expect(error).toBeInstanceOf(ReadLimitError);
          expect(error).toMatchObject({ name: "ReadLimitError", url: URL_, limits: limit });
        }
      }
    });

    it("counts the characters of the terms a prefix stands for, not of the text that says them", async () => {
      const long = `${EX}${"n".repeat(10_000)}/`;
      const objects = Array.from({ length: 50 }, (_, at) => `p:o${at}`).join(", ");
      const text = `@prefix p: <${long}> . p:a p:p ${objects} .`;
      const limits = { bytes: text.length, quads: 50, characters: 100_000 };
      const fetch = limitedFetch(turtleAt(text), limits);
      for (const read of [
        () => getSolidDatasetLinear(URL_, { fetch }),
        () => readDocument(URL_, { fetch }),
      ]) {
        await expect(read()).rejects.toMatchObject({ name: "ReadLimitError", limits });
      }
      const within = limitedFetch(turtleAt(text), { ...limits, characters: 50 * 3 * 10_100 });
      expect(
        getThing(await getSolidDatasetLinear(URL_, { fetch: within }), `${long}a`),
      ).not.toBeNull();
    });

    it("refuses a document at its base when it declares one too often, and reads one that declares it a few times", async () => {
      const bases = (count: number) => `${"@base <https://pod.example/decks/> .\n".repeat(count)}`;
      const past = `${bases(17)}<a> <${EX}p> "x" .`;
      // Limits the text is well within but for its bases.
      const limits = { bytes: past.length, quads: 10, characters: 100_000 };
      const fetch = limitedFetch(turtleAt(past), limits);
      for (const read of [
        () => getSolidDatasetLinear(URL_, { fetch }),
        () => readDocument(URL_, { fetch }),
        () => parseQuads(past, "turtle", URL_, limits),
      ]) {
        await expect(read()).rejects.toMatchObject({ name: "ReadLimitError", url: URL_, limits });
      }
      // Each relative base adds to the one before, which the parser walks for each one.
      const few = `${"@base <x/> .\n".repeat(16)}<a> <${EX}p> "x" .`;
      const subject = `https://pod.example/decks/${"x/".repeat(16)}a`;
      const dataset = await getSolidDatasetLinear(URL_, {
        fetch: limitedFetch(turtleAt(few), limits),
      });
      expect(getThing(dataset, subject)).not.toBeNull();
      const [quad] = await parseQuads(few, "turtle", URL_, limits);
      expect(quad?.subject.value).toBe(subject);
      // A text from the user's own pod, read with no limits, is held to as few.
      await expect(parseQuads(past, "turtle", URL_)).rejects.toMatchObject({
        name: "ReadLimitError",
        url: URL_,
        limits: NO_SIZE_LIMITS,
        message: expect.stringContaining("declarations than a read takes in"),
      });
      for (const read of [
        () => getSolidDatasetLinear(URL_, { fetch: turtleAt(past) }),
        () => readDocument(URL_, { fetch: turtleAt(past) }),
      ]) {
        await expect(read()).rejects.toMatchObject({ name: "ReadLimitError", url: URL_ });
      }
    });

    it("refuses a document at its base when the base is too long, and reads one whose base is not", async () => {
      // The parser walks the whole base for each relative IRI it resolves against it.
      const based = (length: number) =>
        `@base <${"a".repeat(length)}/> .\n${"<./b> <./b> <./b> .\n".repeat(1_000)}`;
      const past = based(600);
      // Limits the text is well within but for its base.
      const limits = { bytes: past.length, quads: 1_000, characters: 100_000_000 };
      const fetch = limitedFetch(turtleAt(past), limits);
      for (const read of [
        () => getSolidDatasetLinear(URL_, { fetch }),
        () => readDocument(URL_, { fetch }),
        () => parseQuads(past, "turtle", URL_, limits),
      ]) {
        await expect(read()).rejects.toMatchObject({ name: "ReadLimitError", url: URL_, limits });
      }
      const within = based(300);
      const subject = `https://pod.example/decks/${"a".repeat(300)}/b`;
      const dataset = await getSolidDatasetLinear(URL_, {
        fetch: limitedFetch(turtleAt(within), limits),
      });
      expect(getThing(dataset, subject)).not.toBeNull();
      expect(await parseQuads(within, "turtle", URL_, limits)).toHaveLength(1_000);
      // A text from the user's own pod, read with no limits, is held to as short a base.
      await expect(parseQuads(past, "turtle", URL_)).rejects.toMatchObject({
        name: "ReadLimitError",
        limits: NO_SIZE_LIMITS,
      });
      expect(await parseQuads(within, "turtle", URL_)).toHaveLength(1_000);
    });

    it("refuses a document whose base is too long past a comment that names a short one", async () => {
      const past = `@base # <>\n<${"a".repeat(600)}/> .\n${"<./b> <./b> <./b> .\n".repeat(1_000)}`;
      const limits = { bytes: past.length, quads: 1_000, characters: 100_000_000 };
      const fetch = limitedFetch(turtleAt(past), limits);
      for (const read of [
        () => getSolidDatasetLinear(URL_, { fetch }),
        () => readDocument(URL_, { fetch }),
        () => parseQuads(past, "turtle", URL_, limits),
      ]) {
        await expect(read()).rejects.toMatchObject({ name: "ReadLimitError", url: URL_, limits });
      }
    });

    it("reads a document whose text speaks of bases and prefixes, as a release's cards may, as any other", async () => {
      const texts = [
        "When the base < 2, the logarithm is undefined.",
        "Run git rebase <main> to replay the commits.",
        "BASE <https://pod.example/> sets the base.",
        "Database<br>",
        "Write @base <../> . to go up a level.",
        "@prefix ex: <x> . names a prefix.",
      ];
      // More of them than a document may declare bases, in short, long and single-quoted strings.
      const cards = Array.from({ length: 20 }, (_, at) => {
        const text = texts[at % texts.length]!;
        const literal = [`"${text}"`, `"""${text}\n"""`, `'${text}'`][at % 3];
        return `<#c${at}> <${EX}text> ${literal} .\n`;
      }).join("");
      const fetch = limitedFetch(turtleAt(cards), RELEASE_LIMITS);
      const dataset = await getSolidDatasetLinear(URL_, { fetch });
      expect(getThing(dataset, `${URL_}#c19`)).not.toBeNull();
      expect("dataset" in (await readDocument(URL_, { fetch }))).toBe(true);
      const quads = await parseQuads(cards, "turtle", URL_, RELEASE_LIMITS);
      expect(quads).toHaveLength(20);
      expect(quads[0]?.object.value).toBe(texts[0]);
    });

    it("refuses a document at its base when the base's path has dot segments, and at its prefixes when it declares too many", async () => {
      const limits = { bytes: Number.MAX_SAFE_INTEGER, quads: 1_000, characters: 100_000_000 };
      for (const past of [
        `@base <https://pod.example/${"../".repeat(100)}> .\n<a> <${EX}p> "x" .`,
        `@base <https://pod.example/a//b/> .\n<a> <${EX}p> "x" .`,
        `${"PREFIX : <.>\n".repeat(4097)}<a> <${EX}p> "x" .`,
      ]) {
        const fetch = limitedFetch(turtleAt(past), limits);
        for (const read of [
          () => getSolidDatasetLinear(URL_, { fetch }),
          () => readDocument(URL_, { fetch }),
          () => parseQuads(past, "turtle", URL_, limits),
        ]) {
          await expect(read()).rejects.toMatchObject({ name: "ReadLimitError", url: URL_, limits });
        }
      }
      const few = `${"PREFIX : <.>\n".repeat(4096)}:a <${EX}p> "x" .`;
      const [quad] = await parseQuads(few, "turtle", URL_, limits);
      expect(quad?.subject.value).toBe("https://pod.example/decks/a");
    });

    it("reads a document whose relative base has dot segments, as one written by hand may, with limits or with none", async () => {
      // The parser resolves a relative base against the one before, which removes them.
      const text = `@base <./> .\n@base <../a/./> .\n<b#it> <${EX}p> "x" .`;
      const subject = "https://pod.example/a/b#it";
      for (const fetch of [turtleAt(text), limitedFetch(turtleAt(text), RELEASE_LIMITS)]) {
        for (const reading of [getSolidDataset, getSolidDatasetLinear]) {
          expect(getThing(await reading(URL_, { fetch }), subject)).not.toBeNull();
        }
        expect("dataset" in (await readDocument(URL_, { fetch }))).toBe(true);
      }
      for (const limits of [undefined, RELEASE_LIMITS]) {
        const [quad] = await parseQuads(text, "turtle", URL_, limits);
        expect(quad?.subject.value).toBe(subject);
      }
    });

    it("refuses a text of prefixes, or of IRIs that go up from a base, in time that does not grow with the rest", async () => {
      const limits = { bytes: Number.MAX_SAFE_INTEGER, quads: 10, characters: 100_000_000 };
      const dotted = `@base <https://pod.example/${"../".repeat(160)}> .\n`;
      const longest = `@base <https://pod.example/${"a/".repeat(240)}> .\n`;
      for (const [head, line] of [
        [dotted, "PREFIX :<.>\n"],
        [dotted, "<.> <.> <.> .\n"],
        [longest, "PREFIX :<.>\n"],
      ]) {
        // A text eight times as long must take less than half as long as the short one done eight times over.
        const ratio = await growthAsync(
          (count) => {
            const text = `${head}${line.repeat(count)}`;
            return () => parseQuads(text, "turtle", URL_, limits).catch(() => undefined);
          },
          20_000,
          8,
        );
        expect(ratio).toBeLessThan(0.5);
      }
    });

    it("refuses a chain of relative bases read with no limits, as from the user's own pod, in time that does not grow with it", async () => {
      // Each relative base the parser resolves against the one before, walking all of it.
      const chain = (count: number) =>
        `${`@base <${"a".repeat(40)}/> .\n`.repeat(count)}<s> <p> <o> .`;
      for (const read of [
        (text: string) => parseQuads(text, "turtle", URL_),
        (text: string) => getSolidDatasetLinear(URL_, { fetch: turtleAt(text) }),
        (text: string) => readDocument(URL_, { fetch: turtleAt(text) }),
        // As a container's listing, a draft's folder or a profile is read.
        (text: string) => getSolidDataset(URL_, { fetch: turtleAt(text) }),
        (text: string) =>
          getSolidDataset(URL_, { fetch: limitedFetch(turtleAt(text), RELEASE_LIMITS) }),
      ]) {
        await expect(read(chain(5_000))).rejects.toMatchObject({
          name: "ReadLimitError",
          url: URL_,
        });
        // Eight times the text must take less than four times as long as an eighth of it done eight times over (testing.md).
        const ratio = await growthAsync(
          (count) => {
            const text = chain(count);
            return () => read(text).catch(() => undefined);
          },
          2_000,
          8,
        );
        expect(ratio).toBeLessThan(4);
      }
    });

    it("stops parsing a Turtle text at its first triple past the limits, however long the rest", async () => {
      // A base as long as is let through, and IRIs that go up from it: each walks the whole base.
      const head = `@base <https://pod.example/${"a/".repeat(200)}> .\n${"<a> <b> <c> .\n".repeat(20)}`;
      const limits = { bytes: Number.MAX_SAFE_INTEGER, quads: 10, characters: 100_000_000 };
      // A text eight times as long must take less than half as long as the short one done eight times over.
      const ratio = await growthAsync(
        (count) => {
          const text = `${head}${"<../b> <../b> <../b> .\n".repeat(count)}`;
          return () => parseQuads(text, "turtle", URL_, limits).catch(() => undefined);
        },
        20_000,
        8,
      );
      expect(ratio).toBeLessThan(0.5);
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

    it("gives a subject made by name, and a link to one, as the document saved names them", async () => {
      const { fetch, sent } = pod({ status: 201, body: "", headers: { ETag: '"w1"' } });
      const b = createThing({ name: "b" });
      const linked = setThing(
        created(),
        buildThing(b)
          .addUrl(`${EX}link`, createThing({ name: "a" }))
          .addUrl(`${EX}other`, `${EX}x`)
          .build(),
      );
      const written = await writeDocument(URL_, linked, { fetch });
      const saved = getThing(written.dataset, `${URL_}#b`)!;
      expect(rdf.getUrlAll(saved, `${EX}link`)).toEqual([`${URL_}#a`]);
      expect(rdf.getUrlAll(saved, `${EX}other`)).toEqual([`${EX}x`]);
      expect(getThing(written.dataset, `${URL_}#a`)).not.toBeNull();
      expect(sent[0]!.body).toContain("<#b>");
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

    it("rejects JSON-LD that names a context elsewhere, fetching nothing", async () => {
      const fetch = vi.spyOn(globalThis, "fetch");
      try {
        for (const context of ["https://evil.example/c", { "@import": "https://evil.example/c" }]) {
          const json = JSON.stringify({ "@context": context, "@id": "#a", [`${EX}p`]: "x" });
          await expect(parseQuads(json, "jsonld", URL_)).rejects.toBeDefined();
        }
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        fetch.mockRestore();
      }
    });

    it("reads no RDF-star in JSON-LD: an annotation gives no triple, and a triple term does not parse", async () => {
      const annotated = JSON.stringify({
        "@context": { ex: EX },
        "@graph": [{ "@id": "#a", "ex:p": { "@value": "x", "@annotation": { "ex:q": "y" } } }],
      });
      const quads = await parseQuads(annotated, "jsonld", URL_);
      expect(quads.map((one) => [one.subject.value, one.object.value])).toEqual([
        [`${URL_}#a`, "x"],
      ]);
      const triple = JSON.stringify({
        "@context": { ex: EX },
        "@id": { "@id": "#a", "ex:p": "x" },
        "ex:q": "y",
      });
      await expect(parseQuads(triple, "jsonld", URL_)).rejects.toBeDefined();
    });

    it("reads JSON-LD as it streams: a context after a node's other keys does not parse", async () => {
      const node = { "@id": "#a", "@type": "ex:T", "ex:p": "x" };
      const after = JSON.stringify({ ...node, "@context": { ex: EX } });
      await expect(parseQuads(after, "jsonld", URL_)).rejects.toBeDefined();
      const first = JSON.stringify({ "@context": { ex: EX }, ...node });
      await expect(parseQuads(first, "jsonld", URL_)).resolves.toHaveLength(2);
    });

    it("rejects a text past its limits' triples, in either format, with a ReadLimitError", async () => {
      const limits = { bytes: 1000, quads: 2, characters: 1000 };
      const texts = [
        [`<#a> <${EX}p> "x", "y" .`, `<#a> <${EX}p> "x", "y", "z" .`],
        [
          JSON.stringify({ "@id": "#a", [`${EX}p`]: ["x", "y"] }),
          JSON.stringify({ "@id": "#a", [`${EX}p`]: ["x", "y", "z"] }),
        ],
      ] as const;
      for (const [format, [within, past]] of [
        ["turtle", texts[0]],
        ["jsonld", texts[1]],
      ] as const) {
        await expect(parseQuads(within, format, URL_, limits)).resolves.toHaveLength(2);
        const error = await parseQuads(past, format, URL_, limits).catch(
          (failure: unknown) => failure,
        );
        expect(error).toBeInstanceOf(ReadLimitError);
        expect(error).toMatchObject({ url: URL_, limits });
      }
    });

    it("stops parsing JSON-LD once past its limits, reading no further than the part it is in", async () => {
      // A @graph container gives each element's triple again for every element before it.
      const elements = 2000;
      const text = JSON.stringify({
        "@context": { "@vocab": EX, g: { "@container": "@graph" } },
        "@id": "#s",
        g: Array.from({ length: elements }, (_, at) => ({ "@id": `#o${at}`, p: "v" })),
      });
      const values = vi.spyOn(JsonLdParser.prototype as unknown as ValueJobs, "newOnValueJob");
      try {
        const limits = { bytes: text.length, quads: 100, characters: 1_000_000 };
        await expect(parseQuads(text, "jsonld", URL_, limits)).rejects.toBeInstanceOf(
          ReadLimitError,
        );
        // Anything the parser had still to do would run before this.
        await new Promise((resolve) => setTimeout(resolve));
        expect(values.mock.calls.length).toBeLessThan(elements);
      } finally {
        values.mockRestore();
      }
    });

    it("rejects a text whose terms, as a prefix or a context makes them, are past its limits' characters", async () => {
      const long = `${EX}${"n".repeat(10_000)}/`;
      const limits = { bytes: 1000, quads: 100, characters: 100_000 };
      const names = Array.from({ length: 50 }, (_, at) => `o${at}`);
      const texts = {
        turtle: `@prefix p: <${long}> . p:a p:p ${names.map((name) => `p:${name}`).join(", ")} .`,
        jsonld: JSON.stringify({
          "@context": { "@vocab": long, x: long },
          "@id": "x:a",
          p: names.map((name) => ({ "@id": `x:${name}` })),
        }),
      };
      for (const format of ["turtle", "jsonld"] as const) {
        await expect(parseQuads(texts[format], format, URL_, limits)).rejects.toMatchObject({
          name: "ReadLimitError",
          limits,
        });
      }
    });
  });
}
