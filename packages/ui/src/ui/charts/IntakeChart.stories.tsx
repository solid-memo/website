// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent } from "storybook/test";
import { allTimeReport, STORY_TODAY } from "../../test/stories/statistics";
import { IntakeChart } from "./IntakeChart";

const meta = {
  title: "Statistics/Charts/IntakeChart",
  component: IntakeChart,
  args: { weeks: allTimeReport.intake },
  parameters: { controls: { exclude: ["weeks"] } },
} satisfies Meta<typeof IntakeChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** New cards beside reviews, week by week, two weeks away in July; clicking a week says what it held. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      canvasElement.querySelector(`g[data-bar="${STORY_TODAY}"] rect.bar-hit`)!,
    );
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(
      /^Week of September 21, 2026: \d+ new/,
    );
  },
};

/** No weeks at all. */
export const Empty: Story = { args: { weeks: [] } };

/** This week alone. */
export const OneWeek: Story = {
  args: { weeks: [{ week: STORY_TODAY, introduced: 5, reviews: 12 }] },
};

/** Thousands of new cards and reviews a week. */
export const LargeValues: Story = {
  args: {
    weeks: allTimeReport.intake.map((week, i) => ({
      week: week.week,
      introduced: 1500 + i * 120,
      reviews: 9000 + i * 2100,
    })),
  },
};
