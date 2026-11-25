// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, within } from "storybook/test";
import { Inspector } from "./Inspector";

const meta = {
  title: "Statistics/Charts/Inspector",
  component: Inspector,
  args: {
    id: "inspector-story",
    text: null,
    prompt: "Point at a day (or use the arrow keys) to see what it held, or open the table below.",
    keyed: false,
  },
} satisfies Meta<typeof Inspector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing pointed at: how to point at a day. */
export const Prompt: Story = {};

/** A day pointed at with the pointer: what it held. */
export const Pointed: Story = {
  args: { text: "September 14, 2026: 40 answers (10 new, 26 remembered, 4 lapses, 0 repeats)." },
};

/** A day reached by the keyboard: said once more in the status line a screen reader reads. */
export const Keyed: Story = {
  args: { text: "September 21, 2026: nothing studied.", keyed: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent(
      "September 21, 2026: nothing studied.",
    );
  },
};
