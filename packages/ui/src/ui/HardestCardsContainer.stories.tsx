// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { kanjiDeck, storyInstance } from "../test/storyData";
import { makeUseCasesFake } from "../test/useCasesFake";
import {
  arabicProgress,
  easyProgress,
  kanjiProgress,
  longProgress,
  STORY_TODAY,
} from "../test/stories/statistics";
import { HardestCardsContainer } from "./HardestCardsContainer";

const meta = {
  title: "Statistics/HardestCardsContainer",
  component: HardestCardsContainer,
  args: {
    useCases: makeUseCasesFake({
      getCardProgress: fn(async () => ({
        today: STORY_TODAY,
        decks: [kanjiProgress, arabicProgress, longProgress, easyProgress],
      })),
    }),
    instance: storyInstance,
  },
  parameters: { controls: { exclude: ["useCases", "instance", "deck"] } },
} satisfies Meta<typeof HardestCardsContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every deck's: the leeches of them all. */
export const AllDecks: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("heading", { name: "What is hard" }),
    ).toBeInTheDocument();
  },
};

/** One deck's: its hardest cards and the wrong options chosen in its course questions. */
export const OneDeck: Story = {
  args: {
    deck: kanjiDeck,
    useCases: makeUseCasesFake({
      getCardProgress: fn(async () => ({ today: STORY_TODAY, decks: [kanjiProgress] })),
    }),
  },
};

/** Nothing reviewed yet: nothing is shown. */
export const NothingYet: Story = { args: { useCases: makeUseCasesFake() } };

/** The progress on its way: nothing is shown (the cards' progress says it is loading). */
export const Loading: Story = {
  args: {
    useCases: makeUseCasesFake({ getCardProgress: fn(() => new Promise<never>(() => {})) }),
  },
};

/** The progress couldn't be read: nothing is shown (the cards' progress says so). */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      getCardProgress: fn(async () => {
        throw new AppError("storageInaccessible");
      }),
    }),
  },
};
