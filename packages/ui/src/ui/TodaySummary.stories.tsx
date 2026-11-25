// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { TodaySummary } from "./TodaySummary";

const meta = {
  title: "Decks/TodaySummary",
  component: TodaySummary,
  args: {
    today: {
      answers: 24,
      introduced: 5,
      recall: { reviews: 19, recalled: 16 },
      streak: 4,
      longestStreak: 12,
      week: { answers: 80, previous: 64 },
    },
    left: 9,
    minutesLeft: 4,
    statisticsHref: "#/statistics",
  },
} satisfies Meta<typeof TodaySummary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A day under way: the streak, the day's numbers and the cards still left. */
export const UnderWay: Story = {};

/** A first day's study: one answer, no review yet, and no week before it. */
export const FirstDay: Story = {
  args: {
    today: {
      answers: 1,
      introduced: 1,
      recall: { reviews: 0, recalled: 0 },
      streak: 1,
      longestStreak: 1,
      week: { answers: 1, previous: 0 },
    },
    left: undefined,
    minutesLeft: undefined,
  },
};

/** A busy day on a record streak. */
export const Record: Story = {
  args: {
    today: {
      answers: 64,
      introduced: 10,
      recall: { reviews: 54, recalled: 50 },
      streak: 12,
      longestStreak: 12,
      week: { answers: 120, previous: 150 },
    },
  },
};

/** Nothing left to study today: the strip turns gold. */
export const AllDone: Story = { args: { left: 0 } };

/** A session just left the day done: the burst, the shimmer and the stars. */
export const JustDone: Story = { args: { left: 0, celebrate: true } };
