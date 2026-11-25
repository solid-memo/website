// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { allTimeReport } from "../../test/stories/statistics";
import { HourChart } from "./HourChart";

/** No answers in any hour. */
const noHours = Array.from({ length: 24 }, () => 0);

const meta = {
  title: "Statistics/Charts/HourChart",
  component: HourChart,
  args: { hours: allTimeReport.hours, dayBoundaryHour: allTimeReport.dayBoundaryHour },
  parameters: { controls: { exclude: ["hours"] } },
  // Unfolded, as a reader unfolds it.
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText("Show when in the day you study"));
  },
} satisfies Meta<typeof HourChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Answers spread over the day, from the hour the study day begins. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText("Show when in the day you study"));
    await expect(canvasElement.querySelector(".chart-fold")).toHaveAttribute("open");
  },
};

/** A study day that begins at midnight. */
export const FromMidnight: Story = { args: { dayBoundaryHour: 0 } };

/** No answers in any hour. */
export const Empty: Story = { args: { hours: noHours } };

/** Every answer in one hour. */
export const OneHour: Story = { args: { hours: noHours.map((_, hour) => (hour === 7 ? 9 : 0)) } };

/** Tens of thousands of answers an hour. */
export const LargeValues: Story = {
  args: { hours: noHours.map((_, hour) => 1000 * ((hour * 7) % 24) ** 2) },
};
