// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { fn } from "storybook/test";
import { deckLanguages } from "@solid-memo/domain/deckLanguages";
import { CardCreatorScreen } from "./CardCreatorScreen";
import { arabicCard, arabicDeck, kanjiCards, kanjiDeck, longTitleDeck } from "../test/storyData";

const meta = {
  title: "Cards/CardCreatorScreen",
  component: CardCreatorScreen,
  args: {
    deck: kanjiDeck,
    languages: deckLanguages(kanjiCards),
    deckHref: "#/decks/kanji",
    backHref: "#/decks/kanji/browser",
    busy: false,
    error: null,
    onAdd: fn(),
  },
  parameters: { controls: { exclude: ["deck", "languages", "error"] } },
} satisfies Meta<typeof CardCreatorScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck's new card: its text starts in the languages the deck's cards have. */
export const NewCard: Story = {};

/** A deck with no cards yet: each text's language is to choose. */
export const FirstCard: Story = { args: { languages: undefined } };

/** An Arabic deck: the back starts in Arabic, right to left. */
export const ArabicDeck: Story = {
  args: { deck: arabicDeck, languages: deckLanguages([arabicCard]) },
  globals: { direction: "rtl" },
};

/** A deck whose name is long enough to wrap. */
export const LongDeckName: Story = { args: { deck: longTitleDeck, languages: undefined } };

/** While the card is added. */
export const Busy: Story = { args: { busy: true } };

/** The card couldn't be added. */
export const AddFailed: Story = {
  args: { error: "The server did not answer in time. Check your connection and try again." },
};
