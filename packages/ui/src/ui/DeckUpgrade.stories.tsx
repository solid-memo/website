// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { DeckUpgradeFailure, DeckUpgradeProgress } from "./DeckUpgrade";

/** What trying a failed upgrade again does, which a story checks. */
const onRetry = fn();

const meta = {
  title: "Decks/DeckUpgrade",
  component: DeckUpgradeProgress,
  args: { step: "read", done: 0 },
} satisfies Meta<typeof DeckUpgradeProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The upgrade has begun: reading the newer release. */
export const Reading: Story = {};

/** Partway through writing the cards. */
export const WritingCards: Story = {
  args: { step: "cards", done: 1, part: { done: 3, total: 8 } },
};

/** The last step: refreshing what is shown. */
export const Refreshing: Story = { args: { step: "refresh", done: 4 } };

/** The upgrade failed before anything was changed. */
export const FailedUnchanged: Story = {
  render: () => (
    <DeckUpgradeFailure
      outcome={{ ok: false, step: "read", error: new AppError("podNoAnswer"), changed: false }}
      onRetry={fn()}
      onDismiss={fn()}
    />
  ),
};

/** The upgrade failed partway: the deck has part of the newer release; trying again finishes it. */
export const FailedPartway: Story = {
  render: () => (
    <DeckUpgradeFailure
      outcome={{ ok: false, step: "reviews", error: new AppError("podNoAnswer"), changed: true }}
      onRetry={onRetry}
      onDismiss={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Try again" }));
    await expect(onRetry).toHaveBeenCalled();
  },
};
