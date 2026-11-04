// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A deck's cards are written in time that grows with them, not their
 * square, against a pod in memory: a release added, or refused for a
 * distractor its cards share, one card's many distractors written and
 * changed, and the deck's cards removed.
 *
 * Eight times as many must take less than four times as long as an
 * eighth of them done eight times over (testing.md); what puts the input
 * in place is not timed (growthAfterSetup). The other writes of a deck
 * are timed in the other solidDeckRepository.*.growth.test.ts files, each
 * a file of its own so that they run at once.
 */
import { describe, expect, it } from "vitest";
import { growthAfterSetup, growthAsync } from "@solid-memo/domain/testing/growth";
import {
  INSTANCE,
  release,
  oneCard,
  sharedDistractor,
  repositoryInPod,
} from "./testing/deckWrites";

// Each test does its work many times over, at up to thousands of cards: a
// few seconds on a laptop, and many times that in CI, coverage on and
// every package's tests run at once. What is held to is the ratio, of
// CPU time; the clock only stops a test that never ends.
describe("card writes", { timeout: 180_000 }, () => {
  it("add a release in time that grows with its cards, not their square", async () => {
    const ratio = await growthAsync(
      (count) => {
        const content = release(count);
        return () => repositoryInPod().repository.importDeck(INSTANCE, content);
      },
      600,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("add a release of one card with many distractors in time that grows with them, not their square", async () => {
    const ratio = await growthAsync(
      (count) => {
        const content = oneCard(count);
        return () => repositoryInPod().repository.importDeck(INSTANCE, content);
      },
      500,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("refuse a release whose cards share a distractor in time that grows with them, not their square (GHSA-f72p-j39c-w728)", async () => {
    const ratio = await growthAsync(
      (count) => {
        const content = sharedDistractor(count);
        return () =>
          expect(repositoryInPod().repository.importDeck(INSTANCE, content)).rejects.toMatchObject({
            code: "idTakenInDeck",
          });
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("remove a deck's cards in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const content = release(count);
        const { repository } = repositoryInPod();
        const deck = await repository.importDeck(INSTANCE, content);
        const ids = content.cards.map((card) => card.id);
        return () => repository.applyCardChanges(deck, { save: [], remove: ids });
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("change every distractor of one card in time that grows with them, not their square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const { repository } = repositoryInPod();
        const deck = await repository.importDeck(INSTANCE, oneCard(count));
        const card = oneCard(count, count).cards[0]!;
        return () => repository.applyCardChanges(deck, { save: [card], remove: [] });
      },
      300,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});
