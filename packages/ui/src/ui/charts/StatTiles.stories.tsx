// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, within } from "storybook/test";
import { allTimeReport } from "../../test/stories/statistics";
import {
  CoverageNote,
  FirstTryTile,
  PeriodTiles,
  QuizTile,
  RecallTile,
  StatTile,
  TimeToMatureTile,
} from "./StatTiles";

/** No reviews. */
const noRecall = { reviews: 0, recalled: 0 };

const meta = {
  title: "Statistics/Charts/StatTiles",
  component: StatTile,
  args: { label: "Answers", value: "3,162", detail: "Since March" },
} satisfies Meta<typeof StatTile>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A headline number with what it counts, named by its label. */
export const Tile: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("group", { name: "Answers" })).toHaveTextContent(
      "3,162",
    );
  },
};

/** A tile without a detail, its label long enough to wrap. */
export const LongLabel: Story = {
  args: {
    label: "Cards introduced and grown mature in every deck of this instance since it was made",
    value: "1,048,576",
    detail: undefined,
  },
};

/** Recall of young and mature reviews, then the tiles while there are none: dashes. */
export const Recall: Story = {
  render: () => (
    <div class="stat-tiles">
      <RecallTile label="Young cards" recall={allTimeReport.retention.young} />
      <RecallTile label="Mature cards" recall={allTimeReport.retention.mature} />
      <RecallTile label="Mature cards" recall={noRecall} />
    </div>
  ),
};

/** Course questions answered, first tries and the time cards took to grow mature; each also with none. */
export const Progress: Story = {
  render: () => (
    <div class="stat-tiles">
      <QuizTile quiz={{ answers: 20, right: 15 }} />
      <FirstTryTile firstTry={allTimeReport.firstTry} />
      <FirstTryTile firstTry={{ introduced: 0, recalled: 0 }} />
      <TimeToMatureTile time={allTimeReport.timeToMature} />
      <TimeToMatureTile time={{ prompts: 0, days: null, reviews: null }} />
    </div>
  ),
};

/** This week and this month so far, each beside the same days before. */
export const Periods: Story = {
  render: () => (
    <>
      <PeriodTiles period="week" figures={allTimeReport.week} />
      <PeriodTiles period="month" figures={allTimeReport.month} />
    </>
  ),
};

/** Where the figures begin, when the log begins inside the range. */
export const Coverage: Story = {
  render: () => (
    <>
      <CoverageNote coverage="2026-03" />
      <CoverageNote coverage={null} />
    </>
  ),
};
