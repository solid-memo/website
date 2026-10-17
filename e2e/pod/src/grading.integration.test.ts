// @vitest-environment node

// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Grading in a study session (docs/srs.md#what-a-grade-costs) against a
 * real Solid server: the reviews document is edited as the last read or
 * write left it, where that gave its version, and read again otherwise;
 * a grade is applied to the state the document holds when written, so a
 * grade made elsewhere meanwhile, of the same card or another, is built
 * on, not undone. With MEASURE_GRADES set,
 * it also measures the requests and bytes of a grade on a deck of 2,000
 * states (docs/srs.md#what-a-grade-costs).
 */
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import {
  createUseCases,
  type GradeBasis,
  type StudySessionQueue,
} from "@solid-memo/application/useCases";
import type { Deck, Prompt } from "@solid-memo/domain/deck";
import { preferencesUrlOf } from "@solid-memo/domain/instanceLayout";
import { reviewKeyOf, type ReviewQuality, type ReviewState } from "@solid-memo/domain/review";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidDigestRepository } from "@solid-memo/solid/solidDigestRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createWriteFence } from "@solid-memo/solid/writeFence";
import {
  ETAG_OUTLIVES_EDITS,
  etagMarksEveryEdit,
  preconditionsOf,
  versioned,
} from "./serverTraits";

const SERVERS = inject("solidServers");

/** One request a page made: its method and URL, the bytes it sent and those it got, and the answer's status and ETag. */
interface Recorded {
  method: string;
  url: string;
  sent: number;
  received: number;
  status: number;
  etag: string | null;
}

/** A page of the app as createAppUseCases wires it, every request recorded; each call is a new page, with nothing in memory. */
function page() {
  const requests: Recorded[] = [];
  const encoder = new TextEncoder();
  const recording: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    requests.push({
      method: (init?.method ?? "GET").toUpperCase(),
      url: String(input),
      sent: typeof init?.body === "string" ? encoder.encode(init.body).length : 0,
      received: (await response.clone().arrayBuffer()).byteLength,
      status: response.status,
      etag: response.headers.get("ETag"),
    });
    return response;
  };
  const writeFence = createWriteFence(recording);
  const podFetch = writeFence.fetch;
  const shapeValidator = createShaclShapeValidator({
    fetch: podFetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  });
  const checkWrite = shapeValidator.checkSubjects;
  const deps = {
    fetch: podFetch,
    checkWrite,
    now: () => new Date(),
    randomId: () => crypto.randomUUID(),
  };
  const deckRepository = createSolidDeckRepository(deps);
  const reviewStateRepository = createSolidReviewStateRepository({ fetch: podFetch, checkWrite });
  const useCases = createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: undefined as never,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    instanceRepository: createSolidInstanceRepository(deps),
    deckRepository,
    preferencesRepository: createSolidPreferencesRepository({ fetch: podFetch, checkWrite }),
    reviewStateRepository,
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch: podFetch }),
    instanceCopier: createSolidInstanceCopier({ fetch: podFetch }),
    writeFence,
    digestRepository: createSolidDigestRepository({ fetch: podFetch, checkWrite }),
    answerLog: createSolidAnswerLog({ fetch: podFetch, checkWrite }),
    ruleset: "e2e-rules",
  });
  return { useCases, deckRepository, reviewStateRepository, requests };
}

/** An instance with one deck of `cards` cards, studied both ways, made by the app. */
async function seed(server: string, cards: number): Promise<{ instanceUrl: string; deck: Deck }> {
  const base = new URL(`grading-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card.ttl#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  const put = async (url: string, body: string) => {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "text/turtle" },
      body,
    });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  await put(
    `${base}profile/card.ttl`,
    `<#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`,
  );
  await put(
    typeIndex,
    `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`,
  );
  const { useCases, deckRepository } = page();
  const instance = await useCases.createInstance(
    { webId },
    { containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" },
  );
  const deck = await useCases.setDeckDirection(
    await useCases.createDeck(instance.url, { en: "Words" }),
    "bidirectional",
  );
  await deckRepository.applyCardChanges(deck, {
    save: Array.from({ length: cards }, (_, n) => ({
      id: `card-${n}`,
      front: { en: `word ${n}` },
      back: { sv: `ord ${n}` },
    })),
    remove: [],
  });
  return { instanceUrl: instance.url, deck };
}

/**
 * A study session as StudyContainer runs it: today's queue, then each
 * prompt graded with the preferences the queue came with.
 */
async function session(
  useCases: ReturnType<typeof page>["useCases"],
  instanceUrl: string,
  deck: Deck,
) {
  const queue: StudySessionQueue = await useCases.getStudyQueue(instanceUrl, deck, new Date());
  const known: GradeBasis = { prefs: queue.prefs };
  return {
    prompts: [...queue.due, ...queue.newPrompts],
    grade: (prompt: Prompt, quality: ReviewQuality): Promise<ReviewState> =>
      useCases.recordReview(instanceUrl, deck, prompt, quality, new Date(), {}, known),
  };
}

const ofReviews = (deck: Deck) => (request: Recorded) => request.url === deck.reviewsDocumentUrl;

/** The deck's prompts of its first `count` cards, front to back. */
async function promptsOf(deck: Deck, count: number): Promise<Prompt[]> {
  const cards = await page().useCases.listCards(deck);
  return cards.slice(0, count).map((card) => ({ card, direction: "front-to-back" as const }));
}

const keyOf = (prompt: Prompt) =>
  reviewKeyOf({ cardId: prompt.card.id, direction: prompt.direction });

describe.each(SERVERS)("grading on $name", ({ url: server }) => {
  it("makes a session's first grade one write where the server versions the reviews document, and reads it again before each later one unless the last write's answer gave its version", async () => {
    const { instanceUrl, deck } = await seed(server, 3);
    const [a, b] = await promptsOf(deck, 2);
    // Studied before: the reviews document is there when the session's queue reads it.
    await page().useCases.recordReview(instanceUrl, deck, a!, 4, new Date());
    const { useCases, requests } = page();
    const study = await session(useCases, instanceUrl, deck);
    const isVersioned = await versioned(deck.reviewsDocumentUrl);

    requests.length = 0;
    await study.grade(b!, 1);
    expect(requests.filter(ofReviews(deck)).map((r) => r.method)).toEqual(
      isVersioned ? ["PATCH"] : ["GET", "PATCH"],
    );
    const written = requests.filter(ofReviews(deck)).at(-1)!;
    requests.length = 0;
    await study.grade(b!, 5);
    const versionWritten = written.etag?.startsWith('"') === true;
    expect(requests.filter(ofReviews(deck)).map((r) => r.method)).toEqual(
      versionWritten ? ["PATCH"] : ["GET", "PATCH"],
    );
    // No preferences read for a grade: the queue's are used.
    expect(requests.filter((r) => r.url === preferencesUrlOf(instanceUrl))).toEqual([]);

    const stored = await page().useCases.listDeckReviewStates(deck);
    expect(stored.find((state) => state.cardId === b!.card.id)).toMatchObject({ repetitions: 1 });
    expect((await page().useCases.validateInstance(instanceUrl)).conforms).toBe(true);
  });

  it("builds on a grade of the same card made elsewhere during the session, and keeps one of another card", async (context) => {
    const { instanceUrl, deck } = await seed(server, 3);
    const [a, b] = await promptsOf(deck, 2);
    await page().useCases.recordReview(instanceUrl, deck, a!, 4, new Date());
    // The grades elsewhere come in the same second as the queue's read, which such a server's
    // ETag does not tell apart; one that gives none has the document read before each grade.
    if ((await versioned(deck.reviewsDocumentUrl)) && !(await etagMarksEveryEdit(server)))
      context.skip(ETAG_OUTLIVES_EDITS);
    const { useCases, requests } = page();
    const here = await session(useCases, instanceUrl, deck);
    // Another device grades both cards after this session's queue read the reviews document.
    const elsewhere = page().useCases;
    await elsewhere.recordReview(instanceUrl, deck, a!, 5, new Date());
    await elsewhere.recordReview(instanceUrl, deck, b!, 4, new Date());

    requests.length = 0;
    const graded = await here.grade(a!, 5);
    // Edited as the queue read it, where the server enforces If-Match: refused (412), read again and graded again.
    if ((await preconditionsOf(server)).edits)
      expect(requests.filter(ofReviews(deck)).map((r) => `${r.method} ${r.status}`)).toEqual([
        "PATCH 412",
        "GET 200",
        expect.stringMatching(/^PATCH 20\d$/),
      ]);
    // Three grades of it in all, each built on the one before.
    expect(graded.repetitions).toBe(3);
    const stored = await page().useCases.listDeckReviewStates(deck);
    expect(stored.map(reviewKeyOf).sort()).toEqual([a!, b!].map(keyOf).sort());
    expect(stored.find((state) => state.cardId === a!.card.id)).toEqual(graded);
  });

  it.runIf(process.env.MEASURE_GRADES)(
    "measures a grade on a deck of 1,000 cards studied both ways: 2,000 states",
    { timeout: 10 * 60_000 },
    async () => {
      const { instanceUrl, deck } = await seed(server, 1_000);
      const seeding = page();
      // Every prompt studied once before, due today: the queue holds them all.
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      const today = new Date().toISOString().slice(0, 10);
      const cards = await seeding.useCases.listCards(deck);
      await seeding.reviewStateRepository.createReviewStates(
        deck,
        cards.flatMap((card) =>
          (["front-to-back", "back-to-front"] as const).map((direction) => ({
            cardId: card.id,
            direction,
            easeFactor: 2.5,
            intervalDays: 1,
            repetitions: 1,
            due: today,
            firstReviewedAt: yesterday,
            lastReviewedAt: yesterday,
            formatVersion: 2,
          })),
        ),
      );
      const { useCases, requests } = page();
      await useCases.savePreferences(instanceUrl, {
        ...(await useCases.getPreferences(instanceUrl)),
        maxReviewsPerDay: 9_999,
      });
      const study = await session(useCases, instanceUrl, deck);
      expect(study.prompts).toHaveLength(2_000);
      const grades = 20;
      const figures = [];
      for (const prompt of study.prompts.slice(0, grades)) {
        requests.length = 0;
        const start = performance.now();
        await study.grade(prompt, 4);
        const ms = performance.now() - start;
        const reviews = requests.filter(ofReviews(deck));
        figures.push({
          ms,
          requests: reviews.length,
          sent: reviews.reduce((sum, r) => sum + r.sent, 0),
          received: reviews.reduce((sum, r) => sum + r.received, 0),
          methods: reviews.map((r) => `${r.method} ${r.status}`).join(", "),
        });
      }
      const median = (values: number[]) => [...values].sort((x, y) => x - y)[values.length >> 1]!;
      console.info(
        JSON.stringify(
          {
            server,
            grades,
            // The first grade edits the document as the queue read it; a later one reads it
            // again first, unless the server answered the last write with its version.
            first: figures[0],
            medianMs: Math.round(median(figures.map((f) => f.ms))),
            medianRequests: median(figures.map((f) => f.requests)),
            medianSentBytes: median(figures.map((f) => f.sent)),
            medianReceivedBytes: median(figures.map((f) => f.received)),
            methods: [...new Set(figures.slice(1).map((f) => f.methods))],
          },
          null,
          2,
        ),
      );
    },
  );
});
