// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Pager } from "./Pager";

const meta = {
  title: "Basics/Pager",
  component: Pager,
  args: { page: 2, pageCount: 3, onPageChange: fn() },
} satisfies Meta<typeof Pager>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A middle page: both ways open. */
export const MiddlePage: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /next/i }));
    await expect(args.onPageChange).toHaveBeenCalledWith(3);
  },
};

/** The first page: Previous only looks pressed. */
export const FirstPage: Story = { args: { page: 1 } };

/** The last page, with what is paged named. */
export const LastPageNamed: Story = { args: { page: 3, label: "decks" } };
