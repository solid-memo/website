// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ImportUrlScreen } from "./ImportUrlScreen";
import { linkedCourse, linkedRelease, linkedReleaseUrl } from "../test/stories/library";

const meta = {
  title: "Library/ImportUrlScreen",
  component: ImportUrlScreen,
  args: {
    url: linkedReleaseUrl,
    release: linkedRelease,
    reading: false,
    readError: null,
    imported: false,
    busy: false,
    error: null,
    onShow: fn(),
    onAdd: fn(),
    reportPlace: { library: false, contact: "https://pod.example/contact" },
    shareUrl: `https://solid-memo.example/#/try?url=${encodeURIComponent(linkedReleaseUrl)}`,
  },
  parameters: { controls: { exclude: ["release", "reportPlace"] } },
} satisfies Meta<typeof ImportUrlScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No link yet: one pasted and shown. */
export const NoLinkYet: Story = {
  args: { url: undefined, release: undefined, shareUrl: undefined, reportPlace: undefined },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Link to the release" }),
      `  ${linkedReleaseUrl} `,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Show" }));
    await expect(args.onShow).toHaveBeenCalledWith(linkedReleaseUrl);
  },
};

/** The release at the link read and checked: where it is published, and added with its button. */
export const Release: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Import this deck" }));
    await expect(args.onAdd).toHaveBeenCalled();
  },
};

/** A course at the link: started, not imported. */
export const Course: Story = { args: { release: linkedCourse } };

/** A deck the instance already holds a copy of. */
export const AlreadyImported: Story = { args: { imported: true } };

/** The release being read and checked. */
export const Reading: Story = { args: { release: undefined, reading: true } };

/** The release shown being read again: it can't be added meanwhile. */
export const ReadingAgain: Story = { args: { reading: true } };

/** The link holds no release that can be read. */
export const ReadFailed: Story = {
  args: {
    release: undefined,
    readError: `Solid Memo cannot read a release at ${linkedReleaseUrl}. Check the address, and that the release is published there.`,
  },
};

/** The release being added. */
export const Adding: Story = { args: { busy: true } };

/** Adding the release failed. */
export const AddFailed: Story = {
  args: { error: "The server did not answer in time. Check your connection and try again." },
};
