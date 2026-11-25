// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { CardProgressContainer } from "./CardProgressContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { deckProgressOf } from "../test/fakes/statistics";
import { kanjiDeck, storyInstance } from "../test/storyData";
import { progressReport } from "../test/stories/cards";

const meta = {
  title: "Cards/CardProgressContainer",
  component: CardProgressContainer,
  args: {
    useCases: makeUseCasesFake({ getCardProgress: fn(async () => progressReport) }),
    instance: storyInstance,
  },
  parameters: { controls: { exclude: ["useCases", "instance", "deck"] } },
} satisfies Meta<typeof CardProgressContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every deck's cards together, then each deck's maturity and when its new cards run out. */
export const AllDecks: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("group", { name: "Overdue" }),
    ).toHaveTextContent("2");
  },
};

/** One deck's cards, with when its new cards run out. */
export const OneDeck: Story = {
  args: {
    deck: kanjiDeck,
    useCases: makeUseCasesFake({
      getCardProgress: fn(async () => ({ ...progressReport, decks: [progressReport.decks[0]!] })),
    }),
  },
};

/** A backlog the caps don't let through within the forecast. */
export const NotCaughtUp: Story = {
  args: {
    useCases: makeUseCasesFake({
      getCardProgress: fn(async () => ({
        today: "2026-09-21",
        decks: [
          deckProgressOf(kanjiDeck, {
            progress: { new: 0, relearning: 2, young: 30, mature: 50 },
            forecast: [
              { studyDay: "2026-09-21", due: 80, reviews: 20 },
              { studyDay: "2026-09-22", due: 10, reviews: 20 },
            ],
            overdue: 60,
            daysToClear: null,
          }),
        ],
      })),
    }),
  },
};

/** A deck couldn't be read: the figures leave it out, and say so. */
export const DeckLeftOut: Story = {
  args: {
    useCases: makeUseCasesFake({
      getCardProgress: fn(async () => ({
        ...progressReport,
        leftOut: [new AppError("noCatalogToUpdate")],
      })),
    }),
  },
};

/** The progress on its way. */
export const Loading: Story = {
  args: { useCases: makeUseCasesFake({ getCardProgress: fn(() => new Promise<never>(() => {})) }) },
};

/** The progress couldn't be read: a quiet line says so. */
export const Unavailable: Story = {
  args: {
    useCases: makeUseCasesFake({
      getCardProgress: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
  },
};
