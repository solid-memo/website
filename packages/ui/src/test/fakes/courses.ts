// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { vi } from "vitest";
import { editCompletedChapters } from "@solid-memo/domain/course";
import type { CourseUseCases } from "@solid-memo/application/courses";

/**
 * The use cases of the courses, faked (a `vi.fn` each), as the real
 * ones relate to one another; `overrides` replace any of them. They are
 * made in `fake`, the object a test calls, and call one another through
 * it, so a method a test replaces is the one the others call.
 */
export function makeCourseUseCasesFake(
  overrides: Partial<CourseUseCases> = {},
  fake: CourseUseCases = {} as CourseUseCases,
): CourseUseCases {
  return Object.assign(
    fake,
    {
      startCourse: vi.fn(async () => {
        throw new Error("startCourse fake not configured");
      }),
      getCourse: vi.fn(async () => {
        throw new Error("getCourse fake not configured");
      }),
      getCourseSummary: vi.fn(async () => {
        throw new Error("getCourseSummary fake not configured");
      }),
      answerCourseQuestion: vi.fn(async () => ({ effect: "none" as const, state: null })),
      completeChapter: vi.fn(async (deck, chapterUrl) => ({
        ...deck,
        completedChapters: [...(deck.completedChapters ?? []), chapterUrl],
      })),
      setCompletedChapters: vi.fn(async (deck, edit) => {
        const { completedChapters, ...rest } = deck;
        const after = editCompletedChapters(completedChapters ?? [], edit);
        return after.length === 0 ? rest : { ...rest, completedChapters: after };
      }),
    } satisfies CourseUseCases,
    overrides,
  );
}
