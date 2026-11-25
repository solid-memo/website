// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { ImportUrlContainer } from "./ImportUrlContainer";
import { courseDeck } from "../test/course";
import { makeUseCasesFake } from "../test/useCasesFake";
import { storyInstance } from "../test/storyData";
import {
  importedCapitals,
  linkedCourse,
  linkedRelease,
  linkedReleaseUrl,
} from "../test/stories/library";

const meta = {
  title: "Library/ImportUrlContainer",
  component: ImportUrlContainer,
  args: {
    useCases: makeUseCasesFake({
      readReleaseFromLink: fn(async () => linkedRelease),
      importReleaseFromUrl: fn(async () => importedCapitals),
    }),
    instance: storyInstance,
    url: linkedReleaseUrl,
    onShow: fn(),
    onDone: fn(),
    onCourseStarted: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "instance"] } },
} satisfies Meta<typeof ImportUrlContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No link yet: the one pasted goes into the URL. */
export const NoLinkYet: Story = {
  args: { url: undefined },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Link to the release" }),
      linkedReleaseUrl,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Show" }));
    await expect(args.onShow).toHaveBeenCalledWith(linkedReleaseUrl);
  },
};

/** A deck at the link, read and checked, then imported. */
export const Deck: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Import this deck" }));
    await waitFor(() => expect(args.onDone).toHaveBeenCalled());
  },
};

/** A course at the link, started, which opens it. */
export const Course: Story = {
  args: {
    useCases: makeUseCasesFake({
      readReleaseFromLink: fn(async () => linkedCourse),
      importReleaseFromUrl: fn(async () => courseDeck),
    }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Start course" }));
    await waitFor(() => expect(args.onCourseStarted).toHaveBeenCalledWith(courseDeck));
  },
};

/** The release being read and checked. */
export const Reading: Story = {
  args: {
    useCases: makeUseCasesFake({ readReleaseFromLink: fn(() => new Promise<never>(() => {})) }),
  },
};

/** The link holds no release that can be read. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      readReleaseFromLink: fn(async () => {
        throw new AppError("releaseUnreadable", { url: linkedReleaseUrl });
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/cannot read a release/),
    ).toBeInTheDocument();
  },
};
