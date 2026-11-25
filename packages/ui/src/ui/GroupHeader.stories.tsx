// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { GroupHeader } from "./GroupHeader";
import { storyInstance } from "../test/storyData";

const meta = {
  title: "Decks/GroupHeader",
  component: GroupHeader,
  args: {
    group: { url: `${storyInstance.url}catalog.ttl#languages`, title: { en: "Languages" } },
    deckCount: 3,
    depth: 0,
    expanded: true,
    bodyId: "group-body",
    naming: false,
    onToggle: fn(),
    onNamed: fn(),
    menu: (
      <button type="button" class="icon" aria-label="Actions">
        ⋯
      </button>
    ),
  },
  parameters: { controls: { exclude: ["group", "menu"] } },
} satisfies Meta<typeof GroupHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An open group; its button folds it. */
export const Open: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Languages/ }));
    await expect(args.onToggle).toHaveBeenCalled();
  },
};

/** A shut group. */
export const Shut: Story = { args: { expanded: false } };

/** A shut group a drop would go into: its folder shows open. */
export const DropInto: Story = { args: { expanded: false, drag: "into" } };

/** A group of one deck, inside another group, with a long name. */
export const NestedLongName: Story = {
  args: {
    group: {
      url: `${storyInstance.url}catalog.ttl#europe`,
      title: { en: "Geography of Europe: capitals, rivers, mountain ranges and flags" },
    },
    deckCount: 1,
    depth: 1,
  },
};

/** Being named: a field stands in for the button. */
export const Naming: Story = {
  args: { naming: true },
  play: async ({ args, canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Group name" });
    await userEvent.clear(field);
    await userEvent.type(field, "Words{Enter}");
    await expect(args.onNamed).toHaveBeenCalledWith("Words", true);
  },
};
