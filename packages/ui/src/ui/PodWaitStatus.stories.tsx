// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, within } from "storybook/test";
import type { PodWait } from "@solid-memo/application/podWaits";
import { PodWaitStatus } from "./PodWaitStatus";
import { makeUseCasesFake } from "../test/useCasesFake";

/** Use cases whose servers asked for `waits`, each ending so many seconds from now. */
function waiting(...waits: { host: string; seconds: number; asked: boolean }[]) {
  const current = (): PodWait[] =>
    waits.map(({ host, seconds, asked }) => ({
      host,
      until: new Date(Date.now() + seconds * 1000),
      asked,
    }));
  return makeUseCasesFake({ podWaits: current });
}

const meta = {
  title: "App/PodWaitStatus",
  component: PodWaitStatus,
  args: { useCases: waiting({ host: "pod.example", seconds: 40, asked: true }) },
} satisfies Meta<typeof PodWaitStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The learner's pod asked Solid Memo to slow down: the line counts down to the next try. */
export const Asked: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent(
      /asked Solid Memo to slow down/,
    );
  },
};

/** Many requests failed at once with no status, as a rate limit without CORS headers looks. */
export const NotAnswering: Story = {
  args: { useCases: waiting({ host: "pod.example", seconds: 12, asked: false }) },
};

/** Two servers, each with a wait of its own. */
export const TwoServers: Story = {
  args: {
    useCases: waiting(
      { host: "pod.example", seconds: 40, asked: true },
      { host: "decks.example.org", seconds: 90, asked: true },
    ),
  },
};

/** No server asked for a wait: an empty live region, ready for one. */
export const NoWait: Story = { args: { useCases: waiting() } };
