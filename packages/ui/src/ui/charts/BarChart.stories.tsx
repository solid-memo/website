// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { BarChart, type Bar } from "./BarChart";

/** A week of answers, a bar a day. */
const week: Bar[] = [12, 30, 0, 18, 44, 7, 25].map((answers, i) => ({
  key: `day-${i}`,
  values: [answers],
  text: `Day ${i + 1}: ${answers} answers.`,
}));

const meta = {
  title: "Statistics/Charts/BarChart",
  component: BarChart,
  args: {
    caption: "Answers, the last 7 days",
    label: "Answers on each of the last 7 days",
    bars: week,
    prompt: "Point at a bar (or use the arrow keys) to see what it holds.",
    children: null,
  },
  parameters: { controls: { exclude: ["children"] } },
} satisfies Meta<typeof BarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Bars of one series, each named under it; the arrow keys step along them. */
export const OneSeries: Story = {
  args: { ticks: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] },
  play: async ({ canvasElement }) => {
    const chart = within(canvasElement).getByRole("img", { name: meta.args.label });
    chart.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(
      "Day 2: 30 answers.",
    );
  },
};

/** Stacked bars of three series, a legend naming them, and a table under the chart. */
export const Stacked: Story = {
  args: {
    bars: week.map((bar, i) => ({ ...bar, values: [bar.values[0]!, i % 3, i % 2] })),
    series: [
      { label: "Remembered", step: 4 },
      { label: "New", step: 3 },
      { label: "Lapses", step: 2 },
    ],
  },
  render: (args) => (
    <BarChart {...args}>
      <p class="chart-note hint">A table of the same figures would follow here.</p>
    </BarChart>
  ),
};

/** Pairs of bars side by side; clicking a bar says what it holds. */
export const Grouped: Story = {
  args: {
    bars: week.map((bar) => ({ ...bar, values: [bar.values[0]!, 20] })),
    series: [
      { label: "Due", step: 2 },
      { label: "Within your limit", step: 4 },
    ],
    grouped: true,
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector('g[data-bar="day-4"] rect.bar-hit')!);
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(
      "Day 5: 44 answers.",
    );
  },
};

/** Shares in percent, on a scale up to 100 rather than up to the largest bar. */
export const Shares: Story = {
  args: {
    bars: [92, 88, 75, 0, 60].map((share, i) => ({
      key: String(i),
      values: [share],
      text: `${share}%`,
    })),
    max: 100,
  },
};

/** One bar alone, as wide as the chart. */
export const OneBar: Story = {
  args: { bars: [{ key: "only", values: [3], text: "Today: 3 answers." }] },
};

/** No bars at all: the baseline and the prompt. */
export const Empty: Story = { args: { bars: [] } };

/** Bars of thousands, one far above the rest. */
export const LargeValues: Story = {
  args: {
    bars: [1200, 48_000, 3400, 250_000, 9800].map((answers, i) => ({
      key: String(i),
      values: [answers],
      text: `${answers} answers`,
    })),
  },
};
