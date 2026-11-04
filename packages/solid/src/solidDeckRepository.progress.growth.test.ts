// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * What a learner's study writes is changed in time that grows with it,
 * not its square, against a pod in memory: review states in an older
 * format brought to this app's and review states removed, a day's
 * answers removed, and a course's completed chapters changed.
 *
 * Eight times as many must take less than four times as long as an
 * eighth of them done eight times over (testing.md); what puts the input
 * in place is not timed (growthAfterSetup). The other writes of a deck
 * are timed in the other solidDeckRepository.*.growth.test.ts files, each
 * a file of its own so that they run at once.
 */
import { describe, expect, it } from "vitest";
import type { Answer } from "@solid-memo/domain/answer";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import { createSolidAnswerLog } from "./solidAnswerLog";
import {
  INSTANCE,
  SM,
  release,
  repositoryInPod,
  put,
  read,
  deckWithStates,
} from "./testing/deckWrites";

// Each test does its work many times over, at up to thousands of cards: a
// few seconds on a laptop, and many times that in CI, coverage on and
// every package's tests run at once. What is held to is the ratio, of
// CPU time; the clock only stops a test that never ends.
describe("card writes", { timeout: 180_000 }, () => {
  it("bring review states in an older format to this app's in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { fetch, deck, reviews } = await deckWithStates(count);
        // The same states as format 1 wrote them.
        const text = await read(fetch, deck.reviewsDocumentUrl);
        const older = text.replaceAll(`formatVersion> "2"`, `formatVersion> "1"`);
        await put(fetch, deck.reviewsDocumentUrl, older);
        return async () => {
          expect(await reviews.upgradeReviewStates(deck)).toBe(true);
        };
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("remove review states in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { deck, reviews, states } = await deckWithStates(count);
        const keys = states.map(({ cardId, direction }) => ({ cardId, direction }));
        return () => reviews.applyReviewChanges(deck, { save: [], remove: keys, every: true });
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("remove a day's answers in time that grows with them, not their square", async () => {
    const deckUrl = `${INSTANCE}catalog.ttl#deck-1`;
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { fetch } = repositoryInPod();
        const log = createSolidAnswerLog({ fetch });
        const answers = Array.from(
          { length: count },
          (_, i): Answer => ({
            id: `answer-${i}`,
            deckUrl,
            cardUrl: `${INSTANCE}decks/deck-1.ttl#c${i}`,
            direction: "front-to-back",
            grade: 4,
            answeredAt: "2026-10-30T10:00:00.000Z",
            studyDay: "2026-10-30",
            nextIntervalDays: 6,
          }),
        );
        await log.appendAll(INSTANCE, answers);
        return () => log.removeDay(INSTANCE, deckUrl, "2026-10-30");
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("change a course's completed chapters in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { fetch, repository } = repositoryInPod();
        const deck = await repository.importDeck(INSTANCE, release(0));
        // Completions all named after one chapter, as another app may write them.
        const catalog = await read(fetch, `${INSTANCE}catalog.ttl`);
        const completed = Array.from(
          { length: count },
          (_, i) =>
            `<${deck.url}> <${SM}completedChapter> <https://elsewhere.example/x${i}.ttl#ch-1> .`,
        );
        await put(fetch, `${INSTANCE}catalog.ttl`, [catalog, ...completed].join("\n"));
        return () =>
          repository.setCompletedChapters(deck, {
            kind: "notDone",
            chapterUrl: "https://library.example/releases/x/v1.ttl#ch-1",
          });
      },
      1000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});
