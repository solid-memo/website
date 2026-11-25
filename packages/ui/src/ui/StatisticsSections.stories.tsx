// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, within } from "storybook/test";
import { storyDecks } from "../test/storyData";
import {
  allTimeReport,
  courseOnlyReport,
  firstAnswerReport,
  koreanReport,
  recentReport,
} from "../test/stories/statistics";
import { ActivitySection, MemorySection, OverviewSection } from "./StatisticsSections";

const meta = {
  title: "Statistics/StatisticsSections",
  component: OverviewSection,
  args: { statistics: allTimeReport, decks: storyDecks, allTime: true, cardsYouKnow: 347 },
  parameters: { controls: { exclude: ["statistics", "decks"] } },
} satisfies Meta<typeof OverviewSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The overview of the whole log: the tiles, the log's growth and time, the calendar and every deck's figures. */
export const Overview: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("group", { name: "Cards you know" }),
    ).toHaveTextContent("347");
  },
};

/** The overview of the last 30 days, before where the cards stand is read. */
export const OverviewRecent: Story = {
  args: { statistics: recentReport, allTime: false, cardsYouKnow: undefined },
};

/** One deck's overview: no figures by deck. */
export const OverviewOneDeck: Story = {
  args: { statistics: koreanReport, decks: undefined, allTime: false },
};

/** The overview of a log of one answer, given today. */
export const OverviewFirstAnswer: Story = {
  args: { statistics: firstAnswerReport, cardsYouKnow: 0 },
};

/** The activity tab of the whole log: what each day held, the weekdays, time studied, progress. */
export const Activity: Story = {
  render: () => <ActivitySection statistics={allTimeReport} />,
};

/** The activity tab of the last 30 days. */
export const ActivityRecent: Story = {
  render: () => <ActivitySection statistics={recentReport} />,
};

/** The activity tab of a deck studied only in a course: no first tries. */
export const ActivityCourseOnly: Story = {
  render: () => <ActivitySection statistics={courseOnlyReport} />,
};

/** The memory tab of the whole log: recall month by month, by interval, by lateness, and the course questions. */
export const Memory: Story = {
  render: () => <MemorySection statistics={allTimeReport} byDirection={false} />,
};

/** The memory tab of the last 30 days: recall week by week. */
export const MemoryRecent: Story = {
  render: () => <MemorySection statistics={recentReport} byDirection={false} />,
};

/** One deck's memory tab, reviewed both ways: recall each way. */
export const MemoryBothWays: Story = {
  render: () => <MemorySection statistics={koreanReport} byDirection />,
};

/** The memory tab of a deck studied only in a course: only its questions. */
export const MemoryCourseOnly: Story = {
  render: () => <MemorySection statistics={courseOnlyReport} byDirection />,
};

/** The memory tab before any review: no recall over time. */
export const MemoryNoReviews: Story = {
  render: () => <MemorySection statistics={firstAnswerReport} byDirection={false} />,
};
