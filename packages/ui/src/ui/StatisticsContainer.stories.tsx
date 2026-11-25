// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { koreanDeck, storyDecks, storyInstance } from "../test/storyData";
import { makeUseCasesFake } from "../test/useCasesFake";
import {
  allTimeReport,
  arabicProgress,
  easyProgress,
  emptyLogReport,
  emptyRangeReport,
  kanjiProgress,
  koreanReport,
  recentReport,
  STORY_TODAY,
} from "../test/stories/statistics";
import type { StatisticsChange } from "./StatisticsScreen";
import { StatisticsContainer } from "./StatisticsContainer";

/** Where every deck's cards stand. */
const progress = { today: STORY_TODAY, decks: [kanjiProgress, arabicProgress, easyProgress] };

const meta = {
  title: "Statistics/StatisticsContainer",
  component: StatisticsContainer,
  args: {
    useCases: makeUseCasesFake({
      getStatistics: fn(async () => allTimeReport),
      getCardProgress: fn(async () => progress),
    }),
    instance: storyInstance,
    decks: storyDecks,
    range: "all",
    view: "overview",
    hrefOf: fn((change: StatisticsChange) => `#/statistics?view=${change.view}`),
    onChange: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "instance", "decks", "deck"] } },
} satisfies Meta<typeof StatisticsContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every deck's overview of the whole log; the answers download as a file. */
export const Overview: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Download my answers (CSV)" }));
    await expect(args.useCases.saveAnswers).toHaveBeenCalled();
  },
};

/** The answers couldn't be saved: the error under the button. */
export const DownloadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      getStatistics: fn(async () => allTimeReport),
      getCardProgress: fn(async () => progress),
      saveAnswers: fn(async () => {
        throw new AppError("storageInaccessible");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Download my answers (CSV)" }));
    await expect(await canvas.findByRole("alert")).toBeInTheDocument();
  },
};

/** The activity tab of the last 30 days. */
export const Activity: Story = {
  args: {
    range: "30d",
    view: "activity",
    useCases: makeUseCasesFake({
      getStatistics: fn(async () => recentReport),
      getCardProgress: fn(async () => progress),
    }),
  },
};

/** The memory tab, with what is hard: the leeches of every deck. */
export const Memory: Story = {
  args: { view: "memory" },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("heading", { name: "What is hard" }),
    ).toBeInTheDocument();
  },
};

/** The cards' tab: where the cards stand, and how the courses have gone. */
export const Cards: Story = { args: { view: "cards" } };

/** One deck's memory tab, its reviews both ways. */
export const OneDeck: Story = {
  args: {
    deck: koreanDeck,
    range: "90d",
    view: "memory",
    useCases: makeUseCasesFake({
      getStatistics: fn(async () => koreanReport),
      getCardProgress: fn(async () => ({ today: STORY_TODAY, decks: [easyProgress] })),
    }),
  },
};

/** A range without answers in a log with some: a longer range may have them. */
export const EmptyRange: Story = {
  args: {
    range: "30d",
    useCases: makeUseCasesFake({ getStatistics: fn(async () => emptyRangeReport) }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/^No answers in this range/),
    ).toBeInTheDocument();
  },
};

/** No answers at all yet. */
export const NoAnswers: Story = {
  args: {
    range: "30d",
    useCases: makeUseCasesFake({ getStatistics: fn(async () => emptyLogReport) }),
  },
};

/** The answers on their way. */
export const Loading: Story = {
  args: {
    useCases: makeUseCasesFake({ getStatistics: fn(() => new Promise<never>(() => {})) }),
  },
};

/** The answers couldn't be read. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      getStatistics: fn(async () => {
        throw new AppError("storageInaccessible");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("alert")).toBeInTheDocument();
  },
};
