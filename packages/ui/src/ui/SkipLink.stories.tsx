// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { MAIN_ID, SkipLink } from "./SkipLink";

const meta = {
  title: "Basics/SkipLink",
  component: SkipLink,
  render: () => (
    <>
      <SkipLink />
      <p>The site's header: theme, languages, masthead.</p>
      <main id={MAIN_ID} tabIndex={-1}>
        The main content.
      </main>
    </>
  ),
} satisfies Meta<typeof SkipLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The first Tab stop, shown once focused; following it moves the focus to the main content. */
export const Focused: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    const link = canvas.getByRole("link", { name: "Skip to content" });
    await expect(link).toHaveFocus();
    await userEvent.click(link);
    await expect(canvas.getByRole("main")).toHaveFocus();
  },
};
