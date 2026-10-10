import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { createSolidDeckLibrary } from "./solidDeckLibrary";

/**
 * A release added from a link (docs/deck-library.md, From a link), read
 * as the library adapter reads it: on its own, with no index, and its
 * creator's catalogue looked for above it.
 */

const RELEASES = "https://alice.example/solid-memo/main/releases/capitals/";
const V1 = `${RELEASES}v1.ttl`;
const V2 = `${RELEASES}v2.ttl`;
const STANDALONE = readFileSync(join(VOCAB_ROOT, "fixtures/library-deck/v6/valid/library-standalone-release.ttl"), "utf8");
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

/** A fetch that answers each address with its document, as Turtle, or with `status` (404 when it has none). */
function serving(documents: Record<string, string | number>): typeof globalThis.fetch & { asked: string[] } {
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

const libraryOver = (fetch: typeof globalThis.fetch) => createSolidDeckLibrary({ fetch, indexUrl: "https://solid-memo.com/decks/index.ttl" });

/** An instance's catalogue that links the releases it published. */
const catalogue = (instance: string, releases: string[]) =>
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
      authors: ["Alice"],
      license: "https://creativecommons.org/publicdomain/zero/1.0/",
      direction: "front-to-back",
      themes: ["http://publications.europa.eu/resource/authority/data-theme/EDUC", "https://solid-memo.com/ns/vocab/topics.ttl#geography"],
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

  it("refuses an address with nothing to read as a release, or no deck in it", async () => {
    const library = libraryOver(serving({ [V1]: "<#it> <http://purl.org/dc/terms/title> \"Not a deck\" ." }));
    await expect(library.readRelease(V2)).rejects.toMatchObject({ code: "releaseUnreadable" });
    await expect(library.readRelease(V1)).rejects.toMatchObject({ code: "notADeck" });
  });
});

describe("publishedBeside", () => {
  it("finds the catalogue above the release that links it, nearest first, as anyone reads it", async () => {
    const instance = "https://alice.example/solid-memo/main/";
    const fetch = serving({
      [`${RELEASES}catalog.ttl`]: 401,
      [`https://alice.example/solid-memo/main/releases/catalog.ttl`]: catalogue("https://alice.example/solid-memo/main/releases/", ["https://elsewhere.example/v1.ttl"]),
      [`${instance}catalog.ttl`]: catalogue(instance, [V1, V2]),
    });
    await expect(libraryOver(fetch).publishedBeside(V1)).resolves.toEqual([V1, V2]);
    expect(fetch.asked).toEqual([`${RELEASES}catalog.ttl`, `${instance}releases/catalog.ttl`, `${instance}catalog.ttl`]);
  });

  it("is null when no catalogue that links the release can be read, up to the host's root", async () => {
    const fetch = serving({ "https://alice.example/catalog.ttl": 403 });
    await expect(libraryOver(fetch).publishedBeside("https://alice.example/memo/v1.ttl")).resolves.toBeNull();
    expect(fetch.asked).toEqual(["https://alice.example/memo/catalog.ttl", "https://alice.example/catalog.ttl"]);
  });
});
