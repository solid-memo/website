// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, within } from "storybook/test";
import type { CourseStatistics } from "@solid-memo/application/statistics";
import { CourseStatisticsContainer, CourseStatisticsView } from "./CourseStatistics";
import { makeUseCasesFake } from "../test/useCasesFake";
import { courseDeck, courseInstance, RELEASE } from "../test/course";

/** A course of three chapters: one done, one open, one locked. */
const results: CourseStatistics = {
  deck: courseDeck,
  done: 1,
  count: 3,
  start: 0,
  chapters: [
    {
      url: `${RELEASE}#ch-1`,
      title: { en: "Linked data" },
      state: "done",
      quiz: { answers: 4, right: 3 },
    },
    {
      url: `${RELEASE}#ch-2`,
      title: { en: "Resources, their descriptions, and the vocabularies that describe them" },
      state: "open",
      quiz: { answers: 1, right: 0 },
    },
    {
      url: `${RELEASE}#ch-3`,
      title: { en: "Pods" },
      state: "locked",
      quiz: { answers: 0, right: 0 },
    },
  ],
};

/** A long course: a window of its chapters, and how many come before and after. */
const longCourse: CourseStatistics = {
  deck: { ...courseDeck, url: `${courseInstance.url}catalog.ttl#deck-2`, title: { en: "Korean" } },
  done: 12,
  count: 40,
  start: 10,
  chapters: Array.from({ length: 6 }, (_, n) => ({
    url: `${RELEASE}#long-${10 + n}`,
    title: { en: `Chapter ${11 + n}` },
    state: n < 2 ? ("done" as const) : n === 2 ? ("open" as const) : ("locked" as const),
    quiz: { answers: 10, right: 7 },
  })),
};

const meta = {
  title: "Courses/CourseStatistics",
  component: CourseStatisticsView,
  args: { instanceUrl: courseInstance.url, courses: [results] },
  parameters: { controls: { exclude: ["courses"] } },
} satisfies Meta<typeof CourseStatisticsView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A course's chapters done, and where each stands with its graded answers. */
export const OneCourse: Story = {};

/** Two courses, the second long: a window of its chapters. */
export const LongCourse: Story = { args: { courses: [results, longCourse] } };

/** No course: nothing shown. */
export const NoCourses: Story = { args: { courses: [] } };

/** The statistics screen's section, read from the courses' answers. */
export const Container: Story = {
  render: () => (
    <CourseStatisticsContainer
      useCases={makeUseCasesFake({
        releaseIsCourse: fn(async () => true),
        getCourseStatistics: fn(async () => [results]),
      })}
      instance={courseInstance}
      decks={[courseDeck]}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("region", { name: "Your courses" }),
    ).toBeInTheDocument();
  },
};
