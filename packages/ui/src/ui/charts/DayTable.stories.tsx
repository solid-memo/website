// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { allTimeReport, busyDays, storyDay, STORY_TODAY } from "../../test/stories/statistics";
import { DayTable } from "./DayTable";

const meta = {
  title: "Statistics/Charts/DayTable",
  component: DayTable,
  args: { days: allTimeReport.recentDays.slice(-14) },
  parameters: { controls: { exclude: ["days"] } },
  // The table opened, as a reader opens it.
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText("Show as a table"));
  },
} satisfies Meta<typeof DayTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two weeks of study days, newest first. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Show as a table"));
    await expect(canvas.getAllByRole("row")).toHaveLength(1 + meta.args.days.length);
  },
};

/** No study day: the table has only its header. */
export const Empty: Story = { args: { days: [] } };

/** One study day. */
export const OneDay: Story = { args: { days: [storyDay(STORY_TODAY, 12, 3, 1, 2)] } };

/** Days of thousands of answers. */
export const LargeValues: Story = { args: { days: busyDays } };
