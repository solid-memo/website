// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Card, DeckDirection, StudyDirection } from "./deck";
import { DEFAULT_PREFERENCES, type StudyPreferences } from "./preferences";
import type { ReviewState } from "./review";
import { buildStudyQueue } from "./scheduling";
import {
  emptyDigest,
  scheduleOf,
  studyCountsOf,
  withReceipt,
  withSchedule,
  type DeckSchedule,
} from "./studyDigest";

function card(id: string, retired = false): Card {
  return {
    id,
    url: `https://pod.example/decks/d.ttl#${id}`,
    front: { "": "front" },
    back: { "": "back" },
    createdAt: "2026-09-01T00:00:00.000Z",
    formatVersion: 1,
    ...(retired ? { retired: true as const } : {}),
  };
}

function review(
  cardId: string,
  due: string,
  lastReviewedAt: Date,
  firstReviewedAt: Date = lastReviewedAt,
  direction: StudyDirection = "front-to-back",
): ReviewState {
  return {
    cardId,
    direction,
    easeFactor: 2.5,
    intervalDays: 1,
    repetitions: 1,
    due,
    firstReviewedAt: firstReviewedAt.toISOString(),
    lastReviewedAt: lastReviewedAt.toISOString(),
    formatVersion: 2,
  };
}

const lastWeek = new Date(2026, 8, 14, 12, 0);
const yesterday = new Date(2026, 8, 20, 12, 0);
const now = new Date(2026, 8, 21, 12, 0);
const tomorrow = new Date(2026, 8, 22, 12, 0);
const later = new Date(2026, 8, 25, 12, 0);

/** A deck with something of everything: due, overdue, future, new, retired, both ways, studied today. */
const cards = [
  card("a"),
  card("b"),
  card("c"),
  card("d"),
  card("e"),
  card("f"),
  card("retired", true),
];
const reviews = [
  review("a", "2026-09-19", lastWeek),
  review("b", "2026-09-21", yesterday),
  review("c", "2026-09-23", now, lastWeek),
  review("d", "2026-09-22", now, now),
  review("a", "2026-09-21", yesterday, yesterday, "back-to-front"),
  review("retired", "2026-09-20", now),
  review("gone", "2026-09-20", lastWeek),
];

function queueCounts(input: { direction: DeckDirection; prefs: StudyPreferences; at: Date }) {
  const queue = buildStudyQueue({
    cards,
    direction: input.direction,
    reviews,
    prefs: input.prefs,
    now: input.at,
    random: () => 0,
  });
  return { dueCount: queue.due.length, newCount: queue.newPrompts.length };
}

describe("a deck schedule", () => {
  const directions: DeckDirection[] = ["front-to-back", "back-to-front", "bidirectional"];
  const caps: StudyPreferences[] = [
    DEFAULT_PREFERENCES,
    { ...DEFAULT_PREFERENCES, newCardsPerDay: 1, maxReviewsPerDay: 2 },
    { ...DEFAULT_PREFERENCES, newCardsPerDay: 0, maxReviewsPerDay: 0 },
  ];

  it.each(directions)(
    "counts what buildStudyQueue counts, on the day it was computed and later (%s)",
    (direction) => {
      const schedule = scheduleOf({ cards, direction, reviews, dayBoundaryHour: 4, now });
      for (const prefs of caps) {
        for (const at of [now, tomorrow, later]) {
          // Later days: nothing was reviewed since (else the reviews document, and so the schedule, would be new).
          expect(studyCountsOf(schedule, { direction, prefs, now: at })).toEqual(
            queueCounts({ direction, prefs, at }),
          );
        }
      }
    },
  );

  it("holds the prompts due by day, the new ones and the day's work", () => {
    expect(
      scheduleOf({ cards, direction: "bidirectional", reviews, dayBoundaryHour: 4, now }),
    ).toEqual<DeckSchedule>({
      direction: "bidirectional",
      dayBoundaryHour: 4,
      dueByDay: { "2026-09-19": 1, "2026-09-21": 2, "2026-09-23": 1, "2026-09-22": 1 },
      unreviewed: 7,
      studyDay: "2026-09-21",
      reviewedOnDay: 3,
      introducedOnDay: 2,
    });
  });

  it("cannot say for another direction, another day boundary, or a day before it was computed", () => {
    const schedule = scheduleOf({
      cards,
      direction: "front-to-back",
      reviews,
      dayBoundaryHour: 4,
      now,
    });
    const prefs = DEFAULT_PREFERENCES;
    expect(studyCountsOf(schedule, { direction: "bidirectional", prefs, now })).toBeNull();
    expect(
      studyCountsOf(schedule, {
        direction: "front-to-back",
        prefs: { ...prefs, dayBoundaryHour: 5 },
        now,
      }),
    ).toBeNull();
    expect(
      studyCountsOf(schedule, { direction: "front-to-back", prefs, now: yesterday }),
    ).toBeNull();
  });
});

describe("an instance digest", () => {
  const doc = "https://pod.example/i/decks/d.ttl";

  it("adds to what it knew of a document at the same version, and forgets another version", () => {
    let digest = withReceipt(emptyDigest(), doc, '"v1"', { latestFormat: true });
    digest = withReceipt(digest, doc, '"v1"', { conformedTo: "rules" });
    expect(digest.receipts[doc]).toEqual({
      document: doc,
      version: '"v1"',
      latestFormat: true,
      conformedTo: "rules",
    });
    digest = withReceipt(digest, doc, '"v2"', { conformedTo: "rules" });
    expect(digest.receipts[doc]).toEqual({ document: doc, version: '"v2"', conformedTo: "rules" });
  });

  it("keeps a schedule by its deck", () => {
    const schedule = scheduleOf({
      cards: [],
      direction: "front-to-back",
      reviews: [],
      dayBoundaryHour: 4,
      now,
    });
    const stored = {
      deck: "https://pod.example/i/catalog.ttl#deck-1",
      cardsVersion: '"c"',
      reviewsVersion: "absent",
      schedule,
    };
    expect(withSchedule(emptyDigest(), stored).schedules).toEqual({ [stored.deck]: stored });
  });
});
