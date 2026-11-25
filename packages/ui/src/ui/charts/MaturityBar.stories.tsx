// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, within } from "storybook/test";
import { MaturityBar } from "./MaturityBar";

const meta = {
  title: "Statistics/Charts/MaturityBar",
  component: MaturityBar,
  args: {
    progress: { new: 120, relearning: 4, young: 60, mature: 56 },
    caption: "Where the cards stand",
  },
} satisfies Meta<typeof MaturityBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck studied a while: every stage, each as wide as its share. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("img")).toHaveAccessibleName(/120 new/);
  },
};

/** A deck not yet studied: all new. */
export const AllNew: Story = {
  args: { progress: { new: 40, relearning: 0, young: 0, mature: 0 } },
};

/** No cards at all: an empty bar. */
export const Empty: Story = { args: { progress: { new: 0, relearning: 0, young: 0, mature: 0 } } };

/** One card, mature. */
export const OneCard: Story = {
  args: { progress: { new: 0, relearning: 0, young: 0, mature: 1 } },
};

/** Hundreds of thousands of cards, a stage of a handful among them. */
export const LargeValues: Story = {
  args: { progress: { new: 250_000, relearning: 3, young: 48_000, mature: 812_000 } },
};
