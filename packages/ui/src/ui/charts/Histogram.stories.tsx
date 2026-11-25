// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import type { Bin } from "@solid-memo/domain/scheduleInsight";
import { expect, fn, userEvent, within } from "storybook/test";
import { Histogram, SpreadCharts } from "./Histogram";

/** Bins of intervals in days, with how many prompts fall in each. */
const intervalBins = (counts: readonly number[]): Bin[] =>
  [1, 2, 4, 8, 15, 31, 91, 181, 366].map((from, i, all) => ({
    from,
    ...(i + 1 < all.length ? { to: all[i + 1]! } : {}),
    count: counts[i]!,
  }));

/** Bins of eases, a tenth wide beyond the first. */
const easeBins: Bin[] = [1.3, 1.5, 1.7, 1.9, 2.1, 2.3, 2.5, 2.7].map((from, i, all) => ({
  from,
  ...(i + 1 < all.length ? { to: all[i + 1]! } : {}),
  count: [2, 4, 9, 15, 31, 48, 120, 12][i]!,
}));

const meta = {
  title: "Statistics/Charts/Histogram",
  component: Histogram,
  args: {
    caption: "Intervals",
    label: "How many prompts have each interval",
    heading: "Interval",
    bins: intervalBins([12, 30, 44, 51, 40, 63, 20, 4, 0]),
    range: fn((bin: Bin) => (bin.to === undefined ? `${bin.from}+ days` : `${bin.from} days`)),
    note: "A prompt's interval grows with each review remembered.",
  },
  parameters: { controls: { exclude: ["bins"] } },
} satisfies Meta<typeof Histogram>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Intervals of a deck studied a few months; clicking a bin says how many prompts it holds. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector('g[data-bar="8"] rect.bar-hit')!);
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent("8 days: 51.");
  },
};

/** Every bin empty, and no note. */
export const Empty: Story = {
  args: { bins: intervalBins([0, 0, 0, 0, 0, 0, 0, 0, 0]), note: undefined },
};

/** One bin alone. */
export const OneBin: Story = { args: { bins: [{ from: 1, to: 2, count: 3 }] } };

/** Tens of thousands of prompts. */
export const LargeValues: Story = {
  args: { bins: intervalBins([1200, 3400, 8800, 15_000, 22_000, 41_000, 18_000, 6000, 900]) },
};

/** The intervals, then the eases folded away under them, in the app's words. */
export const Spread: Story = {
  render: () => (
    <SpreadCharts intervals={intervalBins([12, 30, 44, 51, 40, 63, 20, 4, 0])} eases={easeBins} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Show how easy cards feel"));
    await expect(canvasElement.querySelector(".chart-fold")).toHaveAttribute("open");
  },
};
