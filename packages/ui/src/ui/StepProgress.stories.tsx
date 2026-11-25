// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { StepProgress } from "./StepProgress";

const meta = {
  title: "Basics/StepProgress",
  component: StepProgress,
  args: {
    region: "Updating Kanji N5",
    steps: [
      { step: "read", label: "Read the new release" },
      { step: "cards", label: "Update the cards" },
      { step: "progress", label: "Keep your progress" },
      { step: "done", label: "Finish" },
    ],
    current: "cards",
    done: 1,
    total: 4,
    part: { done: 3, total: 7 },
    count: "3 of 7 documents",
    status: "Updating the cards…",
    progressLabel: "Update progress",
    hint: "Keep this page open until the update is done.",
  },
} satisfies Meta<typeof StepProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Under way: a step done, the current one partly through, in words. */
export const UnderWay: Story = {};

/** The current step's count by default ("3 of 7"). */
export const DefaultCount: Story = { args: { count: undefined } };

/** Starting: no count yet, every step still to come but the first. */
export const Starting: Story = {
  args: { current: "read", done: 0, part: undefined, status: "Reading the new release…" },
};

/** Finished: every step done. */
export const Finished: Story = {
  args: { current: "done", done: 4, part: undefined, status: "The deck is up to date." },
};
