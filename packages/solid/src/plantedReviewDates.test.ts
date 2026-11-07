// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createAnswerStore } from "@solid-memo/application/answerStore";
import type { Deck } from "@solid-memo/domain/deck";
import { NEW_INSTANCE_PREFERENCES } from "@solid-memo/domain/preferences";
import { switchedStates } from "@solid-memo/domain/schedulerSwitch";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { describe, expect, it } from "vitest";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidAnswerLog } from "./solidAnswerLog";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";

const NOW = new Date("2026-11-06T12:00:00Z");
const INSTANCE = "https://pod.example/i/";
const REVIEWS = `${INSTANCE}reviews/d.ttl`;
const DATE_TIME = "<http://www.w3.org/2001/XMLSchema#dateTime>";
const SANE = "2026-11-01T00:00:00Z";

const deck: Deck = {
  id: "d",
  url: `${INSTANCE}catalog.ttl#d`,
  title: { en: "T" },
  cardsDocumentUrl: `${INSTANCE}decks/d.ttl`,
  reviewsDocumentUrl: REVIEWS,
  direction: "front-to-back",
  createdAt: SANE,
  formatVersion: 1,
  authors: [],
};

/** A reviews document holding a prompt's SM-2 and FSRS-6 states, with these dates. */
const reviewsOf = (cardId: string, last: string, due: string) => {
  const at = `"${last}"^^${DATE_TIME}`;
  return `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
<> <http://purl.org/dc/terms/isPartOf> <../catalog.ttl#d> .
<#${cardId}> a sm:ReviewState ; sm:formatVersion 2 ; sm:reviewOf <../decks/d.ttl#${cardId}> ;
  sm:reviewDirection sm:frontToBack ; sm:scheduler sm:sm2 ;
  sm:easeFactor 2.5 ; sm:intervalDays 1 ; sm:repetitions 1 ; sm:due "2000-01-02" ;
  sm:firstReviewedAt ${at} ; sm:lastReviewedAt ${at} .
<#${cardId}@fsrs6> a sm:ReviewState ; sm:scheduler sm:fsrs6 ; sm:formatVersion 1 ;
  sm:reviewOf <../decks/d.ttl#${cardId}> ; sm:reviewDirection sm:frontToBack ;
  sm:stability 2.0 ; sm:difficulty 5.0 ; sm:due "${due}" ;
  sm:firstReviewedAt ${at} ; sm:lastReviewedAt ${at} .
`;
};

/** A pod in memory: answers with the reviews document given and records each write's path. */
function memoryPod(reviews: string) {
  const writes: string[] = [];
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init.method ?? (input instanceof Request ? input.method : "GET");
    let response: Response;
    if (method === "GET" || method === "HEAD") {
      response =
        url === REVIEWS || url === INSTANCE
          ? new Response(method === "HEAD" ? null : reviews, {
              status: 200,
              headers: {
                "content-type": "text/turtle",
                etag: '"1"',
                "wac-allow": 'user="read write"',
              },
            })
          : new Response(null, { status: 404 });
    } else {
      writes.push(new URL(url).pathname);
      response = new Response(null, { status: 205, headers: { etag: '"2"' } });
    }
    Object.defineProperty(response, "url", { value: url });
    return response;
  }) as typeof globalThis.fetch;
  return { fetch, writes };
}

/** Grade the prompt of a reviews document under FSRS-6, with the real write checks. */
async function graded(reviews: string, cardId: string) {
  const { fetch, writes } = memoryPod(reviews);
  const { checkSubjects } = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });
  let id = 0;
  const store = createAnswerStore({
    answerLog: createSolidAnswerLog({ fetch, checkWrite: checkSubjects }),
    reviewStateRepository: createSolidReviewStateRepository({
      fetch,
      checkWrite: checkSubjects,
      randomId: () => "x",
    }),
    preferenceStore: { get: async () => ({ ...NEW_INSTANCE_PREFERENCES, scheduler: "fsrs6" }) },
    newId: () => `abcdefgh${id++}`,
    now: () => NOW,
  });
  const prompt = {
    cardId,
    cardUrl: `${deck.cardsDocumentUrl}#${cardId}`,
    direction: "front-to-back",
  } as const;
  const recorded = await store.grade(INSTANCE, deck, prompt, 4, NOW, { times: {} });
  await store.flush(INSTANCE);
  return { recorded, writes };
}

describe("a review state with dates that pass the shape but are no study days", () => {
  it.each([
    "0500-01-01T00:00:00Z",
    "1000-01-01T00:00:00Z",
    "0050-06-01T00:00:00Z",
    "0000-01-01T00:00:00Z",
    "-0500-01-01T00:00:00Z",
    "+012000-01-01T00:00:00Z",
    "12000-01-01T00:00:00Z",
    "9999-12-31T23:59:59Z",
    "2026-02-31T00:00:00Z",
  ])("takes a grade and logs its answer with a last review of %s", async (last) => {
    const { recorded, writes } = await graded(reviewsOf("c1", last, "2026-11-10"), "c1");
    expect(Number.isFinite(recorded.fsrs!.stability)).toBe(true);
    expect(recorded.fsrs!.due).toMatch(/^2\d{3}-\d{2}-\d{2}$/);
    expect(writes).toEqual(["/i/reviews/d.ttl", "/i/history/2026-11.ttl"]);
  });

  it("has the write check refuse an answer the store sets aside, and writes nothing of it", async () => {
    const { fetch, writes } = memoryPod("");
    const { checkSubjects } = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });
    const answerLog = createSolidAnswerLog({ fetch, checkWrite: checkSubjects });
    await expect(
      answerLog.append(INSTANCE, {
        id: "abc",
        deckUrl: deck.url,
        cardUrl: `${deck.cardsDocumentUrl}#c1`,
        direction: "front-to-back",
        grade: 4,
        answeredAt: NOW.toISOString(),
        studyDay: "2026-11-06",
        priorIntervalDays: Number.NaN,
        nextIntervalDays: 1,
      }),
    ).rejects.toMatchObject({ code: "dataNotConforming" });
    expect(writes).toEqual([]);
  });

  it.each(["0000-00-00", "2026-13-45", "2026-02-31", "0050-01-01"])(
    "takes a grade and logs its answer with an FSRS-6 due day of %s",
    async (due) => {
      const { recorded, writes } = await graded(reviewsOf("c1", SANE, due), "c1");
      expect(recorded.fsrs!.due).toMatch(/^2\d{3}-\d{2}-\d{2}$/);
      expect(writes).toEqual(["/i/reviews/d.ttl", "/i/history/2026-11.ttl"]);
    },
  );

  it.each([
    "-0500-01-01T00:00:00Z",
    "+012000-01-01T00:00:00Z",
    "12000-01-01T00:00:00Z",
    "2026-02-31T00:00:00Z",
  ])("switches a deck to FSRS-6 with a review of %s", async (reviewed) => {
    const { fetch, writes } = memoryPod(reviewsOf("c1", reviewed, "2026-11-10"));
    const { checkSubjects } = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });
    const repository = createSolidReviewStateRepository({
      fetch,
      checkWrite: checkSubjects,
      randomId: () => "x",
    });
    await repository.writeFsrsStates(
      deck,
      ({ sm2 }) => switchedStates(deck.url, sm2, [], NOW).fsrs,
    );
    expect(writes).toEqual(["/i/reviews/d.ttl"]);
  });
});
