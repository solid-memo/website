// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { LibraryCardScreen } from "./LibraryCardScreen";
import {
  arabicLibraryCard,
  capitalsLibraryDeck,
  longLibraryCard,
  pictureLibraryCard,
  retiredLibraryCard,
  stockholmCard,
} from "../test/stories/library";

const meta = {
  title: "Library/LibraryCardScreen",
  component: LibraryCardScreen,
  args: {
    card: stockholmCard,
    deckName: "Capitals of the world",
    deckHref: "#/library-deck",
    releaseUrl: capitalsLibraryDeck.url,
  },
  parameters: { controls: { exclude: ["card"] } },
} satisfies Meta<typeof LibraryCardScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A card, both sides, a note under its back. */
export const Card: Story = {};

/** A card whose front runs right to left, from a deck named in Arabic. */
export const Arabic: Story = {
  args: { card: arabicLibraryCard, deckName: "تحيات عربية", deckLang: "ar" },
};

/** A card with a picture on its front. */
export const Picture: Story = { args: { card: pictureLibraryCard } };

/** A card whose sides are long enough to wrap. */
export const LongText: Story = { args: { card: longLibraryCard } };

/** A card the release retires. */
export const Retired: Story = { args: { card: retiredLibraryCard } };
