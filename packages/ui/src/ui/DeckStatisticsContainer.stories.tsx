// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { arabicDeck, kanjiDeck, koreanDeck, storyInstance } from "../test/storyData";
import { makeUseCasesFake } from "../test/useCasesFake";
import {
  arabicProgress,
  courseOnlyReport,
  easyProgress,
  emptyRangeReport,
  kanjiProgress,
  kanjiReport,
  koreanReport,
  STORY_TODAY,
} from "../test/stories/statistics";
import { DeckStatisticsContainer } from "./DeckStatisticsContainer";

const meta = {
  title: "Statistics/DeckStatisticsContainer",
  component: DeckStatisticsContainer,
  args: {
    useCases: makeUseCasesFake({
      getStatistics: fn(async () => kanjiReport),
      getCardProgress: fn(async () => ({ today: STORY_TODAY, decks: [kanjiProgress] })),
    }),
    instance: storyInstance,
    deck: kanjiDeck,
  },
  parameters: { controls: { exclude: ["useCases", "instance", "deck"] } },
} satisfies Meta<typeof DeckStatisticsContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck studied a while: recall, first tries, course questions, its cards and what is hard. */
export const Studied: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("link", { name: "More statistics" }),
    ).toBeInTheDocument();
  },
};

/** A deck reviewed both ways: recall each way. */
export const BothWays: Story = {
  args: {
    deck: koreanDeck,
    useCases: makeUseCasesFake({
      getStatistics: fn(async () => koreanReport),
      getCardProgress: fn(async () => ({ today: STORY_TODAY, decks: [easyProgress] })),
    }),
  },
};

/** A deck studied only in a course's chapters: only how its questions were answered. */
export const CourseOnly: Story = {
  args: {
    deck: arabicDeck,
    useCases: makeUseCasesFake({
      getStatistics: fn(async () => courseOnlyReport),
      getCardProgress: fn(async () => ({ today: STORY_TODAY, decks: [arabicProgress] })),
    }),
  },
};

/** No answers in the range: only the link to more, and the cards all new. */
export const NoAnswers: Story = {
  args: { useCases: makeUseCasesFake({ getStatistics: fn(async () => emptyRangeReport) }) },
};

/** The figures on their way. */
export const Loading: Story = {
  args: {
    useCases: makeUseCasesFake({
      getStatistics: fn(() => new Promise<never>(() => {})),
      getCardProgress: fn(() => new Promise<never>(() => {})),
    }),
  },
};

/** Nothing could be read: the deck's statistics are left out, its cards' progress says so. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      getStatistics: fn(async () => {
        throw new AppError("storageInaccessible");
      }),
      getCardProgress: fn(async () => {
        throw new AppError("storageInaccessible");
      }),
    }),
  },
};
