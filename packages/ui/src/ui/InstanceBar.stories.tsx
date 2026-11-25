// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, within } from "storybook/test";
import { GUEST_INSTANCE_URL } from "@solid-memo/domain/guest";
import { InstanceBar } from "./InstanceBar";
import { storyInstance } from "../test/storyData";

const meta = {
  title: "Instances/InstanceBar",
  component: InstanceBar,
  args: { instance: storyInstance },
} satisfies Meta<typeof InstanceBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An instance in the user's pod: its name, a link to open it there, and the instance's pages. */
export const InPod: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("My study")).toBeInTheDocument();
    await expect(canvas.getAllByRole("link").length).toBeGreaterThan(3);
  },
};

/** An instance kept in the browser, as a guest has: no pod to open it in. */
export const InBrowser: Story = {
  args: { instance: { url: GUEST_INSTANCE_URL, name: "Trying it out" } },
};

/** An instance whose name is long enough to wrap. */
export const LongName: Story = {
  args: {
    instance: {
      ...storyInstance,
      name: "Languages, capitals and everything else I want to remember for the trip next summer",
    },
  },
};
