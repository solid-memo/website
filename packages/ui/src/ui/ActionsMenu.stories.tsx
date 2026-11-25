// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import {
  ActionsMenu,
  MenuCheckbox,
  MenuGroup,
  MenuItem,
  MenuLink,
  MenuSeparator,
} from "./ActionsMenu";

/** The menu's items, as a deck row's menu has them. */
const onRename = fn();
const onDelete = fn();
const onShowDue = fn();

const meta = {
  title: "Basics/ActionsMenu",
  component: ActionsMenu,
  args: {
    label: "Actions for Kanji N5",
    buttonClass: "row-menu",
    open: false,
    onOpen: fn(),
    onClose: fn(),
    // The items are the render's, not a control.
    children: null,
  },
  render: (args) => (
    <ActionsMenu {...args}>
      <MenuLink href="#/elsewhere">Preferences</MenuLink>
      <MenuItem onSelect={onRename}>Rename</MenuItem>
      <MenuItem disabled onSelect={onRename}>
        Move up
      </MenuItem>
      <MenuSeparator />
      <MenuGroup label="Move into">
        <MenuItem style="--depth: 1" onSelect={onRename}>
          Grammar
        </MenuItem>
        <MenuItem style="--depth: 2" onSelect={onRename}>
          Verbs
        </MenuItem>
      </MenuGroup>
      <MenuSeparator />
      <MenuCheckbox checked onChange={onShowDue}>
        Show due cards
      </MenuCheckbox>
      <MenuItem danger onSelect={onDelete}>
        Delete
      </MenuItem>
    </ActionsMenu>
  ),
  parameters: { controls: { exclude: ["children"] } },
} satisfies Meta<typeof ActionsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The menu closed: its button, an icon. A press asks to open it. */
export const Closed: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Actions for Kanji N5" }),
    );
    await expect(args.onOpen).toHaveBeenCalled();
  },
};

/** The menu open over the page: links, items, a disabled one, a group, a checkbox, a dangerous one. */
export const Open: Story = {
  args: { open: true },
  play: async ({ args }) => {
    const menu = within(document.body);
    await userEvent.click(menu.getByRole("menuitemcheckbox", { name: "Show due cards" }));
    await expect(onShowDue).toHaveBeenCalledWith(false);
    await userEvent.click(menu.getByRole("menuitem", { name: "Delete" }));
    await expect(args.onClose).toHaveBeenCalled();
    await expect(onDelete).toHaveBeenCalled();
  },
};

/** A button that shows a text in place of its icon, as the instance switcher's does. */
export const TextButton: Story = {
  args: { label: "Switch instance: Deck set A", text: "Deck set A", buttonClass: "switcher" },
};
