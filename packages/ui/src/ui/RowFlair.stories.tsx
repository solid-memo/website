// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { RowFlair } from "./RowFlair";

const meta = {
  title: "Decks/RowFlair",
  component: RowFlair,
  args: { completion: "deck", variant: 0 },
  argTypes: { variant: { control: { type: "number", min: 0, max: 6 } } },
  // In a completed row of the deck list, as DeckRow places it.
  decorators: [
    (Story) => (
      <ul class="deck-list">
        <li class="deck-row completed">
          <Story />
          <a class="deck-open" href="#/deck">
            Kanji N5
          </a>
        </li>
      </ul>
    ),
  ],
} satisfies Meta<typeof RowFlair>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck whose every card is learned, in its first layout. */
export const DeckLearned: Story = {};

/** A deck whose every card is learned, in another layout. */
export const DeckLearnedOtherLayout: Story = { args: { variant: 2 } };

/** A finished course. */
export const CourseFinished: Story = { args: { completion: "course" } };

/** A finished course, in another layout. */
export const CourseFinishedOtherLayout: Story = { args: { completion: "course", variant: 1 } };
