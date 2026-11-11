// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { planCardTransfer } from "@solid-memo/domain/cardTransfer";
import type { Deck } from "@solid-memo/domain/deck";
import { deckFileBaseOf, importedDeck } from "@solid-memo/domain/deckFile";
import { switchedStates } from "@solid-memo/domain/schedulerSwitch";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { describe, expect, it } from "vitest";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckArchive } from "./solidDeckArchive";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";

/**
 * A state's due day is any text when read and a date when written: each
 * path that writes a state back, through the real mapper, repository and
 * write check, against a pod in memory.
 */

const INSTANCE = "https://pod.example/i/";
const REVIEWS = `${INSTANCE}reviews/d.ttl`;
const deck = {
  id: "d",
  url: `${INSTANCE}catalog.ttl#d`,
  title: { en: "T" },
  cardsDocumentUrl: `${INSTANCE}decks/d.ttl`,
  reviewsDocumentUrl: REVIEWS,
  direction: "front-to-back",
  createdAt: "2026-01-01T00:00:00Z",
  formatVersion: 1,
  authors: [],
} as Deck;
const target = {
  ...deck,
  id: "t",
  url: `${INSTANCE}catalog.ttl#t`,
  cardsDocumentUrl: `${INSTANCE}decks/t.ttl`,
  reviewsDocumentUrl: `${INSTANCE}reviews/t.ttl`,
} as Deck;
const AT = '"2026-11-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>';
const NOW = new Date("2026-11-09T12:00:00Z");

const stateOf = (id: string, due: string, version: number) =>
  `<#${id}> a sm:ReviewState ; sm:formatVersion ${version} ; sm:reviewOf <../decks/d.ttl#${id}> ;
  sm:reviewDirection sm:frontToBack ; sm:scheduler sm:sm2 ; sm:easeFactor 2.5 ;
  sm:intervalDays 1 ; sm:repetitions 1 ; sm:due "${due}" ;
  sm:firstReviewedAt ${AT} ; sm:lastReviewedAt ${AT} .\n`;
const documentOf = (due: string, version = 2) =>
  `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
<> <http://purl.org/dc/terms/isPartOf> <../catalog.ttl#d> .
${stateOf("c1", due, version)}${stateOf("c2", "2026-11-08", 2)}`;

function podOf(body: string) {
  const writes: string[] = [];
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init.method ?? (input instanceof Request ? input.method : "GET");
    let response: Response;
    if (method === "GET" || method === "HEAD") {
      response =
        url === REVIEWS || url === INSTANCE
          ? new Response(method === "HEAD" ? null : body, {
              status: 200,
              headers: {
                "content-type": "text/turtle",
                etag: '"1"',
                "wac-allow": 'user="read write"',
              },
            })
          : new Response(null, { status: 404 });
    } else {
      writes.push(url);
      response = new Response(null, { status: 205, headers: { etag: '"2"' } });
    }
    Object.defineProperty(response, "url", { value: url });
    return response;
  }) as typeof globalThis.fetch;
  const { checkSubjects } = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });
  return {
    writes,
    repository: createSolidReviewStateRepository({
      fetch,
      checkWrite: checkSubjects,
      randomId: () => "x",
    }),
  };
}

describe("a due day that is no date, written back", () => {
  it.each(["zzz", "2026-11-10", "2026-13-45"])("switches a deck with due %s", async (due) => {
    const { repository, writes } = podOf(documentOf(due));
    await repository.writeFsrsStates(
      deck,
      ({ sm2 }) => switchedStates(deck.url, sm2, [], NOW, 0).fsrs,
    );
    expect(writes).toEqual([REVIEWS]);
  });

  it("updates the format of a state", async () => {
    const { repository, writes } = podOf(documentOf("zzz", 1));
    await expect(repository.upgradeReviewStates(deck)).resolves.toBe(true);
    expect(writes).toEqual([REVIEWS]);
  });

  it("moves a card with its progress", async () => {
    const { sm2 } = await podOf(documentOf("zzz")).repository.listReviewStates(deck);
    const plan = planCardTransfer(
      { ...deck, cards: [{ id: "c1" }] as never, states: sm2 },
      { ...target, cards: [], states: [] },
      ["c1"],
      { mode: "move", keepProgress: true },
    );
    const { repository, writes } = podOf("");
    await repository.applyReviewChanges(target, {
      save: plan.target.reviewSaves,
      remove: plan.target.reviewRemovals,
      fsrs: { save: plan.target.fsrsSaves, remove: plan.target.fsrsRemovals },
      every: true,
    });
    expect(writes).toEqual([target.reviewsDocumentUrl]);
  });

  it("imports a deck file with its progress", async () => {
    const file = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
<#d> a sm:Deck ; <http://purl.org/dc/terms/title> "T" ; sm:formatVersion 1 ;
  sm:cardsDocument <decks/d.ttl> ; sm:reviewsDocument <reviews/d.ttl> .
<decks/d.ttl#c1> a sm:Card ; sm:front "F" ; sm:back "B" ; sm:formatVersion 1 .
${stateOf("c1", "zzz", 2).replace("<#c1>", "<reviews/d.ttl#c1>").replace("../decks", "decks")}`;
    const content = await createSolidDeckArchive({ fetch: globalThis.fetch }).readDeckFile(
      file,
      "turtle",
      deckFileBaseOf("d.ttl"),
    );
    const imported = importedDeck(INSTANCE, content, {
      withProgress: true,
      decks: [],
      freshId: "deck-x",
      now: NOW.toISOString(),
    });
    expect(imported.reviews.map((state) => state.due)).toEqual(["2026-11-01"]);
    const { repository, writes } = podOf("");
    await repository.applyReviewChanges(imported.deck, {
      save: imported.reviews,
      remove: [],
      fsrs: { save: imported.fsrsReviews, remove: [] },
    });
    expect(writes).toEqual([imported.deck.reviewsDocumentUrl]);
  });
});
