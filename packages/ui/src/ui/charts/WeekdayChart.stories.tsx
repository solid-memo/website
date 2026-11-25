// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { allTimeReport } from "../../test/stories/statistics";
import { WeekdayChart } from "./WeekdayChart";

const meta = {
  title: "Statistics/Charts/WeekdayChart",
  component: WeekdayChart,
  args: { weekdays: allTimeReport.weekdays },
  parameters: { controls: { exclude: ["weekdays"] } },
} satisfies Meta<typeof WeekdayChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The answers of each weekday on average, Monday first; the arrow keys step to Monday. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    within(canvasElement).getByRole("img").focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(/^Monday: /);
  },
};

/** No weekday studied yet. */
export const Empty: Story = {
  args: {
    weekdays: allTimeReport.weekdays.map((weekday) => ({ ...weekday, answers: 0, studied: 0 })),
  },
};

/** One day of the range: a Monday, studied. */
export const OneDay: Story = {
  args: {
    weekdays: allTimeReport.weekdays.map((weekday) =>
      weekday.weekday === 0
        ? { weekday: 0, answers: 7, days: 1, studied: 1 }
        : { ...weekday, answers: 0, days: 0, studied: 0 },
    ),
  },
};

/** Thousands of answers a day on average. */
export const LargeValues: Story = {
  args: {
    weekdays: allTimeReport.weekdays.map((weekday) => ({
      ...weekday,
      answers: weekday.days * (2000 + weekday.weekday * 750),
    })),
  },
};
