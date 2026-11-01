// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { createLibraryUseCases } from "@solid-memo/application/library";
import type { Deck } from "@solid-memo/domain/deck";
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

  it("lists only the versions of its series at an address a release may have, as a catalog's links", async () => {
    const odd = [
      "data:text/turtle,%3C%3E%20a%20%3Chttps%3A%2F%2Fsolid-memo.com%2Fns%2Fvocab%2Fv1.ttl%23Deck%3E.",
      `${RELEASES}v3.ttl#frag`,
      "https://ALICE.example:443/solid-memo/main/releases/capitals/v9.ttl",
    ];
    const listing = STANDALONE.replace(
      `dcat:hasVersion <${V1}> ,`,
      `dcat:hasVersion <${V1}> , ${odd.map((url) => `<${url}>`).join(" , ")} ,`,
    ).replace(
      "<#alice>\n    a foaf:Agent",
      `${odd.map((url) => `<${url}> a dcat:Dataset ; dcat:version "3" .`).join("\n")}\n\n<#alice>\n    a foaf:Agent`,
    );
    expect(listing).toContain(odd[2]);
    const release = await libraryOver(serving({ [V2]: listing })).readRelease(V2);
    expect(release.releases.map((one) => one.url)).toEqual([V1, V2]);
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

  it("gives only the links at an address a release may have, as the user's own catalog's", async () => {
    const instance = "https://alice.example/solid-memo/main/";
    const fetch = serving({
      [`${instance}catalog.ttl`]: catalog(instance, [
        V1,
        "data:text/turtle,%3C%3E%20a%20%3Chttps%3A%2F%2Fsolid-memo.com%2Fns%2Fvocab%2Fv1.ttl%23Deck%3E.",
        `${RELEASES}v3.ttl#frag`,
        "https://ALICE.example:443/solid-memo/main/releases/capitals/v9.ttl",
        V2,
      ]),
    });
    await expect(libraryOver(fetch).publishedBeside(V1)).resolves.toEqual([V1, V2]);
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

describe("linkedReads", () => {
  /** Triples past the release, of a subject no shape has: `count` of them. */
  const padding = (count: number) =>
    `\n<#padding> <${SM}padding> ${Array.from({ length: count }, (_, at) => at).join(",")} .\n`;

  it("reads releases as the library does, each once, but keeps them to itself, never in the library", async () => {
    const fetch = serving({ [V2]: STANDALONE });
    const library = libraryOver(fetch);
    const reads = library.linkedReads();
    await expect(reads.readRelease(V2, () => undefined)).resolves.toMatchObject({ cardCount: 2 });
    // The read checked is the one planned with.
    await expect(reads.fetchLibraryDeck(V2)).resolves.toMatchObject({ url: V2 });
    await expect(reads.fetchCourseOutline(V2)).resolves.toEqual({ releaseUrl: V2, chapters: [] });
    expect(fetch.asked).toEqual([V2]);
    // Neither the library nor the next plan's reads have it.
    await library.fetchLibraryDeck(V2);
    await library.linkedReads().fetchLibraryDeck(V2);
    expect(fetch.asked).toEqual([V2, V2, V2]);
    // Nor do they give what the library keeps.
    await library.linkedReads().fetchLibraryDeck(V2);
    expect(fetch.asked).toEqual([V2, V2, V2, V2]);
  });

  it("reads all its releases under one release's limits together: the one past them is linkedReleasesTooLarge, of them all", async () => {
    const half = padding(RELEASE_LIMITS.quads / 2);
    const v3 = `${RELEASES}v3.ttl`;
    const fetch = serving({
      [V2]: STANDALONE + half,
      [v3]: STANDALONE.replace(`<${V2}>`, `<${v3}>`) + half,
    });
    const library = libraryOver(fetch);
    const reads = library.linkedReads();
    await reads.readRelease(V2, () => undefined);
    await expect(reads.readRelease(v3, () => undefined)).rejects.toMatchObject({
      code: "linkedReleasesTooLarge",
      vars: { host: "alice.example" },
    });
    await expect(reads.fetchLibraryDeck(v3)).rejects.toMatchObject({
      code: "linkedReleasesTooLarge",
    });
    // Not as one that could not be read at all.
    await expect(library.linkedReads().readRelease(`${RELEASES}v9.ttl`)).rejects.toMatchObject({
      code: "releaseUnreadable",
    });
    // Each is within a release's limits on its own.
    await expect(library.readRelease(v3)).resolves.toMatchObject({ url: v3 });
    await expect(library.linkedReads().readRelease(v3)).resolves.toMatchObject({ url: v3 });
  });
});

describe("linkedReads of a release's catalogs", () => {
  it("reads its creator's catalogs under the limits it reads releases under, with them", async () => {
    // A catalog in each folder above the release, none of them linking it: a quarter of a release's limits each.
    const folders = [
      RELEASES,
      "https://alice.example/solid-memo/main/releases/",
      "https://alice.example/solid-memo/main/",
      "https://alice.example/solid-memo/",
      "https://alice.example/",
    ];
    const fetch = serving({
      [V2]: STANDALONE,
      ...Object.fromEntries(
        folders.map((folder) => [
          `${folder}catalog.ttl`,
          `${catalog(folder, [V1])}\n${"#".repeat(RELEASE_LIMITS.bytes / 4)}`,
        ]),
      ),
    });
    const library = libraryOver(fetch);
    const reads = library.linkedReads();
    await expect(reads.publishedBeside(V2)).resolves.toBeNull();
    await expect(reads.readRelease(V2)).rejects.toMatchObject({ code: "linkedReleasesTooLarge" });
    // The library reads each under limits of its own.
    await expect(library.publishedBeside(V2)).resolves.toBeNull();
    await expect(library.readRelease(V2)).resolves.toMatchObject({ url: V2 });
  });
});

describe("an upgrade plan of a copy from a link", () => {
  const BOB = "https://bob.example/memo/releases/rivers/";
  const bob = (version: number) => `${BOB}v${version}.ttl`;

  /** Version `version` of Bob's series, listing `versions`, with `cards` cards and `padding` triples past them. */
  function release(version: number, { versions = [version], cards = 1, padding = 0 } = {}) {
    const series = `${bob(1)}#series`;
    return `@base <${bob(version)}> .
@prefix sm: <${SM}> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<> a sm:Deck, dcat:Dataset; sm:formatVersion 6; dcterms:title "Rivers"@en; dcterms:description "Rivers."@en;
 dcterms:creator <#bob>; dcterms:publisher <#bob>; dcterms:license <https://creativecommons.org/publicdomain/zero/1.0/>;
 dcterms:issued "2026-10-10T10:00:00Z"^^xsd:dateTime; sm:studyDirection sm:frontToBack;
 dcat:theme <http://publications.europa.eu/resource/authority/data-theme/EDUC>;
 dcterms:language <http://publications.europa.eu/resource/authority/language/ENG>;
 dcat:version "${version}"; dcat:inSeries <${series}>; dcat:isVersionOf <${series}>; dcat:distribution <#turtle> .
<${series}> a dcat:DatasetSeries, dcat:Dataset; sm:formatVersion 3; dcterms:title "Rivers"@en;
 dcterms:description "Rivers."@en; dcterms:publisher <#bob>;
 dcat:theme <http://publications.europa.eu/resource/authority/data-theme/EDUC>;
 dcat:hasVersion ${versions.map((other) => `<${bob(other)}>`).join(", ")};
 dcat:hasCurrentVersion <>; dcat:first <${bob(1)}>; dcat:last <> .
${versions
  .filter((other) => other !== version)
  .map(
    (other) =>
      `<${bob(other)}> a dcat:Dataset; dcterms:title "Rivers"@en; dcterms:description "Rivers."@en; dcat:version "${other}".`,
  )
  .join("\n")}
<#bob> a foaf:Agent; foaf:name "Bob".
<#turtle> a dcat:Distribution; dcat:accessURL <>; dcat:downloadURL <>;
 dcat:mediaType <https://www.iana.org/assignments/media-types/text/turtle>.
<https://creativecommons.org/publicdomain/zero/1.0/> a dcterms:LicenseDocument.
${Array.from({ length: cards }, (_, at) => `<#c${at}> a sm:Card; sm:formatVersion 5; sm:front "f${at}"@en; sm:back "b${at}"@en.`).join("\n")}
${padding === 0 ? "" : `<#padding> sm:padding ${Array.from({ length: padding }, (_, at) => at).join(",")} .`}
`;
  }

  /**
   * The plan of a copy of Bob's v1 from its link, his catalog listing it and v4, which lists v1 to v4: v2 and v3
   * in between, each with `padding` triples past its cards. The library's shapes are asked of each release read.
   * The copy may be of another of them (`source`), and Bob may serve other `documents` too.
   */
  function planning(
    padding: number,
    listed = [bob(1), bob(4)],
    {
      documents = {},
      source = bob(1),
    }: { documents?: Record<string, string>; source?: string } = {},
  ) {
    const fetch = serving({
      "https://solid-memo.com/decks/index.ttl": "",
      [bob(1)]: release(1),
      [bob(2)]: release(2, { cards: 2, padding }),
      [bob(3)]: release(3, { cards: 3, padding }),
      [bob(4)]: release(4, { versions: [1, 2, 3, 4], cards: 4 }),
      ...documents,
      "https://bob.example/memo/catalog.ttl": catalog("https://bob.example/memo/", listed),
    });
    const validate = vi.fn(conforming);
    const library = libraryOver(fetch, validate);
    const useCases = createLibraryUseCases({
      deckLibrary: library,
      deckRepository: { listCards: async () => [], listDecks: async () => [deck] } as never,
      reviewStateRepository: {} as never,
      courses: {} as never,
    });
    const deck = {
      url: "https://alice.example/memo/catalog.ttl#rivers",
      id: "rivers",
      title: { en: "Rivers" },
      sourceUrl: source,
      direction: "front-to-back",
      cardsDocumentUrl: "https://alice.example/memo/cards/rivers.ttl",
      reviewsDocumentUrl: "https://alice.example/memo/reviews/rivers.ttl",
      authors: [],
      themes: [],
      keywords: {},
    } as unknown as Deck;
    /** How many times each of Bob's releases was read. */
    const reads = () =>
      Object.fromEntries(
        [1, 2, 3, 4].map((version) => [
          version,
          fetch.asked.filter((url) => url === bob(version)).length,
        ]),
      );
    return {
      plan: () => useCases.planLibraryUpgrade(deck),
      updates: () => useCases.listLibraryUpdates("https://alice.example/memo/"),
      library,
      validate,
      reads,
      fetch,
    };
  }

  it("is offered with the newer release and those in between read and checked once each, none of them kept", async () => {
    const { plan, library, validate, reads } = planning(0);
    await expect(plan()).resolves.toMatchObject({ fromVersion: "1", toVersion: "4" });
    expect(validate.mock.calls.map(([url]) => url).sort()).toEqual([bob(2), bob(3), bob(4)]);
    // v4 is read on its own first too, as the newest of the series its catalog lists, then as it is checked.
    const once = reads();
    expect([once[2], once[3], once[4]]).toEqual([1, 1, 2]);
    // Planned again (as an upgrade applied is), they are read again: the library kept none of them.
    await expect(plan()).resolves.toMatchObject({ toVersion: "4" });
    const twice = reads();
    expect([twice[2], twice[3], twice[4]]).toEqual([2, 2, 4]);
    await library.fetchLibraryDeck(bob(3));
    expect(reads()[3]).toBe(3);
  });

  it("is not offered when the newer release and those in between are larger together than one release may be", async () => {
    // Each in between is within a release's limits on its own, as its newer release is.
    const { plan, library } = planning(RELEASE_LIMITS.quads / 2);
    await expect(plan()).rejects.toMatchObject({
      code: "linkedReleasesTooLarge",
      vars: { host: "bob.example" },
    });
    await expect(library.readRelease(bob(2))).resolves.toMatchObject({ version: "2" });
    await expect(library.readRelease(bob(3))).resolves.toMatchObject({ version: "3" });
  });

  it("is found by the newest release named as the copy's its creator's catalog links, the others not read", async () => {
    // The catalog links v2 and v3 too, each within a release's limits on its own but larger together.
    const { updates, reads } = planning(RELEASE_LIMITS.quads / 2, [1, 2, 3, 4].map(bob));
    await expect(updates()).resolves.toMatchObject([
      { series: { version: "4" }, version: "1", newer: true, fromLink: true },
    ]);
    expect(reads()).toEqual({ 1: 1, 2: 0, 3: 0, 4: 1 });
  });

  it("is not known when the releases its creator's catalog links are larger together than one release may be, before a newer one is found", async () => {
    // Named as the copy's release, the newest first, but of another series.
    const others = {
      [bob(9)]: release(9, { padding: RELEASE_LIMITS.quads / 2 }).replaceAll(
        "v1.ttl#series",
        "v9.ttl#series",
      ),
    };
    const { plan, updates, validate } = planning(RELEASE_LIMITS.quads / 2, [1, 2, 3, 9].map(bob), {
      documents: others,
    });
    await expect(plan()).resolves.toBeNull();
    expect(validate).not.toHaveBeenCalled();
    await expect(updates()).resolves.toMatchObject([
      { series: { version: "1" }, version: "1", newer: "unknown", fromLink: true },
    ]);
  });

  it("is looked up in a catalog of its creator's other decks, larger together than one release may be, reading a few of them", async () => {
    const folder = (at: number) => `https://bob.example/memo/releases/deck-${at}/`;
    const decks = Array.from({ length: 6 }, (_, at) => `${folder(at)}v1.ttl`);
    const other = release(1, { padding: RELEASE_LIMITS.quads / 5 });
    const documents = {
      [bob(2)]: release(2, { versions: [1, 2], cards: 2 }),
      ...Object.fromEntries(decks.map((url, at) => [url, other.replaceAll(BOB, folder(at))])),
    };
    const listed = [...decks, bob(1), bob(2)];
    // A copy of v1: v2 is its upgrade, and none of the others is read.
    const older = planning(0, listed, { documents });
    await expect(older.updates()).resolves.toMatchObject([
      { series: { version: "2" }, version: "1", newer: true, fromLink: true },
    ]);
    expect(older.fetch.asked.filter((url) => decks.includes(url))).toEqual([]);
    // A copy of v2, the newest: four of the others are read, within the limits together, and none is newer.
    const newest = planning(0, listed, { documents, source: bob(2) });
    await expect(newest.updates()).resolves.toMatchObject([
      { series: { version: "2" }, version: "2", newer: false, fromLink: true },
    ]);
    expect(newest.fetch.asked.filter((url) => decks.includes(url))).toEqual(decks.slice(0, 4));
  });
});
