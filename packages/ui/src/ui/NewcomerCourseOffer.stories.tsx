// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { NewcomerCourseOffer } from "./NewcomerCourseOffer";
import { courseLibraryDeck } from "../test/course";

const meta = {
  title: "Courses/NewcomerCourseOffer",
  component: NewcomerCourseOffer,
  args: {
    course: courseLibraryDeck,
    aboutHref: "#/library",
    busy: false,
    error: null,
    onStart: fn(),
  },
  parameters: { controls: { exclude: ["course", "error"] } },
} satisfies Meta<typeof NewcomerCourseOffer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The course for newcomers, offered under an empty deck list. */
export const Offer: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Start the course" }));
    await expect(args.onStart).toHaveBeenCalled();
  },
};

/** A course whose title is long enough to wrap. */
export const LongTitle: Story = {
  args: {
    course: {
      ...courseLibraryDeck,
      title: {
        en: "Solid, linked data and the web of data: everything a newcomer needs before their first deck",
      },
    },
  },
};

/** The course starting: the button waits. */
export const Starting: Story = { args: { busy: true } };

/** The course couldn't be started. */
export const StartFailed: Story = {
  args: { error: "The server did not answer in time. Check your connection and try again." },
};
