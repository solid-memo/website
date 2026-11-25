// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { allTimeReport, STORY_TODAY } from "../../test/stories/statistics";
import { MemorySpanChart } from "./MemorySpanChart";

const meta = {
  title: "Statistics/Charts/MemorySpanChart",
  component: MemorySpanChart,
  args: { weeks: allTimeReport.memory },
  parameters: { controls: { exclude: ["weeks"] } },
} satisfies Meta<typeof MemorySpanChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The median interval growing over half a year; the Home key points at the first week. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    const chart = within(canvasElement).getByRole("img", { name: /interval/i });
    chart.focus();
    await userEvent.keyboard("{Home}");
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(/^Week of /);
  },
};

/** Weeks before the first prompt: a gap, then the line. */
export const WithGap: Story = {
  args: {
    weeks: [
      { week: "2026-08-31", relearning: 0, young: 0, mature: 0, medianInterval: null },
      { week: "2026-09-07", relearning: 0, young: 0, mature: 0, medianInterval: null },
      ...allTimeReport.memory.slice(-2),
    ],
  },
};

/** This week alone. */
export const OneWeek: Story = {
  args: { weeks: [{ week: STORY_TODAY, relearning: 0, young: 5, mature: 0, medianInterval: 1 }] },
};

/** Intervals of years. */
export const LargeValues: Story = {
  args: {
    weeks: allTimeReport.memory.map((week, i) => ({ ...week, medianInterval: 40 + i * 120 })),
  },
};
