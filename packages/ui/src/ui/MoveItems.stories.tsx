// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ActionsMenu } from "./ActionsMenu";
import type { OutlineNode } from "./deckTree/rows";
import { MoveItems } from "./MoveItems";

const deck = (key: string, en: string): OutlineNode => ({ key, title: { en } });

/** A deck list: decks at the top, and a group of languages with a group of its own. */
const deckList: OutlineNode[] = [
  deck("kanji", "Kanji N5"),
  deck("capitals", "Capitals of Europe"),
  {
    key: "languages",
    title: { en: "Languages" },
    children: [
      deck("korean", "Korean everyday words"),
      deck("arabic", "Arabic greetings"),
      {
        key: "asian",
        title: { en: "Asian scripts, from the oldest to the newest" },
        children: [deck("hangul", "Hangul")],
      },
    ],
  },
  { key: "empty", title: { en: "Later" }, children: [] },
];

/** A course's outline: chapters A (steps a1, a2) and B (step b1). */
const outline: OutlineNode[] = [
  {
    key: "A",
    title: { en: "Chapter A" },
    children: [deck("a1", "Step a1"), deck("a2", "Step a2")],
  },
  { key: "B", title: { en: "Chapter B" }, children: [deck("b1", "Step b1")] },
];

const meta = {
  title: "Decks/MoveItems",
  component: MoveItems,
  args: {
    nodes: deckList,
    nodeKey: "korean",
    readOnly: false,
    onMove: fn(),
    onCombine: fn(),
  },
  parameters: { controls: { exclude: ["nodes", "fits"] } },
  // In an open row menu, as the deck list shows them.
  render: (args) => (
    <ActionsMenu label="Actions" buttonClass="row-menu" open onOpen={fn()} onClose={fn()}>
      <MoveItems {...args} />
    </ActionsMenu>
  ),
} satisfies Meta<typeof MoveItems>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck in a group: every move, out of its group and into the others. */
export const InAGroup: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("menuitem", { name: "Move down" }),
    );
    await expect(args.onMove).toHaveBeenCalledWith({ parent: "languages", after: "arabic" });
  },
};

/** The first deck at the top: no move up, and no group above to join. */
export const FirstAtTheTop: Story = {
  args: { nodeKey: "kanji" },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("menuitem", {
        name: "Group with the one below",
      }),
    );
    await expect(args.onCombine).toHaveBeenCalledWith("capitals", "kanji");
  },
};

/** The list cannot be rearranged: every move is marked so. */
export const ReadOnly: Story = { args: { readOnly: true } };

/** A step of a course: among its neighbors or to another chapter, no new groups. */
export const CourseStep: Story = {
  args: {
    nodes: outline,
    nodeKey: "a2",
    onCombine: undefined,
    fits: fn((parent: string | null) => parent !== null),
    intoLabel: "Move to chapter",
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("menuitem", { name: "Chapter B" }),
    );
    await expect(args.onMove).toHaveBeenCalledWith({ parent: "B", after: "b1" });
  },
};
