// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, within } from "storybook/test";
import { storyDecks } from "../test/storyData";
import { allTimeReport, koreanReport } from "../test/stories/statistics";
import { ByDeckStatistics } from "./ByDeckStatistics";

const meta = {
  title: "Statistics/ByDeckStatistics",
  component: ByDeckStatistics,
  args: {
    decks: storyDecks,
    statistics: allTimeReport.decks,
    others: allTimeReport.otherDecks,
  },
  parameters: { controls: { exclude: ["decks", "statistics", "others"] } },
} satisfies Meta<typeof ByDeckStatistics>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every deck answered in: the kanji, the Korean words reviewed both ways,
 * the Arabic deck studied only in a course, and a deck since removed.
 */
export const Decks: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "A removed deck" })).toBeInTheDocument();
    await expect(canvas.getAllByRole("listitem")).toHaveLength(allTimeReport.decks.length);
  },
};

/** One deck, its title long enough to wrap, recall each way. */
export const LongTitle: Story = {
  args: {
    statistics: [{ ...koreanReport.decks[0]!, deckUrl: storyDecks[3]!.url }],
  },
};

/** More decks answered in than the figures list: the rest in one total. */
export const OtherDecks: Story = { args: { others: { decks: 14, answers: 2380 } } };

/** No deck answered in. */
export const Empty: Story = { args: { statistics: [] } };
