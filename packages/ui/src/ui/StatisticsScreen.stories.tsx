// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { StatisticsScreen, type StatisticsChange } from "./StatisticsScreen";

const meta = {
  title: "Statistics/StatisticsScreen",
  component: StatisticsScreen,
  args: {
    range: "90d",
    view: "overview",
    hrefOf: fn((change: StatisticsChange) => `#/statistics?view=${change.view}`),
    onChange: fn(),
    children: null,
  },
  parameters: { controls: { exclude: ["children"] } },
  render: (args) => (
    <StatisticsScreen {...args}>
      <p>The figures of the tab shown go here.</p>
    </StatisticsScreen>
  ),
} satisfies Meta<typeof StatisticsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The overview tab over 90 days; a click on another tab changes it in place. */
export const Overview: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("tab", { name: "Memory" }));
    await expect(args.onChange).toHaveBeenCalledWith({ view: "memory" });
  },
};

/** The activity tab; the arrow keys move among the tabs. */
export const Activity: Story = {
  args: { view: "activity" },
  play: async ({ args, canvasElement }) => {
    within(canvasElement).getByRole("tab", { selected: true }).focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(args.onChange).toHaveBeenCalledWith({ view: "memory" });
  },
};

/** The cards' tab over the whole log; a change of range is passed on. */
export const AllTime: Story = {
  args: { view: "cards", range: "all" },
  play: async ({ args, canvasElement }) => {
    await userEvent.selectOptions(within(canvasElement).getByRole("combobox"), "30d");
    await expect(args.onChange).toHaveBeenCalledWith({ range: "30d" });
  },
};
