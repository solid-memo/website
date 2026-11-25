// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Dialog } from "./Dialog";

const meta = {
  title: "Basics/Dialog",
  component: Dialog,
  args: {
    heading: "Keyboard shortcuts",
    class: "key-help",
    onClose: fn(),
    onKeyDown: fn(),
    // What it holds is each story's own (render), not a control.
    children: null,
  },
  render: (args) => (
    <Dialog {...args}>
      <dl>
        <dt>Space</dt>
        <dd>Show the answer</dd>
        <dt>1–4</dt>
        <dd>Grade the card</dd>
      </dl>
    </Dialog>
  ),
  parameters: { controls: { exclude: ["children", "dialogRef"] } },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A modal dialog, open; its Close button closes it. */
export const Open: Story = {
  play: async ({ args, canvasElement }) => {
    const dialog = await within(canvasElement).findByRole("dialog", { name: "Keyboard shortcuts" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
  },
};

/** A dialog with a field that takes the focus as it opens, and a long heading that wraps. */
export const WithField: Story = {
  args: {
    heading:
      "Rename the deck “Kanji N5: the first hundred characters of the Japanese-Language Proficiency Test”",
  },
  render: (args) => (
    <Dialog {...args}>
      <label>
        Name <input autoFocus value="Kanji N5" />
      </label>
    </Dialog>
  ),
};
