// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { LazyDetails } from "./LazyDetails";

const meta = {
  title: "Basics/LazyDetails",
  component: LazyDetails,
  args: { summary: "Every problem found", children: null },
  parameters: { controls: { exclude: ["children"] } },
  render: (args) => (
    <LazyDetails {...args}>
      <ul>
        <li>Card “日” has no back.</li>
        <li>Card “月” names a picture that couldn't be read.</li>
      </ul>
    </LazyDetails>
  ),
} satisfies Meta<typeof LazyDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Closed: its content isn't drawn until it opens. */
export const Closed: Story = {};

/** Opened by a press: its content drawn. */
export const Opened: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Every problem found"));
    await expect(await canvas.findByText("Card “日” has no back.")).toBeInTheDocument();
  },
};
