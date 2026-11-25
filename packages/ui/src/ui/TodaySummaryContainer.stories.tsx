// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, within } from "storybook/test";
import type { Answer } from "@solid-memo/domain/answer";
import { TodaySummaryContainer } from "./TodaySummaryContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { todayFiguresFrom } from "../test/fakes/statistics";
import { kanjiDeck, koreanDeck, storyInstance } from "../test/storyData";

/** An answer on `studyDay`, `seconds` past ten. */
const answer = (studyDay: string, seconds = 0): Answer => ({
  id: `answer-${studyDay}-${seconds}`,
  deckUrl: kanjiDeck.url,
  cardUrl: `${kanjiDeck.cardsDocumentUrl}#water`,
  direction: "front-to-back",
  grade: 4,
  answeredAt: `${studyDay}T10:00:${String(seconds).padStart(2, "0")}.000Z`,
  studyDay,
  nextIntervalDays: 1,
});

/** Two answers today, twenty seconds apart, after a day's study yesterday. */
const studiedToday = [answer("2026-10-02"), answer("2026-10-03"), answer("2026-10-03", 20)];

/** A two-day streak through yesterday, an answer taking about twenty seconds. */
const studiedUntilYesterday = [
  answer("2026-10-01"),
  answer("2026-10-02"),
  answer("2026-10-02", 20),
];

const meta = {
  title: "Decks/TodaySummaryContainer",
  component: TodaySummaryContainer,
  args: {
    useCases: makeUseCasesFake({
      getTodayFigures: fn(async () => todayFiguresFrom(studiedToday, "2026-10-03")),
      getStudyCounts: fn(async () => ({ dueCount: 4, newCount: 2, learned: false })),
    }),
    instance: storyInstance,
    decks: [kanjiDeck, koreanDeck],
  },
  parameters: { controls: { exclude: ["useCases", "instance", "decks"] } },
} satisfies Meta<typeof TodaySummaryContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Today's study, with the cards left in every deck and their time. */
export const Today: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/12 left to study today · about 4 minutes to go/),
    ).toBeInTheDocument();
  },
};

/** A session just left nothing to study today in any deck: the day is celebrated. */
export const DayDone: Story = {
  args: {
    celebrate: true,
    useCases: makeUseCasesFake({
      getTodayFigures: fn(async () => todayFiguresFrom(studiedToday, "2026-10-03")),
      getStudyCounts: fn(async () => ({ dueCount: 0, newCount: 0, learned: false })),
    }),
  },
};

/** Before the day's first answer: a welcome back, with the streak to keep. */
export const WelcomeBack: Story = {
  args: {
    useCases: makeUseCasesFake({
      getTodayFigures: fn(async () => todayFiguresFrom(studiedUntilYesterday, "2026-10-03")),
      getStudyCounts: fn(async () => ({ dueCount: 4, newCount: 2, learned: false })),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("complementary", { name: "Your streak" }),
    ).toBeInTheDocument();
  },
};

/** No study day to come back to: nothing is shown. */
export const NeverStudied: Story = {
  args: {
    useCases: makeUseCasesFake({
      getTodayFigures: fn(async () => todayFiguresFrom([], "2026-10-03")),
    }),
  },
};
