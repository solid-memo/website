// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import type { StudySessionQueue } from "@solid-memo/application/study";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { StudyUseCases } from "@solid-memo/application/study";

/**
 * What a study queue comes with besides its prompts, when a test has
 * nothing to say of it: the default preferences, and no states.
 */
export const QUEUE_DEFAULTS: Pick<StudySessionQueue, "prefs" | "states" | "fsrsStates"> = {
  prefs: DEFAULT_PREFERENCES,
  states: [],
  fsrsStates: [],
};

/**
 * The use cases of study, faked (a `vi.fn` each), as the real ones
 * relate to one another; `overrides` replace any of them. They are made
 * in `fake`, the object a test calls, and call one another through it,
 * so a method a test replaces is the one the others call.
 */
export function makeStudyUseCasesFake(
  overrides: Partial<StudyUseCases> = {},
  fake: StudyUseCases = {} as StudyUseCases,
): StudyUseCases {
  return Object.assign(
    fake,
    {
      getStudyQueue: vi.fn(async () => ({
        due: [],
        newPrompts: [],
        studiedToday: 0,
        ...QUEUE_DEFAULTS,
      })),
      resetStudyDay: vi.fn(async () => 0),
      // The state of the prompt answered, as a first answer leaves it.
      recordReview: vi.fn(async (_instanceUrl, _deck, prompt) => {
        const key = { cardId: prompt.card.id, direction: prompt.direction };
        return {
          state: {
            ...key,
            easeFactor: 2.6,
            intervalDays: 1,
            repetitions: 1,
            due: "2026-09-22",
            firstReviewedAt: "2026-09-21T10:00:00.000Z",
            lastReviewedAt: "2026-09-21T10:00:00.000Z",
            formatVersion: 2,
          },
          undo: { key, before: null, answer: { id: "answer-1", studyDay: "2026-09-21" } },
        };
      }),
      undoReview: vi.fn(async (_instanceUrl, _deck, undo) => undo.before),
      // As the real ones relate to them: the counts of the queue, the check of the full check.
      getStudyCounts: vi.fn(async (instanceUrl, deck, now) => {
        const queue = await fake.getStudyQueue(instanceUrl, deck, now);
        return { dueCount: queue.due.length, newCount: queue.newPrompts.length };
      }),
      refreshStudyDigest: vi.fn(async () => undefined),
    } satisfies StudyUseCases,
    overrides,
  );
}
