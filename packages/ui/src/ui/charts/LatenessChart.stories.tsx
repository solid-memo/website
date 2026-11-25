// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { allTimeReport } from "../../test/stories/statistics";
import { LatenessChart } from "./LatenessChart";

/** The latenesses with no reviews. */
const none = allTimeReport.lateness.map(({ lateness }) => ({
  lateness,
  recall: { reviews: 0, recalled: 0 },
}));

const meta = {
  title: "Statistics/Charts/LatenessChart",
  component: LatenessChart,
  args: { lateness: allTimeReport.lateness },
  parameters: { controls: { exclude: ["lateness"] } },
} satisfies Meta<typeof LatenessChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Reviews on time and late, the two side by side under the chart; clicking a bar says its share. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector('g[data-bar="late7"] rect.bar-hit')!);
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(/%/);
    await expect(
      within(canvasElement).getByText(/on time/i, { selector: "p" }),
    ).toBeInTheDocument();
  },
};

/** No reviews yet. */
export const Empty: Story = { args: { lateness: none } };

/** Only reviews on time: nothing to set them beside. */
export const OnTimeOnly: Story = {
  args: {
    lateness: none.map((one) =>
      one.lateness === "onTime" ? { ...one, recall: { reviews: 1, recalled: 1 } } : one,
    ),
  },
};

/** Hundreds of thousands of reviews. */
export const LargeValues: Story = {
  args: {
    lateness: none.map((one, i) => ({
      ...one,
      recall: { reviews: 400_000 - i * 50_000, recalled: 380_000 - i * 60_000 },
    })),
  },
};
