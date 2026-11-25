// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { shiftStudyDay } from "@solid-memo/domain/answer";
import type { StudyTime } from "@solid-memo/domain/studyTime";
import { expect, userEvent } from "storybook/test";
import { allTimeReport, STORY_TODAY } from "../../test/stories/statistics";
import { StudyTimeChart, StudyTimeHint, StudyTimeTiles } from "./StudyTimeChart";

/** The study time of the story's answers. */
const time = allTimeReport.studyTime;

/** No time known: the answers were course answers, before times were recorded. */
const noTime: StudyTime = {
  answers: 4,
  sessions: 1,
  ms: 0,
  medianAnswerMs: null,
  days: [{ studyDay: STORY_TODAY, answers: 4, sessions: 1, ms: 0 }],
  recorded: null,
};

const meta = {
  title: "Statistics/Charts/StudyTimeChart",
  component: StudyTimeChart,
  args: { time, today: STORY_TODAY },
  parameters: { controls: { exclude: ["time"] } },
} satisfies Meta<typeof StudyTimeChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** About how long each of the last 30 days took; clicking today says how long, in how many sessions. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      canvasElement.querySelector(`g[data-bar="${STORY_TODAY}"] rect.bar-hit`)!,
    );
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(
      /^September 21, 2026: about \d+ (seconds|minutes?) in 1 session\.$/,
    );
  },
};

/** A day that only carries on a session begun the day before, and a day of hours. */
export const ContinuedAndLong: Story = {
  args: {
    time: {
      ...time,
      days: [
        {
          studyDay: shiftStudyDay(STORY_TODAY, -1),
          answers: 900,
          sessions: 3,
          ms: 4.5 * 3_600_000,
        },
        { studyDay: STORY_TODAY, answers: 3, sessions: 0, ms: 40_000 },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      canvasElement.querySelector(`g[data-bar="${STORY_TODAY}"] rect.bar-hit`)!,
    );
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(
      /carrying on a session/,
    );
  },
};

/** No day with time. */
export const Empty: Story = { args: { time: { ...time, days: [] } } };

/** Months of time on each day: bars of thousands of minutes. */
export const LargeValues: Story = {
  args: {
    time: {
      ...time,
      days: Array.from({ length: 30 }, (_, i) => ({
        studyDay: shiftStudyDay(STORY_TODAY, i - 29),
        answers: 20_000,
        sessions: 40,
        ms: (10 + i) * 3_600_000,
      })),
    },
  },
};

/** The tiles over the chart: time studied, sessions and time an answer took; then with no time known. */
export const Tiles: Story = {
  render: () => (
    <>
      <StudyTimeTiles time={time} />
      <StudyTimeTiles time={noTime} />
    </>
  ),
};

/** The hints: since when times are recorded, with answers left out for lacking one; then before any is. */
export const Hints: Story = {
  render: () => (
    <>
      <StudyTimeHint
        time={{ ...time, recorded: { since: "2026-06-01", answers: 1700, ms: 1, unknown: 12 } }}
      />
      <StudyTimeHint time={time} />
      <StudyTimeHint time={noTime} />
    </>
  ),
};
