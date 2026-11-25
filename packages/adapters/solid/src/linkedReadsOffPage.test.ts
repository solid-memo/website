// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import type { DocumentReport } from "@solid-memo/domain/validation";
import { createOffPage } from "./offPage";
import { offPageReleaseDocuments } from "./offPageAdapters";
import { createSolidDeckLibrary, releaseDocumentsOf } from "./solidDeckLibrary";
import { inProcessWorker } from "./testing/inProcessWorker";

/**
 * Reads of releases from a link off the page (offPage.ts) are held to
 * the page session's budget as those in the page are: a parse there
 * holds the room it may take (holdRoom). A release's limits are made
 * small here, so that the budget, twice them, is spent by a few reads.
 */
vi.mock("@solid-memo/solid-client/readLimits", async (importOriginal) => {
  const original = await importOriginal<typeof import("@solid-memo/solid-client/readLimits")>();
  return {
    ...original,
    RELEASE_LIMITS: { ...original.RELEASE_LIMITS, bytes: 1024 * 1024, quads: 300 },
  };
});

const HOST = "https://elsewhere.example/releases/";
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const V2 = "https://alice.example/solid-memo/main/releases/capitals/v2.ttl";
const STANDALONE = readFileSync(
  join(VOCAB_ROOT, "fixtures/library-deck/v6/valid/library-standalone-release.ttl"),
  "utf8",
);

/** The release at `url`, `padding` triples more. */
const releaseAt = (url: string, padding = 0) =>
  STANDALONE.replaceAll(`<${V2}>`, `<${url}>`) +
  (padding === 0
    ? ""
    : `\n<#padding> <${SM}padding> ${Array.from({ length: padding }, (_, at) => at).join(",")} .\n`);

/** A fetch answering each address with its release, `padding` triples more. */
const serving =
  (padding = 0): typeof globalThis.fetch =>
  async (input) => {
    const url = String(input);
    const response = new Response(releaseAt(url, padding), {
      headers: { "Content-Type": "text/turtle" },
    });
    return Object.defineProperty(response, "url", { value: url });
  };

const urls = (count: number) => Array.from({ length: count }, (_, at) => `${HOST}r${at}/v1.ttl`);

const accept = () => undefined;

/** What each read came to: read, or the code it failed with. */
const outcomes = (results: PromiseSettledResult<unknown>[]) =>
  results.map((result) =>
    result.status === "fulfilled" ? "read" : (result.reason as { code?: string }).code,
  );

/** The library, its releases read in the page, their checks passing. */
const inPage = (fetch: typeof globalThis.fetch) =>
  createSolidDeckLibrary({
    fetch,
    indexUrl: `${HOST}index.ttl`,
    documents: releaseDocumentsOf(
      async (url): Promise<DocumentReport> => ({ url, status: "checked", subjects: [] }),
    ),
  });

/** The library, its releases read and checked off the page. */
const offPage = (fetch: typeof globalThis.fetch) =>
  createSolidDeckLibrary({
    fetch,
    indexUrl: `${HOST}index.ttl`,
    documents: offPageReleaseDocuments(
      createOffPage({ spawn: () => inProcessWorker(), config: SHAPE_SOURCES }),
      shapesFetch,
    ),
  });

describe("reads of releases from a link off the page", () => {
  it("reads a few ordinary releases at once, as in the page, each waiting for room others hold", async () => {
    const asked = urls(4);
    const fetch = serving();
    for (const library of [inPage(fetch), offPage(fetch)]) {
      expect(
        outcomes(await Promise.allSettled(asked.map((url) => library.readRelease(url, accept)))),
      ).toEqual(["read", "read", "read", "read"]);
    }
  }, 60_000);

  it("spends the budget as reads in the page do, and names it", async () => {
    const asked = urls(6);
    const fetch = serving(180);
    for (const library of [inPage(fetch), offPage(fetch)]) {
      const results = outcomes(
        await Promise.allSettled(asked.map((url) => library.readRelease(url))),
      );
      expect(results.filter((result) => result === "read")).toHaveLength(2);
      expect(results.filter((result) => result !== "read")).toEqual(
        Array.from({ length: 4 }, () => "linkedReadsSpent"),
      );
    }
  }, 60_000);

  it("holds a plan's reads at once to one release's limits together, as in the page", async () => {
    const asked = urls(3);
    const fetch = serving(50);
    for (const library of [inPage(fetch), offPage(fetch)]) {
      const plan = library.linkedReads();
      const results = outcomes(await Promise.allSettled(asked.map((url) => plan.readRelease(url))));
      expect(results.filter((result) => result === "read")).toHaveLength(2);
      expect(results.filter((result) => result !== "read")).toEqual(["linkedReleasesTooLarge"]);
    }
  }, 60_000);

  it("reads the cards of releases at once each under its own limits only, outside the budget", async () => {
    const asked = urls(4);
    const fetch = serving(180);
    for (const library of [inPage(fetch), offPage(fetch)]) {
      const results = await Promise.allSettled(asked.map((url) => library.fetchLibraryDeck(url)));
      expect(outcomes(results)).toEqual(["read", "read", "read", "read"]);
    }
  }, 60_000);
});
