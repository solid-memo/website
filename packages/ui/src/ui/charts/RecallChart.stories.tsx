// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { allTimeReport, recentReport } from "../../test/stories/statistics";
import { RecallChart } from "./RecallChart";

const meta = {
  title: "Statistics/Charts/RecallChart",
  component: RecallChart,
  parameters: { controls: { exclude: ["months", "weeks"] } },
} satisfies Meta<typeof RecallChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Recall month by month, young dashed and mature solid; the End key points at this month. */
export const ByMonth: Story = {
  args: { months: allTimeReport.months },
  play: async ({ canvasElement }) => {
    const chart = within(canvasElement).getByRole("img");
    chart.focus();
    await userEvent.keyboard("{End}");
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(
      /^September 2026: young cards /,
    );
  },
};

/** Recall week by week, as a short range shows it. */
export const ByWeek: Story = { args: { weeks: recentReport.weeks } };

/** One month alone, its first tries none: a dash in the table. */
export const OneMonth: Story = {
  args: {
    months: [
      {
        month: "2026-09",
        retention: { young: { reviews: 1, recalled: 1 }, mature: { reviews: 0, recalled: 0 } },
        firstTry: { introduced: 0, recalled: 0 },
      },
    ],
  },
};

/** Months without reviews between: gaps in both lines. */
export const WithGaps: Story = {
  args: { months: [allTimeReport.months[0]!, allTimeReport.months.at(-1)!] },
};

/** Hundreds of thousands of reviews a month. */
export const LargeValues: Story = {
  args: {
    months: allTimeReport.months.map((month, i) => ({
      ...month,
      retention: {
        young: { reviews: 300_000, recalled: 240_000 + i * 5000 },
        mature: { reviews: 900_000, recalled: 850_000 },
      },
      firstTry: { introduced: 40_000, recalled: 31_000 },
    })),
  },
};
