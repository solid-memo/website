// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { LineChart, type LineSeries } from "./LineChart";

/** Ten weeks, a key each. */
const weeks = Array.from({ length: 10 }, (_, i) => `week-${i + 1}`);

/** Two lines of shares, the young one with a gap and a lone point. */
const shares: LineSeries[] = [
  { name: "young", label: "Young", values: [80, 85, null, 78, null, 90, 88, 92, 87, 91] },
  { name: "mature", label: "Mature", values: [null, null, 95, 93, 96, 94, 97, 95, 96, 98] },
];

const meta = {
  title: "Statistics/Charts/LineChart",
  component: LineChart,
  args: {
    name: "recall-chart",
    caption: "Recall by week",
    label: "How well reviews were remembered, week by week",
    note: "A week without reviews of a kind is a gap in its line.",
    keys: weeks,
    series: shares,
    max: 100,
    formatValue: fn((value: number) => `${value}%`),
    formatKey: fn((key: string) => key.replace("-", " ")),
    textAt: fn((index: number) => `Week ${index + 1}`),
    prompt: "Point at a week (or use the arrow keys) to see how it went.",
    table: null,
  },
  parameters: { controls: { exclude: ["table"] } },
} satisfies Meta<typeof LineChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two lines with gaps, a legend naming them; the arrow keys step along the points. */
export const TwoLines: Story = {
  play: async ({ canvasElement }) => {
    const chart = within(canvasElement).getByRole("img", { name: meta.args.label });
    chart.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent("Week 3");
    await expect(canvasElement.querySelector(".crosshair")).toBeInTheDocument();
  },
};

/** One line, with a table under it. */
export const OneLine: Story = {
  args: { series: [shares[1]!] },
  render: (args) => (
    <LineChart
      {...args}
      table={<p class="chart-note hint">A table of the same figures would follow here.</p>}
    />
  ),
};

/** One point alone, drawn as a dot in the middle. */
export const OnePoint: Story = {
  args: { keys: ["week-1"], series: [{ name: "young", label: "Young", values: [64] }] },
};

/** A running total in the hundreds of thousands. */
export const LargeValues: Story = {
  args: {
    name: "introduced-chart",
    series: [
      {
        name: "introduced",
        label: "Introduced",
        values: weeks.map((_, i) => 25_000 * (i + 1) ** 1.5),
      },
    ],
    max: 25_000 * 10 ** 1.5,
  },
};
