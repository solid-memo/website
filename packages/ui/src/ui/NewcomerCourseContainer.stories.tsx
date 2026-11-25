// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { NewcomerCourseContainer } from "./NewcomerCourseContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { courseDeck, courseInstance, courseLibraryDeck } from "../test/course";

/** The course the library names for newcomers. */
const forNewcomers = { ...courseLibraryDeck, forNewcomers: true as const };

const meta = {
  title: "Courses/NewcomerCourseContainer",
  component: NewcomerCourseContainer,
  args: {
    useCases: makeUseCasesFake({
      listLibraryDecks: fn(async () => [forNewcomers]),
      startCourse: fn(async () => courseDeck),
    }),
    instance: courseInstance,
    onCourseStarted: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "instance"] } },
} satisfies Meta<typeof NewcomerCourseContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The library's course for newcomers, offered and started. */
export const Offered: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Start the course" }),
    );
    await waitFor(() => expect(args.onCourseStarted).toHaveBeenCalledWith(courseDeck));
  },
};

/** The course couldn't be started: the offer says why. */
export const StartFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      listLibraryDecks: fn(async () => [forNewcomers]),
      startCourse: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Start the course" }));
    await expect(await canvas.findByText(/did not answer in time/)).toBeInTheDocument();
  },
};

/** The library names no course for newcomers: nothing is offered. */
export const NoCourse: Story = {
  args: { useCases: makeUseCasesFake({ listLibraryDecks: fn(async () => [courseLibraryDeck]) }) },
};
