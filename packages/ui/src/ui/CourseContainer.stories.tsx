// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, within } from "storybook/test";
import { CourseContainer } from "./CourseContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { CH1, CH2, courseInstance, makeCourse, makeSteplessCourse } from "../test/course";

/** A course with its first question answered. */
const started = makeCourse(["q-1"]);

const meta = {
  title: "Courses/CourseContainer",
  component: CourseContainer,
  args: {
    useCases: makeUseCasesFake(),
    instance: courseInstance,
    course: makeCourse(),
  },
  parameters: { controls: { exclude: ["useCases", "instance", "course", "justCompleted"] } },
} satisfies Meta<typeof CourseContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A course not started: it starts at its first chapter's first step. */
export const NotStarted: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("link", { name: "Start the course" }),
    ).toBeInTheDocument();
  },
};

/** A chapter's steps done: it goes on at the chapter's final review. */
export const ReviewNext: Story = {
  args: { course: makeCourse(["q-1", "q-2", "q-3"]) },
};

/** Back from the first chapter's final review, just completed. */
export const ChapterJustCompleted: Story = {
  args: {
    course: makeCourse(["q-1", "q-2", "q-3", "r-1"], [CH1]),
    justCompleted: { chapterUrl: CH1, finishedCourse: false },
  },
};

/** Every chapter completed. */
export const Finished: Story = {
  args: { course: makeCourse(["q-1", "q-2", "q-3", "r-1", "q-4"], [CH1, CH2]) },
};

/** A chapter with no steps, only its final review. */
export const ReviewOnlyChapter: Story = { args: { course: makeSteplessCourse() } };

/** The course's deck paused: the course is paused with it. */
export const Paused: Story = {
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/paused/i)).toBeInTheDocument();
  },
  args: {
    course: {
      ...started,
      deck: { ...started.deck, pause: { pausedAt: "2026-09-20T10:00:00.000Z" } },
    },
  },
};
