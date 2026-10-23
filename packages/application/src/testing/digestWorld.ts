// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, vi } from "vitest";
import type { DigestRepository, DeckRepository, ReviewStateRepository } from "../ports";
import { createUseCases } from "../useCases";
import type { InstanceDigest } from "@solid-memo/domain/studyDigest";
import { CARD_FORMAT_VERSION, type Card } from "@solid-memo/domain/deck";
import type { ReviewState } from "@solid-memo/domain/review";
import { sm2s, instance, deck, card, makeDeps } from "./fakePorts";

/**
 * An instance whose digest is kept in memory, for the tests of what the
 * digest learns and of each use case that reads it: the deck's cards at
 * version "c1", its review states at "r1", and each document checked at
 * a version of its own.
 */

export const now = new Date("2026-09-28T10:00:00.000Z");
export const RULES = "rules-1";
export const review: ReviewState = {
  cardId: "card-1",
  direction: "front-to-back",
  easeFactor: 2.5,
  intervalDays: 1,
  repetitions: 1,
  due: "2026-09-27",
  firstReviewedAt: "2026-09-26T10:00:00.000Z",
  lastReviewedAt: "2026-09-26T10:00:00.000Z",
  formatVersion: 2,
};
export const current: Card = { ...card, formatVersion: CARD_FORMAT_VERSION };
export const card2: Card = { ...current, id: "card-2", url: `${deck.cardsDocumentUrl}#card-2` };

/** The deps, with documents at versions "c1" (cards) and "r1" (reviews) and a digest kept in memory. */
export function setup(initial: InstanceDigest | null = null) {
  const deps = makeDeps();
  let stored = initial;
  const digestRepository: DigestRepository = {
    readDigest: vi.fn(async () => stored),
    updateDigest: vi.fn(async (_instanceUrl, change) => {
      stored = change(stored);
    }),
  };
  const at = (version: string, value: unknown) =>
    vi.fn(async (_target: unknown, since: string | undefined) =>
      since === version
        ? { unchanged: true as const }
        : { unchanged: false as const, value, version },
    );
  deps.deckRepository.readCardsSince = at("c1", [
    current,
    card2,
  ]) as DeckRepository["readCardsSince"];
  deps.reviewStateRepository.readReviewStatesSince = at(
    "r1",
    sm2s([review]),
  ) as ReviewStateRepository["readReviewStatesSince"];
  deps.shapeValidator.validateDocumentSince = vi.fn(
    async (url: string, since: string | undefined) =>
      since === `v-${url}`
        ? { unchanged: true as const }
        : {
            unchanged: false as const,
            value: { url, status: "checked" as const, subjects: [] },
            version: `v-${url}`,
          },
  );
  const useCases = createUseCases({ ...deps, digestRepository, ruleset: RULES });
  return { deps, useCases, digestRepository, stored: () => stored };
}

/** What the digest learns from the documents above. */
export async function learned() {
  const { useCases, stored, digestRepository } = setup();
  await useCases.getStudyCounts(instance.url, deck, now);
  await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalled());
  return stored()!;
}
