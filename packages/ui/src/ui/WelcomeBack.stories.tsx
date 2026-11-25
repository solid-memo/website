// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { WelcomeBack } from "./WelcomeBack";

const meta = {
  title: "Decks/WelcomeBack",
  component: WelcomeBack,
  args: {
    welcome: { streak: 5, longestStreak: 9, dayNumber: 20 },
    left: 7,
    minutesLeft: 3,
  },
} satisfies Meta<typeof WelcomeBack>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A streak to keep, with the cards left today and their time. */
export const Streak: Story = {};

/** One more day ties the record. */
export const TieRecord: Story = {
  args: { welcome: { streak: 8, longestStreak: 9, dayNumber: 21 } },
};

/** Studying today sets a new record. */
export const NewRecord: Story = {
  args: { welcome: { streak: 9, longestStreak: 9, dayNumber: 22 } },
};

/** The streak has lapsed: a gentle note to start a new one. */
export const Lapsed: Story = {
  args: { welcome: { streak: 0, longestStreak: 9, dayNumber: 23 } },
};

/** The cards left are not known yet: the welcome alone. */
export const CountsUnknown: Story = { args: { left: undefined, minutesLeft: undefined } };

/** Cards left are known, their time not yet. */
export const TimeUnknown: Story = { args: { minutesLeft: undefined } };
