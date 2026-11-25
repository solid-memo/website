// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { allTimeReport, STORY_TODAY } from "../../test/stories/statistics";
import { MaturityOverTimeChart } from "./MaturityOverTimeChart";

const meta = {
  title: "Statistics/Charts/MaturityOverTimeChart",
  component: MaturityOverTimeChart,
  args: { weeks: allTimeReport.memory },
  parameters: { controls: { exclude: ["weeks"] } },
} satisfies Meta<typeof MaturityOverTimeChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Young cards giving way to mature ones over half a year; the End key points at this week. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    const chart = within(canvasElement).getByRole("img", { name: /young|mature/i });
    chart.focus();
    await userEvent.keyboard("{End}");
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(
      /^Week of September 21, 2026: /,
    );
  },
};

/** This week alone. */
export const OneWeek: Story = {
  args: { weeks: [{ week: STORY_TODAY, relearning: 0, young: 5, mature: 0, medianInterval: 1 }] },
};

/** Hundreds of thousands of cards. */
export const LargeValues: Story = {
  args: {
    weeks: allTimeReport.memory.map((week, i) => ({
      ...week,
      young: 120_000 - i * 2000,
      mature: i * 15_000,
      relearning: 900,
    })),
  },
};
