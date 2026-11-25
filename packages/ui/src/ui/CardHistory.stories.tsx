// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, within } from "storybook/test";
import { CardHistory } from "./CardHistory";
import { kanjiDeck, koreanDeck } from "../test/storyData";
import { manyWaterAnswers, waterAnswers, waterCard, waterState } from "../test/stories/cards";

const meta = {
  title: "Cards/CardHistory",
  component: CardHistory,
  args: {
    deck: kanjiDeck,
    card: waterCard,
    answers: waterAnswers,
    states: [waterState("front-to-back")],
    dayBoundaryHour: 4,
  },
  parameters: { controls: { exclude: ["deck", "card", "answers", "states"] } },
} satisfies Meta<typeof CardHistory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Where the card stands and its answers: first, repeat, reviews and course questions, one wrong option named. */
export const Answers: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("table", { name: "Answers to this card" }),
    ).toBeInTheDocument();
  },
};

/** A card not studied yet. */
export const NotStudied: Story = { args: { answers: [], states: [] } };

/** A card studied both ways: its standing in each, and a Direction column. */
export const BothWays: Story = {
  args: {
    deck: koreanDeck,
    states: [
      waterState("front-to-back"),
      waterState("back-to-front", { intervalDays: 40, due: "2026-10-31" }),
    ],
  },
};

/** More answers than are listed: only the newest, saying so. */
export const ManyAnswers: Story = { args: { answers: manyWaterAnswers } };
