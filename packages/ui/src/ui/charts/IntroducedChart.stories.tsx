// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { shiftStudyDay } from "@solid-memo/domain/answer";
import { expect, userEvent, within } from "storybook/test";
import { allTimeReport, busyDays, storyDay, STORY_TODAY } from "../../test/stories/statistics";
import { IntroducedChart } from "./IntroducedChart";

const meta = {
  title: "Statistics/Charts/IntroducedChart",
  component: IntroducedChart,
  args: { days: allTimeReport.days, today: STORY_TODAY },
  parameters: { controls: { exclude: ["days"] } },
} satisfies Meta<typeof IntroducedChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Half a year's running total of cards introduced; the End key points at today. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    const chart = within(canvasElement).getByRole("img");
    chart.focus();
    await userEvent.keyboard("{End}");
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(
      /^September 21, 2026: \d+ introduced in all\.$/,
    );
  },
};

/** One day with answers: today's. */
export const OneDay: Story = { args: { days: [storyDay(STORY_TODAY, 8, 8, 0)] } };

/** Answers on a day after today, as a later day boundary can leave them: the line runs on to it. */
export const AfterToday: Story = {
  args: {
    days: [
      storyDay(shiftStudyDay(STORY_TODAY, -3), 10, 10, 0),
      storyDay(shiftStudyDay(STORY_TODAY, 1), 4, 4, 0),
    ],
  },
};

/** Thousands of cards introduced. */
export const LargeValues: Story = { args: { days: busyDays } };
