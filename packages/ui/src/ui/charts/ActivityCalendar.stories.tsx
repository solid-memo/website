// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { allTimeReport, busyDays, storyDay, STORY_TODAY } from "../../test/stories/statistics";
import { ActivityCalendar } from "./ActivityCalendar";

const meta = {
  title: "Statistics/Charts/ActivityCalendar",
  component: ActivityCalendar,
  args: { days: allTimeReport.recentDays, today: STORY_TODAY },
  parameters: { controls: { exclude: ["days"] } },
} satisfies Meta<typeof ActivityCalendar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Half a year of study in the last year's weeks, a day skipped now and then, two weeks away in July. */
export const Year: Story = {
  play: async ({ canvasElement }) => {
    const grid = within(canvasElement).getByRole("img", { name: /^Answers by day/ });
    grid.focus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(canvasElement.querySelector(`[data-day="${STORY_TODAY}"]`)).toHaveClass("pointed");
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(
      /^September 21, 2026: \d+ answers/,
    );
  },
};

/** The last four weeks only. */
export const FourWeeks: Story = { args: { weeks: 4 } };

/** Nothing studied yet: every day the lightest step. */
export const Empty: Story = { args: { days: [] } };

/** One day studied: today. */
export const OneDay: Story = { args: { days: [storyDay(STORY_TODAY, 5, 5, 0)] } };

/** Thousands of answers a day for a month. */
export const LargeValues: Story = { args: { days: busyDays } };
