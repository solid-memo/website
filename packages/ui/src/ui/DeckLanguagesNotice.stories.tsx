// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { DeckLanguagesNotice } from "./DeckLanguagesNotice";

const meta = {
  title: "Decks/DeckLanguagesNotice",
  component: DeckLanguagesNotice,
  args: {
    issues: { unstated: 3 },
    href: "#/deck-preferences?instance=a&deck=b&section=languages",
  },
} satisfies Meta<typeof DeckLanguagesNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Some card sides state no language. */
export const Unstated: Story = {};

/** A single card side states no language. */
export const OneSide: Story = { args: { issues: { unstated: 1 } } };

/** The library release could not be read, so the counts are not known. */
export const Unchecked: Story = { args: { unchecked: true } };
