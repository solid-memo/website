// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { ChapterPlayerContainer } from "./ChapterPlayerContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { courseInstance, courseOutline, makeCourse, noShuffle } from "../test/course";

/** Leaves the step's theory for its question, and answers it. */
async function answer(canvasElement: HTMLElement, option: string) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: /^On to the question/ }));
  await userEvent.click(canvas.getByRole("radio", { name: option }));
  await userEvent.click(canvas.getByRole("button", { name: "Check" }));
  return canvas;
}

const meta = {
  title: "Courses/ChapterPlayerContainer",
  component: ChapterPlayerContainer,
  args: {
    useCases: makeUseCasesFake({
      answerCourseQuestion: fn(async () => ({ effect: "introduce" as const, state: null })),
    }),
    instance: courseInstance,
    course: makeCourse(),
    chapter: courseOutline.chapters[0]!,
    onReview: fn(),
    random: noShuffle,
  },
  parameters: { controls: { exclude: ["useCases", "instance", "course", "chapter", "random"] } },
} satisfies Meta<typeof ChapterPlayerContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A chapter from its first step: the theory, then its question, answered right. */
export const FirstStep: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await answer(canvasElement, "An IRI");
    await expect(await canvas.findByText(/Added to your deck/)).toBeInTheDocument();
  },
};

/** A chapter resumed at the step the learner had reached. */
export const Resumed: Story = { args: { course: makeCourse(["q-1"]) } };

/** The chapter's last question answered: on to its final review. */
export const ToReview: Story = {
  args: { chapter: courseOutline.chapters[1]! },
  play: async ({ args, canvasElement }) => {
    const canvas = await answer(canvasElement, "A store");
    await userEvent.click(await canvas.findByRole("button", { name: "On to the final review" }));
    await expect(args.onReview).toHaveBeenCalled();
  },
};

/** The answer couldn't be saved. */
export const AnswerFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      answerCourseQuestion: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = await answer(canvasElement, "An IRI");
    await expect(await canvas.findByText(/did not answer in time/)).toBeInTheDocument();
  },
};
