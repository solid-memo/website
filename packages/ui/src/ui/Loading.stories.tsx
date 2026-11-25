// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { Loading, LoadingDots } from "./Loading";

const meta = {
  title: "Basics/Loading",
  component: Loading,
  args: { label: "Loading your decks…" },
} satisfies Meta<typeof Loading>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A loading state with its label. */
export const WithLabel: Story = {};

/** A long label, wrapping beside the dots. */
export const LongLabel: Story = {
  args: {
    label:
      "Loading the cards of every deck in this instance, which can take a while on a slow connection…",
  },
};

/** The dots alone, as a row or a slot shows them. */
export const DotsAlone: Story = {
  render: () => <LoadingDots />,
};
