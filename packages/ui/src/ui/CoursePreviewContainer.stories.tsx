// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { CoursePreviewContainer } from "./CoursePreviewContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { courseLibraryDeck, makeCourse, noShuffle } from "../test/course";

const meta = {
  title: "Courses/CoursePreviewContainer",
  component: CoursePreviewContainer,
  args: {
    useCases: makeUseCasesFake({ getLibraryCourse: fn(async () => makeCourse()) }),
    deck: courseLibraryDeck,
    deckHref: "#/library-deck?deck=solid",
    chapterHref: fn(() => "#/library-preview?deck=solid"),
    onChapter: fn(),
    onExit: fn(),
    random: noShuffle,
  },
  parameters: { controls: { exclude: ["useCases", "deck", "random"] } },
} satisfies Meta<typeof CoursePreviewContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The course read: its chapters, each linked to its preview. */
export const Chapters: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("link", { name: "Linked data" }),
    ).toBeInTheDocument();
  },
};

/** A chapter played as the course plays it, nothing recorded: on to its first question. */
export const ChapterOpened: Story = {
  args: { chapterId: "ch-1" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /^On to the question/ }));
    await userEvent.click(canvas.getByRole("radio", { name: "An IRI" }));
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    await expect(await canvas.findByText(/Right!/)).toBeInTheDocument();
  },
};

/** The last chapter's last question answered: back to the chapters. */
export const LastChapterEnd: Story = {
  args: { chapterId: "ch-2" },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /^On to the question/ }));
    await userEvent.click(canvas.getByRole("radio", { name: "A store" }));
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Back to the chapters" }));
    await expect(args.onChapter).toHaveBeenCalledWith(undefined);
  },
};

/** The course on its way. */
export const Loading: Story = {
  args: {
    useCases: makeUseCasesFake({ getLibraryCourse: fn(() => new Promise<never>(() => {})) }),
  },
};

/** The course couldn't be read. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      getLibraryCourse: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/did not answer in time/),
    ).toBeInTheDocument();
  },
};
