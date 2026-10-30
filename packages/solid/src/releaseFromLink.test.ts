// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import type { DocumentReport } from "@solid-memo/domain/validation";
import { RELEASE_LIMITS } from "./client/readLimits";
import type { Dataset } from "./client/rdf";
import { toLibraryDeckContent } from "./mappers/libraryMapper";
import { createSolidDeckLibrary } from "./solidDeckLibrary";

/**
 * A release added from a link (docs/deck-library.md, From a link), read
 * as the library adapter reads it: on its own, with no index, and its
 * creator's catalog looked for above it.
 */

const RELEASES = "https://alice.example/solid-memo/main/releases/capitals/";
const V1 = `${RELEASES}v1.ttl`;
const V2 = `${RELEASES}v2.ttl`;
const STANDALONE = readFileSync(
  join(VOCAB_ROOT, "fixtures/library-deck/v6/valid/library-standalone-release.ttl"),
  "utf8",
);
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

/** A fetch that answers each address with its document, as Turtle, or with `status` (404 when it has none). */
function serving(
  documents: Record<string, string | number>,
): typeof globalThis.fetch & { asked: string[] } {
  const asked: string[] = [];
  const fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    asked.push(url);
    const document = documents[url] ?? 404;
    const response =
      typeof document === "number"
        ? new Response("", { status: document })
        : new Response(document, { status: 200, headers: { "Content-Type": "text/turtle" } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };
  return Object.assign(fetch, { asked });
}

/** What the library's shapes say of a release: nothing wrong. */
const conforming = async (url: string): Promise<DocumentReport> => ({
  url,
  status: "checked",
  subjects: [],
});

const libraryOver = (
  fetch: typeof globalThis.fetch,
  validate: (url: string, dataset: Dataset) => Promise<DocumentReport> = conforming,
) =>
  createSolidDeckLibrary({ fetch, indexUrl: "https://solid-memo.com/decks/index.ttl", validate });

/** A fetch that answers each read of a document with the next of its answers, the last once they run out. */
function answering(documents: Record<string, string[]>): typeof globalThis.fetch & {
  asked: string[];
} {
  const asked: string[] = [];
  const fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const answers = documents[url] ?? [];
    const document = answers[asked.filter((other) => other === url).length] ?? answers.at(-1);
    asked.push(url);
    const response =
      document === undefined
        ? new Response("", { status: 404 })
        : new Response(document, { status: 200, headers: { "Content-Type": "text/turtle" } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  };
  return Object.assign(fetch, { asked });
}

/** The standalone release with Norway's capital another: a read that differs from the first. */
const CHANGED = STANDALONE.replace('"Oslo"@en', '"Bergen"@en');

/** An instance's catalog that links the releases it published. */
const catalog = (instance: string, releases: string[]) =>
  `<${instance}catalog.ttl#catalog> a <http://www.w3.org/ns/dcat#Catalog> ; <${SM}publishedRelease> ${releases.map((url) => `<${url}>`).join(", ")} .`;

describe("readRelease", () => {
  it("reads a release published in a pod on its own: its series' every version, its creator and its live cards", async () => {
    const release = await libraryOver(serving({ [V2]: STANDALONE })).readRelease(V2);
    expect(release).toEqual({
      url: V2,
      seriesUrl: `${V1}#series`,
      version: "2",
      versionNotes: "Added Norway.",
      releases: [
        { url: V1, version: "1" },
        { url: V2, version: "2", issued: "2026-10-10T10:00:00.000Z", notes: "Added Norway." },
      ],
      title: { en: "Capitals", sv: "Huvudstäder" },
      description: { en: "Capitals of the world.", sv: "Världens huvudstäder." },
      cardCount: 2,
      languages: [
        "http://publications.europa.eu/resource/authority/language/ENG",
        "http://publications.europa.eu/resource/authority/language/SWE",
      ],
      authors: ["Alice"],
      license: "https://creativecommons.org/publicdomain/zero/1.0/",
      direction: "front-to-back",
      themes: [
        "http://publications.europa.eu/resource/authority/data-theme/EDUC",
        "https://solid-memo.com/ns/vocab/topics.ttl#geography",
      ],
      keywords: { en: ["capitals"], sv: ["huvudstäder"] },
      sources: [],
    });
  });

  it("reads afresh each time: an address may hold another document later", async () => {
    const fetch = serving({ [V2]: STANDALONE });
    const library = libraryOver(fetch);
    await library.readRelease(V2);
    await library.readRelease(V2);
    expect(fetch.asked).toEqual([V2, V2]);
  });

  it("with `accept`, checks the very read it shows, and keeps it as the release's for the cards imported", async () => {
    const fetch = answering({ [V2]: [STANDALONE, CHANGED] });
    const validate = vi.fn((url: string, _dataset: Dataset) => conforming(url));
    const library = libraryOver(fetch, validate);
    const accept = vi.fn();
    const release = await library.readRelease(V2, accept);
    expect(release.cardCount).toBe(2);
    expect(accept).toHaveBeenCalledExactlyOnceWith({ url: V2, status: "checked", subjects: [] });
    const [url, dataset] = validate.mock.calls[0]!;
    expect(url).toBe(V2);
    // The cards and a course's outline are those of the read checked: the address is not read again.
    const backs = async () =>
      (await library.fetchLibraryDeck(V2)).cards.map((card) => card.back.en).sort();
    expect(await backs()).toEqual(["Oslo", "Stockholm"]);
    await expect(library.fetchCourseOutline(V2)).resolves.toEqual({
      releaseUrl: V2,
      chapters: [],
    });
    expect(fetch.asked).toEqual([V2]);
    expect(toLibraryDeckContent(V2, dataset).cards).toEqual(
      (await library.fetchLibraryDeck(V2)).cards,
    );
    // A later read accepted is the release's then, in place of the one before.
    await library.readRelease(V2, accept);
    expect(await backs()).toEqual(["Bergen", "Stockholm"]);
    expect(fetch.asked).toEqual([V2, V2]);
  });

  it("with `accept`, keeps no read it refuses: the release is read again for its cards", async () => {
    const fetch = answering({ [V2]: [CHANGED, STANDALONE] });
    const library = libraryOver(fetch);
    const refused = new Error("breaks its shapes");
    await expect(
      library.readRelease(V2, () => {
        throw refused;
      }),
    ).rejects.toBe(refused);
    expect((await library.fetchLibraryDeck(V2)).cards.map((card) => card.back.en)).toContain(
      "Oslo",
    );
    expect(fetch.asked).toEqual([V2, V2]);
  });

  it("with `accept`, keeps its read though an earlier read of the release fails after it", async () => {
    let failEarlier = () => {};
    const earlier = new Promise<void>((resolve) => {
      failEarlier = resolve;
    });
    const asked: string[] = [];
    const fetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      const first = asked.push(url) === 1;
      if (first) await earlier;
      const response = first
        ? new Response("", { status: 500 })
        : new Response(STANDALONE, { status: 200, headers: { "Content-Type": "text/turtle" } });
      Object.defineProperty(response, "url", { value: url });
      return response;
    };
    const library = libraryOver(fetch);
    const failed = library.fetchLibraryDeck(V2);
    await library.readRelease(V2, () => undefined);
    failEarlier();
    await expect(failed).rejects.toThrow();
    await expect(library.fetchLibraryDeck(V2)).resolves.toMatchObject({ url: V2 });
    expect(asked).toEqual([V2, V2]);
  });

  it("checks nothing, and keeps nothing, without `accept`", async () => {
    const fetch = answering({ [V2]: [STANDALONE, CHANGED] });
    const validate = vi.fn(conforming);
    const library = libraryOver(fetch, validate);
    await library.readRelease(V2);
    expect(validate).not.toHaveBeenCalled();
    expect((await library.fetchLibraryDeck(V2)).cards.map((card) => card.back.en)).toContain(
      "Bergen",
    );
  });

  it("refuses an address with nothing to read as a release, or no deck in it", async () => {
    const library = libraryOver(
      serving({ [V1]: '<#it> <http://purl.org/dc/terms/title> "Not a deck" .' }),
    );
    await expect(library.readRelease(V2)).rejects.toMatchObject({ code: "releaseUnreadable" });
    await expect(library.readRelease(V1)).rejects.toMatchObject({ code: "notADeck" });
  });

  it("refuses a release larger than a release may be, in bytes or in triples, before reading it all", async () => {
    // A server that says the body is a gigabyte.
    const huge = async (input: RequestInfo | URL) => {
      const response = new Response(STANDALONE, {
        status: 200,
        headers: { "Content-Type": "text/turtle", "Content-Length": String(2 ** 30) },
      });
      Object.defineProperty(response, "url", { value: String(input) });
      return response;
    };
    await expect(libraryOver(huge).readRelease(V2)).rejects.toMatchObject({
      code: "releaseTooLarge",
      vars: { url: V2, bytes: RELEASE_LIMITS.bytes, quads: RELEASE_LIMITS.quads },
    });
    const many = `<#it> <${SM}p> ${Array.from({ length: RELEASE_LIMITS.quads + 1 }, (_, at) => at).join(",")} .`;
    await expect(libraryOver(serving({ [V2]: many })).readRelease(V2)).rejects.toMatchObject({
      code: "releaseTooLarge",
    });
  });

  it("refuses a short release whose prefix makes its terms longer than a release's, before building any of it", async () => {
    // Some hundred kilobytes, far within the bytes and triples, that a prefix makes gigabytes of terms.
    const prefix = `https://alice.example/${"n".repeat(100_000)}/`;
    const lines = Array.from({ length: 4_000 }, (_, at) => `p:s${at} p:p p:o${at} .`).join("\n");
    const amplified = `@prefix p: <${prefix}> .\n${lines}`;
    expect(amplified.length).toBeLessThan(RELEASE_LIMITS.bytes / 100);
    const library = libraryOver(serving({ [V2]: amplified }));
    await expect(library.readRelease(V2)).rejects.toMatchObject({ code: "releaseTooLarge" });
    // So is a release the library reads for a copy's content.
    await expect(library.fetchLibraryDeck(V2)).rejects.toMatchObject({ code: "releaseTooLarge" });
  });
});

describe("publishedBeside", () => {
  it("finds the catalog above the release that links it, nearest first, as anyone reads it", async () => {
    const instance = "https://alice.example/solid-memo/main/";
    const fetch = serving({
      [`${RELEASES}catalog.ttl`]: 401,
      "https://alice.example/solid-memo/main/releases/catalog.ttl": catalog(
        "https://alice.example/solid-memo/main/releases/",
        ["https://elsewhere.example/v1.ttl"],
      ),
      [`${instance}catalog.ttl`]: catalog(instance, [V1, V2]),
    });
    await expect(libraryOver(fetch).publishedBeside(V1)).resolves.toEqual([V1, V2]);
    expect(fetch.asked).toEqual([
      `${RELEASES}catalog.ttl`,
      `${instance}releases/catalog.ttl`,
      `${instance}catalog.ttl`,
    ]);
  });

  it("looks no more than eight folders up, however deep the release's address", async () => {
    const deep = `https://alice.example/${"a/".repeat(1_000)}v1.ttl`;
    const fetch = serving({
      "https://alice.example/catalog.ttl": catalog("https://alice.example/", [deep]),
    });
    await expect(libraryOver(fetch).publishedBeside(deep)).resolves.toBeNull();
    expect(fetch.asked).toHaveLength(8);
  });

  it("passes over a catalog larger than a release may be", async () => {
    const instance = "https://alice.example/solid-memo/main/";
    const fetch = serving({
      [`${instance}catalog.ttl`]: `${catalog(instance, [V1, V2])}\n${"#".repeat(RELEASE_LIMITS.bytes)}`,
    });
    await expect(libraryOver(fetch).publishedBeside(V1)).resolves.toBeNull();
  });

  it("is null when no catalog that links the release can be read, up to the host's root", async () => {
    const fetch = serving({ "https://alice.example/catalog.ttl": 403 });
    await expect(
      libraryOver(fetch).publishedBeside("https://alice.example/memo/v1.ttl"),
    ).resolves.toBeNull();
    expect(fetch.asked).toEqual([
      "https://alice.example/memo/catalog.ttl",
      "https://alice.example/catalog.ttl",
    ]);
  });
});
