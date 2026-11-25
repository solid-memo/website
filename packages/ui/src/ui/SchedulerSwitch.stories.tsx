// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { SchedulerSwitchProgress, SchedulerSwitchResult } from "./SchedulerSwitch";

const meta = {
  title: "Study/SchedulerSwitch",
  component: SchedulerSwitchResult,
  args: {
    outcome: { switched: true, decks: 3, replayed: 120, estimated: 14, failed: [] },
    onRetry: fn(),
    onClose: fn(),
  },
  parameters: { controls: { exclude: ["outcome"] } },
} satisfies Meta<typeof SchedulerSwitchResult>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The switch done: how many decks and cards, and how each card was worked out. */
export const Switched: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Done" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

/** The switch done with no card to switch: only that the due days are kept. */
export const NothingToSwitch: Story = {
  args: { outcome: { switched: true, decks: 0, replayed: 0, estimated: 0, failed: [] } },
};

/** Decks that couldn't be switched, each with why, and Try again. */
export const NotFinished: Story = {
  args: {
    outcome: {
      switched: false,
      decks: 1,
      replayed: 0,
      estimated: 0,
      failed: [
        {
          url: "https://pod.example/solid-memo/study/catalog.ttl#verbs",
          title: { en: "Verbs" },
          error: new AppError("podNoAnswer"),
        },
        {
          url: "https://pod.example/solid-memo/study/catalog.ttl#long",
          title: {
            en: "The capitals, rivers and mountain ranges of every country in Europe, with their flags",
          },
          error: new AppError("podNoAnswer"),
        },
      ],
    },
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Try again" }));
    await expect(args.onRetry).toHaveBeenCalled();
  },
};

/** The switch under way, reading the answers and decks first. */
export const Reading: Story = {
  render: () => <SchedulerSwitchProgress progress={{ step: "read", done: 0, total: 3 }} />,
};

/** The switch under way, writing the decks one by one. */
export const WritingDecks: Story = {
  render: () => (
    <SchedulerSwitchProgress
      progress={{ step: "decks", done: 1, total: 3, part: { done: 2, total: 5 } }}
    />
  ),
};
