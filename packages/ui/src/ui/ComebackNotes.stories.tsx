// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, within } from "storybook/test";
import { ComebackNotes } from "./ComebackNotes";
import { makeUseCasesFake } from "../test/useCasesFake";
import { arabicDeck, kanjiDeck, longTitleDeck, storyDeck, storyInstance } from "../test/storyData";

/** Decks that resumed from a pause two days ago. */
const resumed = [kanjiDeck, arabicDeck, longTitleDeck].map((deck) =>
  storyDeck(deck.id, deck.title, {
    pause: { pausedAt: "2026-09-01T10:00:00.000Z", resumesOn: "2026-10-01" },
  }),
);

const meta = {
  title: "Decks/ComebackNotes",
  component: ComebackNotes,
  args: {
    useCases: makeUseCasesFake({
      getComeback: fn(async () => ({ recall: 0.72, waiting: 38, days: 4 })),
    }),
    instanceUrl: storyInstance.url,
    decks: resumed,
    today: "2026-10-03",
  },
  parameters: { controls: { exclude: ["useCases", "decks"] } },
} satisfies Meta<typeof ComebackNotes>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A welcome back for each deck that resumed, one with a title long enough to wrap. */
export const Resumed: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("region", { name: "Welcome back" }),
    ).toBeInTheDocument();
  },
};

/** A deck whose review limit is 0: no count of days. */
export const NoReviewLimit: Story = {
  args: {
    decks: [resumed[0]!],
    useCases: makeUseCasesFake({
      getComeback: fn(async () => ({ recall: 0.5, waiting: 120, days: null })),
    }),
  },
};

/** The backlog is cleared: nothing is shown. */
export const BacklogCleared: Story = {
  args: { useCases: makeUseCasesFake({ getComeback: fn(async () => null) }) },
};
