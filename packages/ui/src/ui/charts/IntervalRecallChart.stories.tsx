// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent } from "storybook/test";
import { allTimeReport } from "../../test/stories/statistics";
import { IntervalRecallChart } from "./IntervalRecallChart";

const meta = {
  title: "Statistics/Charts/IntervalRecallChart",
  component: IntervalRecallChart,
  args: { bins: allTimeReport.intervals },
  parameters: { controls: { exclude: ["bins"] } },
} satisfies Meta<typeof IntervalRecallChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Recall at each span of intervals, the longest spans without reviews yet; clicking a span says its share. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector('g[data-bar="366"] rect.bar-hit')!);
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(
      "366 days or more: no reviews.",
    );
  },
};

/** No reviews at any span. */
export const Empty: Story = {
  args: {
    bins: allTimeReport.intervals.map(({ from, to }) => ({
      from,
      to,
      recall: { reviews: 0, recalled: 0 },
    })),
  },
};

/** One span alone, of one review. */
export const OneSpan: Story = {
  args: { bins: [{ from: 1, to: 2, recall: { reviews: 1, recalled: 1 } }] },
};

/** Hundreds of thousands of reviews at each span. */
export const LargeValues: Story = {
  args: {
    bins: allTimeReport.intervals.map(({ from, to }, i) => ({
      from,
      to,
      recall: { reviews: 250_000 + i, recalled: 200_000 - i * 9000 },
    })),
  },
};
