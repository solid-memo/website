// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { allTimeReport } from "../../test/stories/statistics";
import { GradeBars } from "./GradeBars";

/** No answers of a kind. */
const none = { again: 0, hard: 0, good: 0, easy: 0 };

const meta = {
  title: "Statistics/Charts/GradeBars",
  component: GradeBars,
  args: { buttons: allTimeReport.buttons },
  parameters: { controls: { exclude: ["buttons"] } },
} satisfies Meta<typeof GradeBars>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The buttons pressed for first answers, young and mature reviews; the arrow keys step along a bar. */
export const Typical: Story = {
  play: async ({ canvasElement }) => {
    const [first] = within(canvasElement).getAllByRole("img");
    first!.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvasElement.querySelector(".chart-inspector")).toHaveTextContent(
      /^First answers: Again on \d+ answers/,
    );
  },
};

/** No answers yet: three empty bars. */
export const Empty: Story = {
  args: { buttons: { introductions: none, young: none, mature: none } },
};

/** Only first answers, and only one button pressed for them. */
export const OneButton: Story = {
  args: { buttons: { introductions: { ...none, good: 1 }, young: none, mature: none } },
};

/** Hundreds of thousands of answers, a button rarely pressed among them. */
export const LargeValues: Story = {
  args: {
    buttons: {
      introductions: { again: 12_000, hard: 30_000, good: 140_000, easy: 25_000 },
      young: { again: 40_000, hard: 61_000, good: 480_000, easy: 9 },
      mature: { again: 3, hard: 15_000, good: 220_000, easy: 31_000 },
    },
  },
};
