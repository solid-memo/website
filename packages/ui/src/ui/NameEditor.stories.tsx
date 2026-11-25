// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { NameEditor } from "./NameEditor";

const meta = {
  title: "Decks/NameEditor",
  component: NameEditor,
  args: { initial: "Kanji N5", label: "Deck name", onDone: fn() },
} satisfies Meta<typeof NameEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck's name, selected, so typing replaces it; Enter keeps the new name. */
export const Renaming: Story = {
  play: async ({ args, canvasElement }) => {
    await expect(within(canvasElement).getByRole("textbox", { name: "Deck name" })).toHaveFocus();
    await userEvent.keyboard("Kanji N4{Enter}");
    await expect(args.onDone).toHaveBeenCalledWith("Kanji N4", true);
  },
};

/** Escape keeps the name it has. */
export const Escaped: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.type(
      within(canvasElement).getByRole("textbox", { name: "Deck name" }),
      "{Escape}",
    );
    await expect(args.onDone).toHaveBeenCalledWith(null, true);
  },
};

/** A group's name, at most 80 characters. */
export const GroupName: Story = {
  args: { initial: "Languages", label: "Group name", maxLength: 80 },
};

/** A name long enough to overflow the field. */
export const LongName: Story = {
  args: {
    initial:
      "The capitals, rivers and mountain ranges of every country in Europe, with their flags",
  },
};
