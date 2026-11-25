// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { RegistrationTargetChooser } from "./RegistrationTargetChooser";
import { REGISTRATION_OPTIONS } from "../test/fakes/instances";

const meta = {
  title: "Instances/RegistrationTargetChooser",
  component: RegistrationTargetChooser,
  args: { options: REGISTRATION_OPTIONS, value: "private", onChange: fn() },
} satisfies Meta<typeof RegistrationTargetChooser>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A private and a public type index, the private one recommended; the public one chosen. */
export const OneOfEach: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByLabelText(/^Public type index/));
    await expect(args.onChange).toHaveBeenCalledWith({
      indexUrl: "https://pod.example/settings/publicTypeIndex.ttl",
    });
  },
};

/** The type indexes are still being read: the two kinds are offered. */
export const Loading: Story = { args: { options: null } };

/** No private type index: a warning, and one to create offered. */
export const NoPrivateIndex: Story = {
  args: {
    options: {
      privateIndexExists: false,
      publicIndexExists: true,
      indexes: [REGISTRATION_OPTIONS.indexes[1]],
    },
  },
};

/** Type indexes with something to know about each: cautions and notes under them. */
export const Cautions: Story = {
  args: {
    options: {
      privateIndexExists: true,
      publicIndexExists: true,
      indexes: [
        {
          url: "https://pod.example/settings/privateTypeIndex.ttl",
          kinds: ["private"],
          fromPreferences: true,
          typeFit: "match",
          holdsInstances: true,
          readableByAnyone: true,
        },
        {
          url: "https://pod.example/settings/listedIndex.ttl",
          kinds: ["private"],
          fromPreferences: false,
          typeFit: "other",
          holdsInstances: false,
          readableByAnyone: false,
        },
        {
          url: "https://pod.example/settings/publicTypeIndex.ttl",
          kinds: ["public"],
          fromPreferences: false,
          typeFit: "other",
          holdsInstances: false,
          readableByAnyone: false,
        },
        {
          url: "https://pod.example/settings/typeIndex.ttl",
          kinds: ["private", "public"],
          fromPreferences: false,
          typeFit: "none",
          holdsInstances: false,
          readableByAnyone: null,
        },
      ],
    },
  },
};

/** Another type index, entered by its address. */
export const Another: Story = {
  args: { value: { indexUrl: "https://pod.example/lists/memo.ttl" } },
  play: async ({ args, canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("textbox"), "x");
    await expect(args.onChange).toHaveBeenCalledWith({
      indexUrl: "https://pod.example/lists/memo.ttlx",
    });
  },
};
