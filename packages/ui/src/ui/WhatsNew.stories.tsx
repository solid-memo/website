// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { WhatsNew, WhatsNewContainer } from "./WhatsNew";
import type { Highlight } from "./highlights";
import { makeUseCasesFake } from "../test/useCasesFake";

/** Highlights told by messages the app has, newest first. */
const highlights: Highlight[] = [
  { id: "newest", text: "schedulerInvitation.title" },
  { id: "middle", text: "schedulerInvitation.notNow" },
  { id: "oldest", text: "schedulerInvitation.switch" },
];

const meta = {
  title: "Decks/WhatsNew",
  component: WhatsNew,
  args: { version: "6.11.0", highlights, onDismiss: fn() },
} satisfies Meta<typeof WhatsNew>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The highlights of a version, newest first. */
export const Highlights: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Close/ }));
    await expect(args.onDismiss).toHaveBeenCalled();
  },
};

/** A single highlight. */
export const OneHighlight: Story = { args: { highlights: [highlights[0]!] } };

/** The container with two highlights not yet seen: closing keeps them all as seen. */
export const Unseen: Story = {
  render: () => (
    <WhatsNewContainer
      useCases={makeUseCasesFake({ unseenHighlights: fn(() => ["oldest", "newest"]) })}
      highlights={highlights}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Close/ }));
    await expect(canvas.queryByRole("complementary")).not.toBeInTheDocument();
  },
};
