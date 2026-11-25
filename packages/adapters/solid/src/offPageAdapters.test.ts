// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readBudget } from "@solid-memo/application/readBudget";
import { AppError } from "@solid-memo/domain/appError";
import { DECK_FILE_BASE } from "@solid-memo/domain/deckFile";
import { catalogUrlOf } from "@solid-memo/domain/instanceLayout";
import { VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { ReadLimitError } from "@solid-memo/solid-client/interface";
import { FOREIGN_LIMITS, limitVars, RELEASE_LIMITS } from "@solid-memo/solid-client/readLimits";
import { sourceOf } from "@solid-memo/solid-client/rdf";
import { readDocument } from "@solid-memo/solid-client/resources";
import { keyOf, quadsOf, termOf } from "./mappers/releaseDraftMapper";
import { createOffPage } from "./offPage";
import {
  offPageDeckArchive,
  offPageDocumentReader,
  offPageReleaseDocuments,
  offPageReleaseDrafts,
  offPageShapeValidator,
} from "./offPageAdapters";
import { offPageJobs } from "./offPageJobs";
import type { Jobs } from "./offPageServe";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckArchive, DECK_FILE_LIMITS } from "./solidDeckArchive";
import { releaseDocumentsOf } from "./solidDeckLibrary";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidReleaseDraftRepository } from "./solidReleaseDraftRepository";
import { fakePod } from "./testing/fakePod";
import { inProcessWorker } from "./testing/inProcessWorker";

/**
 * The ports whose work on documents the app did not write runs off the
 * page give what the same adapters give in the page, the work run in a
 * worker (here, in this process, its messages copied as a worker's
 * are), and what they give for a document too large to read once a job
 * runs past its deadline.
 */

const INSTANCE = "https://pod.example/solid-memo/a/";
const RELEASE = "https://alice.example/solid-memo/main/releases/capitals/v2.ttl";
const STANDALONE = readFileSync(
  join(VOCAB_ROOT, "fixtures/library-deck/v6/valid/library-standalone-release.ttl"),
  "utf8",
);

/** Work off the page over workers in this process, running `jobs` (offPageJobs by default). */
const offPageOf = (jobs?: Jobs, deadlineMs?: number) =>
  createOffPage({
    spawn: () => inProcessWorker(jobs),
    config: SHAPE_SOURCES,
    ...(deadlineMs === undefined ? {} : { deadlineMs }),
  });

/** Jobs that never end, so each runs past its deadline. */
const NEVER = new Proxy({}, { get: () => () => new Promise(() => {}) }) as Jobs;

/** Jobs that each fail with `error`. */
const failing = (error: unknown) =>
  new Proxy({}, { get: () => () => Promise.reject(error) }) as Jobs;

/** A fetch that serves the release at RELEASE and nothing else. */
const releaseFetch: typeof globalThis.fetch = async (input) =>
  String(input) === RELEASE
    ? Object.defineProperty(
        new Response(STANDALONE, { headers: { "Content-Type": "text/turtle" } }),
        "url",
        { value: RELEASE },
      )
    : new Response("", { status: 404 });

/** A pod with a deck in an instance. */
async function podWithDeck() {
  const pod = fakePod();
  const repository = createSolidDeckRepository({
    fetch: pod.fetch,
    now: () => new Date("2026-10-01T10:00:00.000Z"),
    randomId: () => "id1",
  });
  const deck = await repository.createDeck(INSTANCE, { en: "Capitals" });
  return { pod, deck };
}

describe("offPageShapeValidator", () => {
  const inPage = (fetch: typeof globalThis.fetch) =>
    createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });

  it("checks a document, and a draft as a release, as the validator in the page does, with the page's fetches and budget", async () => {
    const { pod } = await podWithDeck();
    const validator = inPage(pod.fetch);
    const off = offPageShapeValidator(offPageOf(), validator, {
      fetch: pod.fetch,
      siteFetch: shapesFetch,
    });
    const catalog = catalogUrlOf(INSTANCE);
    const expected = await validator.validateDocument(catalog);
    expect(await off.validateDocument(catalog)).toEqual(expected);
    expect(await off.validateDocument(catalog, "pod", readBudget(60_000))).toEqual(expected);
    const since = await off.validateDocumentSince(catalog, undefined);
    expect(since).toMatchObject({ unchanged: false, value: expected });
    expect(
      await off.validateDocumentSince(
        catalog,
        (since as { version: string }).version,
        "pod",
        readBudget(60_000),
      ),
    ).toMatchObject({ unchanged: true });
    // What is about to be written is checked in the page.
    expect(off.checkSubjects).toBe(validator.checkSubjects);

    const drafts = createSolidReleaseDraftRepository({ fetch: pod.fetch, releaseFetch });
    const draft = await drafts.readRelease(RELEASE);
    const asUrl = "https://alice.example/solid-memo/main/releases/capitals/v3.ttl";
    expect(await off.validateRelease(draft, asUrl)).toEqual(
      await validator.validateRelease(draft, asUrl),
    );
  });

  it("checks with another fetch as `over` gives it, and with the shapes read in this process for jobs run here", async () => {
    const { pod } = await podWithDeck();
    const empty = fakePod();
    const off = offPageShapeValidator(
      offPageOf(offPageJobs({ shapesFetch })),
      inPage(empty.fetch),
      {
        fetch: empty.fetch,
        siteFetch: shapesFetch,
      },
    ).over(pod.fetch);
    expect(await off.validateDocument(catalogUrlOf(INSTANCE))).toMatchObject({ status: "checked" });
  });

  it("reports a document past its deadline unreadable, as too large to read, and refuses a draft as releaseTooLarge", async () => {
    const off = offPageShapeValidator(offPageOf(NEVER, 10), inPage(fakePod().fetch), {
      fetch: fakePod().fetch,
      siteFetch: shapesFetch,
    });
    const url = catalogUrlOf(INSTANCE);
    expect(await off.validateDocument(url)).toMatchObject({
      url,
      status: "unreadable",
      reason: expect.stringContaining(
        "stopped reading and checking this document after 60 seconds",
      ),
    });
    expect(await off.validateDocumentSince(url, undefined)).toMatchObject({
      unchanged: false,
      value: { status: "unreadable" },
      version: null,
    });
    await expect(
      off.validateRelease({ url: RELEASE } as never, RELEASE, "x"),
    ).rejects.toMatchObject({
      code: "releaseTooLarge",
    });
  });

  it("throws what fails the whole check, as the validator in the page does", async () => {
    const shapes = new AppError("releaseUnreadable", { url: "x" });
    const off = offPageShapeValidator(offPageOf(failing(shapes)), inPage(fakePod().fetch), {
      fetch: fakePod().fetch,
      siteFetch: shapesFetch,
    });
    await expect(off.validateDocument("https://pod.example/doc")).rejects.toMatchObject({
      code: "releaseUnreadable",
    });
    await expect(
      off.validateDocumentSince("https://pod.example/doc", undefined),
    ).rejects.toMatchObject({
      code: "releaseUnreadable",
    });
  });
});

describe("offPageReleaseDocuments", () => {
  const validator = createShaclShapeValidator({
    fetch: fakePod().fetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  });
  const inPage = releaseDocumentsOf((url, dataset) =>
    validator.validateDataset(url, dataset, "library"),
  );

  it("reads a release, checked or not, and its creator's catalog, as the page does", async () => {
    const off = offPageReleaseDocuments(offPageOf(), shapesFetch);
    const read = await off.release(RELEASE, releaseFetch, true);
    expect(read).toEqual(await inPage.release(RELEASE, releaseFetch, true));
    expect(read.report).toMatchObject({ value: { status: "checked" } });
    // The outline is frozen through, as the page keeps it.
    expect(Object.isFrozen((read.outline as { value: object }).value)).toBe(true);
    expect(await off.release(RELEASE, releaseFetch, false)).not.toHaveProperty("report");
    const folder = "https://alice.example/solid-memo/main/";
    const catalog: typeof globalThis.fetch = async () =>
      new Response(
        `<${folder}catalog.ttl#it> <https://solid-memo.com/ns/vocab/v1.ttl#publishedRelease> <${RELEASE}>.`,
        { headers: { "Content-Type": "text/turtle" } },
      );
    expect(await off.catalogLinks(folder, catalog)).toEqual(
      await inPage.catalogLinks(folder, catalog),
    );
    const root: typeof globalThis.fetch = async () =>
      new Response(null, {
        headers: { Link: '<http://www.w3.org/ns/pim/space#Storage>; rel="type"' },
      });
    expect(await off.isStorageRoot(folder, root)).toBe(true);
  });

  it("fails a read past its deadline as a release past its limits", async () => {
    const off = offPageReleaseDocuments(offPageOf(NEVER, 10), shapesFetch);
    await expect(off.release(RELEASE, releaseFetch, true)).rejects.toEqual(
      new ReadLimitError(RELEASE, RELEASE_LIMITS),
    );
    await expect(off.catalogLinks(RELEASE, releaseFetch)).rejects.toBeInstanceOf(ReadLimitError);
    await expect(off.isStorageRoot(RELEASE, releaseFetch)).rejects.toBeInstanceOf(ReadLimitError);
  });
});

describe("offPageDeckArchive", () => {
  it("reads a deck file as the archive in the page does, and exports in the page", async () => {
    const { pod, deck } = await podWithDeck();
    const archive = createSolidDeckArchive({ fetch: pod.fetch, publicFetch: pod.fetch });
    const off = offPageDeckArchive(offPageOf(), archive);
    expect(off.exportDeck).toBe(archive.exportDeck);
    const text = await archive.exportDeck(
      deck,
      { format: "turtle", withProgress: false },
      { asNoOne: { cards: false, reviews: false } },
    );
    const base = `${DECK_FILE_BASE}deck`;
    expect(await off.readDeckFile(text, "turtle", base)).toEqual(
      await archive.readDeckFile(text, "turtle", base),
    );
    await expect(off.readDeckFile("", "turtle", base)).rejects.toMatchObject({
      code: "notADeckFile",
    });
  });

  it("refuses a file past its deadline as larger than any deck it reads", async () => {
    const off = offPageDeckArchive(
      offPageOf(NEVER, 10),
      createSolidDeckArchive({ fetch: fakePod().fetch, publicFetch: fakePod().fetch }),
    );
    await expect(off.readDeckFile("", "turtle", DECK_FILE_BASE)).rejects.toEqual(
      new AppError("deckFileTooLarge", limitVars(DECK_FILE_LIMITS)),
    );
  });
});

describe("offPageReleaseDrafts", () => {
  const published: typeof globalThis.fetch = async () => new Response("", { status: 404 });

  it("reads a release file, a release and what it names as the drafts in the page do, each with its fetch", async () => {
    const asked: string[] = [];
    const noOne: typeof globalThis.fetch = async (input, init) => {
      asked.push(String(input));
      return releaseFetch(input, init);
    };
    const drafts = createSolidReleaseDraftRepository({
      fetch: fakePod().fetch,
      releaseFetch,
      publicFetch: noOne,
    });
    const off = offPageReleaseDrafts(offPageOf(), drafts, { releaseFetch, publicFetch: noOne });
    expect(off.list).toBe(drafts.list);
    const release = await off.readRelease(RELEASE);
    expect(release).toEqual(await drafts.readRelease(RELEASE));
    expect(asked).toEqual([]);
    expect(await off.readRelease(RELEASE, { asNoOne: true })).toEqual(release);
    expect(asked).toEqual([RELEASE]);
    expect(await off.readLinked(release)).toEqual(await drafts.readLinked(release));
    expect(await off.parseRelease(STANDALONE, "turtle")).toEqual(
      await drafts.parseRelease(STANDALONE, "turtle"),
    );
  });

  it("refuses past the deadline a file as too large, a release as releaseTooLarge, and finds nothing it names", async () => {
    const drafts = createSolidReleaseDraftRepository({ fetch: fakePod().fetch });
    const off = offPageReleaseDrafts(offPageOf(NEVER, 10), drafts, {
      releaseFetch,
      publicFetch: published,
    });
    await expect(off.parseRelease("", "turtle")).rejects.toEqual(
      new AppError("deckFileTooLarge", limitVars(RELEASE_LIMITS)),
    );
    await expect(off.readRelease(RELEASE)).rejects.toMatchObject({ code: "releaseTooLarge" });
    expect(await off.readLinked({ url: RELEASE } as never)).toEqual([]);
  });

  it("throws what else reading the documents a release names fails with", async () => {
    const drafts = createSolidReleaseDraftRepository({ fetch: fakePod().fetch });
    const off = offPageReleaseDrafts(offPageOf(failing(new TypeError("broken"))), drafts, {
      releaseFetch,
      publicFetch: published,
    });
    await expect(off.readLinked({ url: RELEASE } as never)).rejects.toThrow("broken");
  });
});

describe("offPageDocumentReader", () => {
  const triples = (dataset: Parameters<typeof quadsOf>[0]) =>
    quadsOf(dataset)
      .map(
        ({ subject, predicate, object }) =>
          `${keyOf(subject)} ${predicate.value} ${JSON.stringify(termOf(object))}`,
      )
      .sort();

  it("reads a document as readDocument does, at the address it was read at, with its version", async () => {
    const { pod } = await podWithDeck();
    const read = offPageDocumentReader(offPageOf());
    const url = catalogUrlOf(INSTANCE);
    const inPage = await readDocument(url, { fetch: pod.fetch });
    const off = await read(url, { fetch: pod.fetch });
    if ("notModified" in off || "notModified" in inPage) throw new Error("read");
    expect(off.etag).toBe(inPage.etag);
    expect(sourceOf(off.dataset)!.url).toBe(sourceOf(inPage.dataset)!.url);
    expect(triples(off.dataset)).toEqual(triples(inPage.dataset));
    expect(await read(url, { fetch: pod.fetch, ifNoneMatch: off.etag })).toEqual({
      notModified: true,
    });
  });

  it("fails a read past its deadline as a document past the limits of one from elsewhere", async () => {
    const read = offPageDocumentReader(offPageOf(NEVER, 10));
    await expect(read(RELEASE, { fetch: releaseFetch })).rejects.toEqual(
      new ReadLimitError(RELEASE, FOREIGN_LIMITS),
    );
  });
});
