// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DeckRow } from "./DeckRow";
import { arabicDeck, kanjiDeck, longTitleDeck, storyDeck } from "../test/storyData";

const meta = {
  title: "Decks/DeckRow",
  component: DeckRow,
  args: {
    deck: kanjiDeck,
    depth: 0,
    href: "#/deck",
    action: <span class="hint">12 due</span>,
    naming: false,
    onNamed: fn(),
    menu: (
      <button type="button" class="icon" aria-label="Actions">
        ⋯
      </button>
    ),
  },
  parameters: { controls: { exclude: ["deck", "action", "menu"] } },
  // In the deck list, as DeckListScreen places it.
  decorators: [
    (Story) => (
      <ul class="deck-list">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof DeckRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck, with what it offers today and its menu. */
export const Default: Story = {};

/** A deck whose card text runs right to left, in a group. */
export const RightToLeft: Story = { args: { deck: arabicDeck, depth: 1 } };

/** A long name that wraps. */
export const LongName: Story = { args: { deck: longTitleDeck } };

/** A copy of a release added from a link, with a newer release in the library. */
export const FromLinkWithNewerRelease: Story = {
  args: { fromHost: "decks.example", newerRelease: true },
};

/** Paused until the learner resumes it. */
export const Paused: Story = {
  args: {
    deck: storyDeck(kanjiDeck.id, kanjiDeck.title, {
      pause: { pausedAt: "2026-10-01T10:00:00.000Z" },
    }),
    paused: true,
  },
};

/** Paused until a day. */
export const PausedUntil: Story = {
  args: {
    deck: storyDeck(kanjiDeck.id, kanjiDeck.title, {
      pause: { pausedAt: "2026-10-01T10:00:00.000Z", resumesOn: "2026-10-15" },
    }),
    paused: true,
  },
};

/** Every card learned: the row turns gold. */
export const Learned: Story = { args: { completed: { completion: "deck", variant: 0 } } };

/** A finished course, which says so beside its name. */
export const CourseFinished: Story = {
  args: { completed: { completion: "course", variant: 1 } },
};

/** Lifted in a drag. */
export const Dragged: Story = { args: { drag: "source" } };

/** Being renamed: a field stands in for the link. */
export const Renaming: Story = {
  args: { naming: true },
  play: async ({ args, canvasElement }) => {
    await userEvent.type(
      within(canvasElement).getByRole("textbox", { name: "Deck name" }),
      "{Escape}",
    );
    await expect(args.onNamed).toHaveBeenCalledWith(null, true);
  },
};
