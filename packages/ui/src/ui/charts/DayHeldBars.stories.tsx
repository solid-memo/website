// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { allTimeReport, busyDays, storyDay, STORY_TODAY } from "../../test/stories/statistics";
import { DayHeldBars } from "./DayHeldBars";

const meta = {
  title: "Statistics/Charts/DayHeldBars",
  component: DayHeldBars,
  args: { days: allTimeReport.recentDays, today: STORY_TODAY },
  parameters: { controls: { exclude: ["days"] } },
} satisfies Meta<typeof DayHeldBars>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The last 30 days, each bar stacked by what it held; clicking a day says what it held. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      canvasElement.querySelector(`g[data-bar="${STORY_TODAY}"] rect.bar-hit`)!,
    );
    await expect(
      within(canvasElement).getAllByText(/^September 21, 2026: \d+ answers/)[0],
    ).toBeInTheDocument();
  },
};

/** The last week only. */
export const OneWeek: Story = { args: { count: 7 } };

/** Nothing studied: no bars, an empty table. */
export const Empty: Story = { args: { days: [] } };

/** One day studied: today, with new cards, a lapse and repeats. */
export const OneDay: Story = { args: { days: [storyDay(STORY_TODAY, 20, 5, 2, 3)] } };

/** Thousands of answers a day. */
export const LargeValues: Story = { args: { days: busyDays } };
