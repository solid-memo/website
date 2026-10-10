import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getBoolean, getThingAll, getUrlAll, type SolidDataset, type Thing } from "@inrupt/solid-client";
import { DECKS_ROOT } from "@solid-memo/vocab/tooling/root";
import { turtleFetch } from "@solid-memo/shacl/testing/turtle";
import { getSolidDatasetLinear } from "./linearDataset";
import { createSolidDeckLibrary } from "./solidDeckLibrary";
import { RDF, SM } from "./vocab";

/**
 * The library this repository publishes (decks/, docs/deck-library.md),
 * read as the app reads it, through the library adapter: the index lists
 * every deck and offers newcomers at most one course, every release reads
 * with all its cards, and a course's
 * outline has every chapter and step it has in use, each asking cards of
 * the release that the app can ask. The library check validates the
 * releases against the shapes; this is what the app makes of them.
 */

const DECKS = "https://solid-memo.com/decks/";
const OWL_DEPRECATED = "http://www.w3.org/2002/07/owl#deprecated";

const releases = readdirSync(DECKS_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) =>
    readdirSync(join(DECKS_ROOT, entry.name))
      .filter((file) => /^v[1-9][0-9]*\.ttl$/.test(file))
      .map((file) => `${entry.name}/${file}`),
  )
  .sort();

/** The site's fetch: every address under decks/ answered with its file. */
const siteFetch: typeof globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return turtleFetch(readFileSync(join(DECKS_ROOT, url.slice(DECKS.length)), "utf8"))(url);
};

const library = createSolidDeckLibrary({ fetch: siteFetch, indexUrl: `${DECKS}index.ttl` });

const documents = new Map<string, Promise<SolidDataset>>();

/** The subjects of a type a release document has, and those of them it does not retire. */
async function subjectsOf(url: string, type: string): Promise<{ all: string[]; inUse: string[] }> {
  if (!documents.has(url)) documents.set(url, getSolidDatasetLinear(url, { fetch: siteFetch }));
  const dataset = await documents.get(url)!;
  const things = getThingAll(dataset).filter((thing: Thing) => getUrlAll(thing, RDF.type).includes(type));
  const id = (thing: Thing) => thing.url.slice(thing.url.indexOf("#") + 1);
  return {
    all: things.map(id).sort(),
    inUse: things.filter((thing) => getBoolean(thing, OWL_DEPRECATED) !== true).map(id).sort(),
  };
}

it("lists every deck of the library", async () => {
  const decks = await library.listLibraryDecks();
  const names = new Set(releases.map((path) => path.split("/")[0]));
  expect(decks.map((deck) => deck.seriesUrl).sort()).toEqual([...names].map((name) => `${DECKS}index.ttl#${name}`).sort());
});

it("offers newcomers at most one deck of the library, a course", async () => {
  const offered = (await library.listLibraryDecks()).filter((deck) => deck.forNewcomers === true);
  expect(offered.length).toBeLessThanOrEqual(1);
  for (const deck of offered) expect(deck.isCourse).toBe(true);
});

describe.each(releases)("decks/%s", (path) => {
  const url = `${DECKS}${path}`;

  it("reads with every card it has", async () => {
    const content = await library.fetchLibraryDeck(url);
    const cards = await subjectsOf(url, SM.Card);
    expect(content.cards.map((card) => card.id).sort()).toEqual(cards.all);
    expect(content.cards.filter((card) => card.retired !== true).map((card) => card.id).sort()).toEqual(cards.inUse);
  });

  it("reads with its course outline, whose every question can be asked", async () => {
    const [content, outline] = await Promise.all([library.fetchLibraryDeck(url), library.fetchCourseOutline(url)]);
    const chapters = await subjectsOf(url, SM.Chapter);
    const steps = await subjectsOf(url, SM.Step);
    expect(outline.chapters.map((chapter) => chapter.id).sort()).toEqual(chapters.inUse);
    expect(outline.chapters.flatMap((chapter) => chapter.steps.map((step) => step.id)).sort()).toEqual(steps.inUse);
    expect(content.isCourse === true).toBe(chapters.inUse.length > 0);

    const cards = new Map(content.cards.map((card) => [card.id, card]));
    for (const chapter of outline.chapters) {
      expect(chapter.steps.length).toBeGreaterThan(0);
      for (const id of [...chapter.steps.flatMap((step) => step.questionIds), ...chapter.reviewQuestionIds]) {
        const card = cards.get(id);
        expect(card, `${chapter.id} asks ${id}`).toBeDefined();
        expect(card!.retired).toBeUndefined();
        expect(Object.keys(card!.back).length).toBeGreaterThan(0);
        expect(card!.distractors?.length ?? 0).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

it("reads each deck's current release on its own, as from a link, as the index describes it", async () => {
  for (const deck of await library.listLibraryDecks()) {
    const { releases, forNewcomers: _forNewcomers, sources, ...described } = deck;
    const { sources: own, ...read } = await library.readRelease(deck.url);
    expect(read, deck.url).toEqual({ ...described, releases: [releases.find((release) => release.url === deck.url)] });
    // The index describes a source as every release does, the release as it does.
    expect(own.map((source) => source.url), deck.url).toEqual(sources.map((source) => source.url));
  }
});
