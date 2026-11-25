// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DailyMessage, DailyMessageContainer } from "./DailyMessage";

const meta = {
  title: "Decks/DailyMessage",
  component: DailyMessage,
  args: {
    message: { id: "donate", text: "dailyMessage.message.donate", link: "donate" },
    repoUrl: "https://github.com/solid-memo/website",
    onDismiss: fn(),
  },
} satisfies Meta<typeof DailyMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A message with a link to the About page's word on donating. */
export const Donate: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Hide for today" }));
    await expect(args.onDismiss).toHaveBeenCalled();
  },
};

/** A message linking to the repository's Discussions, in a new tab. */
export const Discussions: Story = {
  args: {
    message: { id: "discussions", text: "dailyMessage.message.discussions", link: "discussions" },
  },
};

/** A message linking to the repository itself. */
export const Repository: Story = {
  args: { message: { id: "star", text: "dailyMessage.message.star", link: "repository" } },
};

/** A message with a repository link, on a site that names no repository: the link is left out. */
export const NoRepository: Story = {
  args: {
    message: { id: "star", text: "dailyMessage.message.star", link: "repository" },
    repoUrl: null,
  },
};

/** A message without a link. */
export const NoLink: Story = {
  args: { message: { id: "undo", text: "dailyMessage.message.undo" } },
};

/** The container on a day with a message: hiding it puts it away for the day. */
export const OnADayWithAMessage: Story = {
  render: () => (
    <DailyMessageContainer
      messages={[{ id: "undo", text: "dailyMessage.message.undo" }]}
      now={fn(() => new Date("2026-11-02T12:00:00"))}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Hide for today" }));
    await expect(
      canvas.queryByRole("complementary", { name: "Message of the day" }),
    ).not.toBeInTheDocument();
  },
};
