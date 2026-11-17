// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A card or a review state copied from another deck carries what its
 * source says (carriedTo) in time that grows with what it says, not its
 * square, against a pod in memory: a subject with many properties, one
 * with many values of a property, and one whose values of a property
 * are each in a language or of a datatype of their own
 * (GHSA-qwhc-f94x-97q5).
 *
 * Eight times as many must take less than four times as long as an
 * eighth of them done eight times over (testing.md); what puts the input
 * in place is not timed (growthAfterSetup).
 */
import { describe, expect, it } from "vitest";
import type { Deck } from "@solid-memo/domain/deck";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { fakePod } from "./testing/fakePod";
import { SM } from "./vocab";

const INSTANCE = "https://pod.example/solid-memo/main/";
const OTHER = "https://other.example/ns#";

const deckOf = (id: string): Deck => ({
  id,
  url: `${INSTANCE}catalog.ttl#${id}`,
  title: { en: id },
  cardsDocumentUrl: `${INSTANCE}decks/${id}.ttl`,
  reviewsDocumentUrl: `${INSTANCE}reviews/${id}.ttl`,
  createdAt: "2026-01-01T00:00:00.000Z",
  formatVersion: 6,
  direction: "front-to-back",
  authors: [],
});
const source = deckOf("source");
const target = deckOf("target");

/** What a subject can have many of. */
type Many = "properties" | "values" | "languages" | "datatypes";

/** The `i`th statement another app made of a subject with many of `many`. */
const STATEMENT: Record<Many, (i: number) => string> = {
  properties: (i) => `<${OTHER}p${i}> "v${i}"`,
  values: (i) => `<${OTHER}p> "v${i}"`,
  languages: (i) => `<${OTHER}p> "v${i}"@en-x${i}`,
  datatypes: (i) => `<${OTHER}p> "v${i}"^^<${OTHER}t${i}>`,
};

/**
 * What another app said of a subject: `count` properties, `count`
 * values of one, or `count` values of one each in a language or of a
 * datatype of its own.
 */
const said = (count: number, many: Many) =>
  Array.from({ length: count }, (_, i) => STATEMENT[many](i)).join(" ; ");

/**
 * A pod whose source deck holds one card, or its review state, with what
 * another app said of it: only the document a test reads.
 */
async function podWith(count: number, many: Many, document: "cards" | "reviews") {
  const pod = fakePod();
  if (document === "cards")
    await pod.put(
      source.cardsDocumentUrl,
      `<#one> a <${SM.Card}> ; <${SM.front}> "One"@en ; <${SM.back}> "Ett"@sv ;
      <${SM.formatVersion}> 7 ; ${said(count, many)} .`,
    );
  else
    await pod.put(
      source.reviewsDocumentUrl,
      `<#one> a <${SM.ReviewState}> ; <${SM.easeFactor}> 2.5 ; <${SM.intervalDays}> 1 ;
      <${SM.repetitions}> 1 ; <${SM.due}> "2026-10-31" ;
      <${SM.firstReviewedAt}> "2026-10-30T08:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ;
      <${SM.lastReviewedAt}> "2026-10-30T08:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ;
      <${SM.reviewOf}> <../decks/source.ttl#one> ; <${SM.reviewDirection}> <${SM.frontToBack}> ;
      <${SM.scheduler}> <${SM.sm2}> ; <${SM.formatVersion}> 2 ; ${said(count, many)} .`,
    );
  const options = { fetch: pod.fetch, publicFetch: pod.fetch, randomId: () => "id" };
  return {
    pod,
    decks: createSolidDeckRepository({ ...options, now: () => new Date("2026-11-10T12:00:00Z") }),
    reviews: createSolidReviewStateRepository(options),
  };
}

const carried = { deck: source, ids: { "one-2": "one" } };

/**
 * The smaller size of each: values of one property, in one language or
 * each in their own, cost less each to carry than properties do, so
 * that it takes more of them to tell growth in their square from growth
 * in them, and to tell it by well over the limit, not just past it.
 */
const SIZE: Record<Many, number> = {
  properties: 500,
  values: 10_000,
  languages: 10_000,
  datatypes: 10_000,
};

// Each test does its work many times over, at up to tens of thousands of
// statements: what is held to is the ratio, of CPU time; the clock only
// stops a test that never ends.
describe("a subject copied from another deck", { timeout: 180_000 }, () => {
  for (const many of ["properties", "values", "languages", "datatypes"] as const) {
    it(`carries a card with many ${many} in time that grows with them, not their square`, async () => {
      const ratio = await growthAfterSetup(
        (count) => async () => {
          const { pod, decks } = await podWith(count, many, "cards");
          return async () => {
            await decks.applyCardChanges(
              target,
              { save: [{ id: "one-2", front: { en: "One" }, back: { sv: "Ett" } }], remove: [] },
              { carried },
            );
            const written = pod.triples(target.cardsDocumentUrl)!;
            expect(written.filter((line) => line.includes(OTHER))).toHaveLength(count);
          };
        },
        SIZE[many],
        8,
        4,
      );
      expect(ratio).toBeLessThan(4);
    });

    it(`carries a review state with many ${many} in time that grows with them, not their square`, async () => {
      const ratio = await growthAfterSetup(
        (count) => async () => {
          const { pod, reviews } = await podWith(count, many, "reviews");
          return async () => {
            await reviews.applyReviewChanges(target, {
              save: [
                {
                  cardId: "one-2",
                  direction: "front-to-back",
                  easeFactor: 2.5,
                  intervalDays: 1,
                  repetitions: 1,
                  due: "2026-10-31",
                  firstReviewedAt: "2026-10-30T08:00:00.000Z",
                  lastReviewedAt: "2026-10-30T08:00:00.000Z",
                  formatVersion: 2,
                },
              ],
              remove: [],
              carried,
            });
            const written = pod.triples(target.reviewsDocumentUrl)!;
            expect(written.filter((line) => line.includes(OTHER))).toHaveLength(count);
          };
        },
        SIZE[many],
        8,
        4,
      );
      expect(ratio).toBeLessThan(4);
    });
  }
});
