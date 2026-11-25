// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { choicesOf } from "@solid-memo/domain/course";
import { ChapterReviewScreen } from "./ChapterReviewScreen";
import { courseCards, courseOutline, noShuffle } from "../test/course";

/** The chapter's review question, its options in order. */
const card = courseCards[3]!;
const choices = choicesOf(card, noShuffle);

const meta = {
  title: "Courses/ChapterReviewScreen",
  component: ChapterReviewScreen,
  args: {
    chapterTitle: courseOutline.chapters[0]!.title,
    started: false,
    courseHref: "#/course",
    place: 0,
    position: 1,
    total: 4,
    card,
    choices,
    answer: null,
    busy: false,
    error: null,
    completion: null,
    onStart: fn(),
    onCheck: fn(),
    onNext: fn(),
    onRetry: fn(),
  },
  parameters: {
    controls: { exclude: ["chapterTitle", "card", "choices", "answer", "error", "completion"] },
  },
} satisfies Meta<typeof ChapterReviewScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The word before the review: every step done, and what the review is. */
export const BeforeStart: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Start the final review" }),
    );
    await expect(args.onStart).toHaveBeenCalled();
  },
};

/** A question of the review, with where it stands. */
export const Question: Story = { args: { started: true, position: 2 } };

/** A question answered wrong: it comes back, the total grown. */
export const AnsweredWrong: Story = {
  args: {
    started: true,
    position: 4,
    total: 5,
    answer: { choice: choices[1]!, effect: "review" },
  },
};

/** Every question answered right: the chapter being completed. */
export const Completing: Story = {
  args: { started: true, card: null, choices: [], completion: { state: "saving" } },
};

/** The chapter couldn't be completed: Try again. */
export const CompletionFailed: Story = {
  args: {
    started: true,
    card: null,
    choices: [],
    completion: {
      state: "failed",
      error: "The server did not answer in time. Check your connection and try again.",
    },
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Try again" }));
    await expect(args.onRetry).toHaveBeenCalled();
  },
};

/** A chapter titled in Arabic, right to left. */
export const ArabicTitle: Story = { args: { chapterTitle: { ar: "التحيات اليومية" } } };
