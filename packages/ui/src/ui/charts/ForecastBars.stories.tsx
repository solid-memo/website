// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { shiftStudyDay } from "@solid-memo/domain/answer";
import { expect, userEvent, within } from "storybook/test";
import { STORY_TODAY } from "../../test/stories/statistics";
import { ForecastBars } from "./ForecastBars";

/** The days of a forecast from today, with what falls due and what the cap lets through. */
const forecastOf = (due: readonly number[], cap: number) =>
  due.map((count, i) => ({
    studyDay: shiftStudyDay(STORY_TODAY, i),
    due: count,
    reviews: Math.min(count, cap),
  }));

const meta = {
  title: "Statistics/Charts/ForecastBars",
  component: ForecastBars,
  args: { forecast: forecastOf([14, 6, 9, 0, 12, 3, 7, 5, 0, 11, 4, 8, 2, 6], 10) },
  parameters: { controls: { exclude: ["forecast"] } },
} satisfies Meta<typeof ForecastBars>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two weeks ahead, today's backlog over the daily cap; clicking today says so. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      canvasElement.querySelector(`g[data-bar="${STORY_TODAY}"] rect.bar-hit`)!,
    );
    await expect(
      within(canvasElement).getByText(/today: 14 reviews due, overdue ones included, 10 within/),
    ).toBeInTheDocument();
  },
};

/** Nothing due on any day: the table says so. */
export const NothingDue: Story = {
  args: { forecast: forecastOf([0, 0, 0, 0, 0, 0, 0], 10) },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText("Show as a table"));
  },
};

/** No days at all. */
export const Empty: Story = { args: { forecast: [] } };

/** Today alone. */
export const OneDay: Story = { args: { forecast: forecastOf([4], 10) } };

/** A backlog of thousands, the cap letting a few hundred through a day. */
export const LargeValues: Story = {
  args: { forecast: forecastOf([4800, 320, 410, 290, 350, 300, 280], 400) },
};
