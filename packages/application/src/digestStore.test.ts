// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createUseCases } from "./useCases";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { FsrsState } from "@solid-memo/domain/review";
import { sm2s, instance, deck, card } from "./testing/fakePorts";
import { now, RULES, review, setup, learned } from "./testing/digestWorld";

describe("the instance digest", () => {
  it("counts today's study from the documents the first time, and keeps the deck's schedule", async () => {
    const { useCases, stored, digestRepository } = setup();
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalledOnce());
    expect(stored()!.schedules[deck.url]).toMatchObject({
      cardsVersion: "c1",
      reviewsVersion: "r1",
    });
    expect(stored()!.receipts[deck.cardsDocumentUrl]).toEqual({
      document: deck.cardsDocumentUrl,
      version: "c1",
      latestFormat: true,
    });
    expect(stored()!.receipts[deck.reviewsDocumentUrl]).toEqual({
      document: deck.reviewsDocumentUrl,
      version: "r1",
      latestFormat: true,
    });
  });

  it("counts from the schedule while neither document changed", async () => {
    const { deps, useCases } = setup(await learned());
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    expect(deps.deckRepository.readCardsSince).toHaveBeenCalledExactlyOnceWith(deck, "c1");
    expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledExactlyOnceWith(
      deck,
      "r1",
    );
  });

  it("counts from the documents again when one changed, or the deck is studied another way", async () => {
    const digest = await learned();
    const changed = setup({
      ...digest,
      schedules: { [deck.url]: { ...digest.schedules[deck.url]!, cardsVersion: "c0" } },
    });
    await expect(changed.useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    expect(changed.deps.deckRepository.readCardsSince).toHaveBeenCalledExactlyOnceWith(deck, "c0");

    const otherWay = setup(digest);
    await expect(
      otherWay.useCases.getStudyCounts(instance.url, { ...deck, direction: "bidirectional" }, now),
    ).resolves.toEqual({
      dueCount: 1,
      newCount: 3,
    });
    expect(otherWay.deps.deckRepository.readCardsSince).toHaveBeenLastCalledWith(
      expect.anything(),
      undefined,
    );
  });

  it("counts from the documents again once the instance schedules with another scheduler, and keeps which", async () => {
    const digest = await learned();
    expect(digest.schedules[deck.url]!.schedule.scheduler).toBe("sm2");
    const switched = setup(digest);
    vi.mocked(switched.deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: { ...DEFAULT_PREFERENCES, scheduler: "fsrs6" },
      formatVersion: 5,
    });
    await expect(switched.useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    expect(switched.deps.deckRepository.readCardsSince).toHaveBeenLastCalledWith(
      expect.anything(),
      undefined,
    );
    await vi.waitFor(() => expect(switched.digestRepository.updateDigest).toHaveBeenCalled());
    expect(switched.stored()!.schedules[deck.url]!.schedule.scheduler).toBe("fsrs6");
  });

  it("counts, forecasts and spreads intervals by FSRS-6's due days under FSRS-6, eases by SM-2's", async () => {
    const { deps, useCases } = setup();
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: { ...DEFAULT_PREFERENCES, scheduler: "fsrs6" },
      formatVersion: 5,
    });
    const fsrs: FsrsState = {
      cardId: review.cardId,
      direction: review.direction,
      stability: 40,
      difficulty: 3,
      due: "2026-10-26",
      firstReviewedAt: review.firstReviewedAt,
      lastReviewedAt: review.lastReviewedAt,
      formatVersion: 1,
    };
    deps.reviewStateRepository.readReviewStatesSince = vi.fn(async () => ({
      unchanged: false as const,
      value: { sm2: [review], fsrs: [fsrs] },
      version: "r1",
    }));
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 0,
      newCount: 1,
    });
    const [progress] = (await useCases.getCardProgress(instance.url, now, { deck })).decks;
    // Thirty days from its last review on the 26th: mature, and not overdue.
    expect(progress!.progress).toEqual({ new: 1, relearning: 0, young: 0, mature: 1 });
    expect(progress!.intervals.find((bin) => bin.count > 0)!.from).toBeGreaterThan(1);
    expect(progress!.eases.reduce((sum, bin) => sum + bin.count, 0)).toBe(1);
    expect(progress!.overdue).toBe(0);
    const insight = await useCases.deckInsight(instance.url, deck, now, {
      ...DEFAULT_PREFERENCES,
      scheduler: "fsrs6",
    });
    expect(insight.intervals).toEqual(progress!.intervals);
  });

  it("notes no format receipt for a document holding something outdated, and nothing of a document without a version", async () => {
    const outdated = setup();
    outdated.deps.deckRepository.readCardsSince = vi.fn(async () => ({
      unchanged: false as const,
      value: [{ ...card, formatVersion: 0 }],
      version: "c1",
    }));
    outdated.deps.reviewStateRepository.readReviewStatesSince = vi.fn(async () => ({
      unchanged: false as const,
      value: sm2s([{ ...review, formatVersion: 1 }]),
      version: "r1",
    }));
    await outdated.useCases.getStudyCounts(instance.url, deck, now);
    await vi.waitFor(() => expect(outdated.digestRepository.updateDigest).toHaveBeenCalled());
    expect(outdated.stored()!.receipts).toEqual({});

    const unversioned = setup();
    unversioned.deps.deckRepository.readCardsSince = vi.fn(async () => ({
      unchanged: false as const,
      value: [card],
      version: null,
    }));
    await unversioned.useCases.getStudyCounts(instance.url, deck, now);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unversioned.digestRepository.updateDigest).not.toHaveBeenCalled();
  });

  it("goes on without a digest it cannot read or write", async () => {
    const { deps, useCases, digestRepository } = setup();
    vi.mocked(digestRepository.readDigest).mockRejectedValue(new Error("offline"));
    vi.mocked(digestRepository.updateDigest).mockRejectedValue(new Error("offline"));
    await expect(useCases.getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
    await expect(createUseCases(deps).getStudyCounts(instance.url, deck, now)).resolves.toEqual({
      dueCount: 1,
      newCount: 1,
    });
  });

  it("refuses a read without a version that says unchanged", async () => {
    const { deps, useCases } = setup(await learned());
    deps.deckRepository.readCardsSince = vi.fn(async () => ({ unchanged: true as const }));
    await expect(
      useCases.getStudyCounts(instance.url, { ...deck, direction: "bidirectional" }, now),
    ).rejects.toThrow("came back unchanged");
    await expect(useCases.refreshStudyDigest(instance.url, deck)).resolves.toBeUndefined();
  });

  it("keeps the schedule and checks the reviews document when a study session ends", async () => {
    const { useCases, stored, digestRepository } = setup();
    await useCases.refreshStudyDigest(instance.url, deck);
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalledTimes(2));
    expect(stored()!.schedules[deck.url]).toMatchObject({
      cardsVersion: "c1",
      reviewsVersion: "r1",
    });
    expect(stored()!.receipts[deck.reviewsDocumentUrl]).toEqual({
      document: deck.reviewsDocumentUrl,
      version: `v-${deck.reviewsDocumentUrl}`,
      conformedTo: RULES,
    });
  });

  it("keeps no receipt of a reviews document that does not conform, or has no version", async () => {
    const { deps, useCases, stored, digestRepository } = setup();
    deps.shapeValidator.validateDocumentSince = vi.fn(async (url: string) => ({
      unchanged: false as const,
      value: {
        url,
        status: "checked" as const,
        subjects: [
          {
            url: `${url}#x`,
            status: "checked" as const,
            shape: "reviewState" as const,
            version: 2,
            violations: [
              { message: { en: "no" }, severity: "violation" as const, constraint: "MinCount" },
            ],
          },
        ],
      },
      version: "r1",
    }));
    await useCases.refreshStudyDigest(instance.url, deck);
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalledOnce());
    expect(stored()!.receipts[deck.reviewsDocumentUrl]).toEqual({
      document: deck.reviewsDocumentUrl,
      version: "r1",
      latestFormat: true,
    });
    deps.shapeValidator.validateDocumentSince = vi.fn(async (url: string) => ({
      unchanged: false as const,
      value: { url, status: "checked" as const, subjects: [] },
      version: null,
    }));
    await useCases.refreshStudyDigest(instance.url, deck);
    expect(stored()!.receipts[deck.reviewsDocumentUrl]!.conformedTo).toBeUndefined();
  });

  it("plans the format update without reading again documents with nothing outdated, and writes no digest", async () => {
    const { deps, useCases, digestRepository } = setup(await learned());
    const plan = await useCases.planMigration(instance.url);
    expect(plan.cardCount).toBe(0);
    expect(deps.deckRepository.readCardsSince).toHaveBeenCalledWith(deck, "c1");
    expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledWith(deck, "r1");
    expect(digestRepository.updateDigest).not.toHaveBeenCalled();
  });
});
