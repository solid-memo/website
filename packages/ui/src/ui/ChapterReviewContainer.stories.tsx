// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { ChapterReviewContainer } from "./ChapterReviewContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { CH1, courseInstance, courseOutline, makeCourse, noShuffle } from "../test/course";

/** Starts the last chapter's review, and answers its one question right. */
async function answerLastChapter(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "Start the final review" }));
  await userEvent.click(canvas.getByRole("radio", { name: "A store" }));
  await userEvent.click(canvas.getByRole("button", { name: "Check" }));
  await userEvent.click(await canvas.findByRole("button", { name: "Next" }));
  return canvas;
}

const meta = {
  title: "Courses/ChapterReviewContainer",
  component: ChapterReviewContainer,
  args: {
    useCases: makeUseCasesFake(),
    instance: courseInstance,
    course: makeCourse(["q-1", "q-2", "q-3"]),
    chapter: courseOutline.chapters[0]!,
    onCompleted: fn(),
    random: noShuffle,
  },
  parameters: { controls: { exclude: ["useCases", "instance", "course", "chapter", "random"] } },
} satisfies Meta<typeof ChapterReviewContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The word before a chapter's review. */
export const BeforeStart: Story = {};

/** The review started: its first question. */
export const Started: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Start the final review" }));
    await expect(canvas.getByText("Question 1 of 4")).toBeInTheDocument();
  },
};

/** The course's last chapter reviewed: completing it finishes the course. */
export const FinishesCourse: Story = {
  args: {
    course: makeCourse(["q-1", "q-2", "q-3", "r-1"], [CH1]),
    chapter: courseOutline.chapters[1]!,
  },
  play: async ({ args, canvasElement }) => {
    await answerLastChapter(canvasElement);
    await waitFor(() => expect(args.onCompleted).toHaveBeenCalledWith(true));
  },
};

/** The chapter couldn't be completed: Try again. */
export const CompletionFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      completeChapter: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
    course: makeCourse(["q-1", "q-2", "q-3", "r-1"], [CH1]),
    chapter: courseOutline.chapters[1]!,
  },
  play: async ({ canvasElement }) => {
    const canvas = await answerLastChapter(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  },
};
