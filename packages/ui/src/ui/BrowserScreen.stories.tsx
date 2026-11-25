// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { Card } from "@solid-memo/domain/deck";
import { BrowserScreen } from "./BrowserScreen";
import { arabicDeck, kanjiCards, kanjiDeck, koreanDeck, longTitleDeck } from "../test/storyData";
import {
  arabicPhraseCard,
  gitDeck,
  longCard,
  manyKanjiCards,
  markdownCard,
  multilingualCard,
  pictureCard,
  retiredCard,
} from "../test/stories/cards";

const meta = {
  title: "Cards/BrowserScreen",
  component: BrowserScreen,
  args: {
    deck: kanjiDeck,
    deckHref: "#/decks/kanji",
    cards: kanjiCards,
    page: 1,
    busy: false,
    error: null,
    onDescribeDeck: fn(),
    onChangeDirection: fn(),
    addCardHref: "#/decks/kanji/new-card",
    cardHref: fn((card: Card) => `#/decks/kanji/cards/${card.id}`),
    onRemoveCard: fn(),
    onPageChange: fn(),
    onLanguageFilterChange: fn(),
  },
  parameters: { controls: { exclude: ["deck", "cards", "toSettle", "error", "cardHref"] } },
} satisfies Meta<typeof BrowserScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck's cards, its description and which way it is studied; studying it both ways. */
export const Cards: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("radio", { name: "Both ways" }));
    await expect(args.onChangeDirection).toHaveBeenCalledWith("bidirectional");
  },
};

/** A deck with no cards yet. */
export const Empty: Story = { args: { cards: [] } };

/** More cards than a page holds: paged. */
export const ManyPages: Story = { args: { cards: manyKanjiCards, page: 2 } };

/** Cards whose fronts state no language: marked, and a filter lists them alone. */
export const LanguagesToSettle: Story = {
  args: { toSettle: kanjiCards },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("radio", { name: "No language stated" }));
    await expect(args.onLanguageFilterChange).toHaveBeenCalledWith("unstated");
  },
};

/** Only the cards with no language stated listed. */
export const FilteredToUnstated: Story = {
  args: { toSettle: [kanjiCards[0]!], languageFilter: "unstated" },
};

/** A retired card among them: hidden until asked for. */
export const WithRetired: Story = { args: { cards: [...kanjiCards, retiredCard] } };

/** Only retired cards: none to list until asked for. */
export const AllRetired: Story = { args: { cards: [retiredCard] } };

/** Cards in Markdown, in several languages, a picture, and text long enough to wrap. */
export const MixedCards: Story = {
  args: {
    deck: longTitleDeck,
    cards: [markdownCard, multilingualCard, pictureCard, longCard],
  },
};

/** An Arabic deck, right to left, studied both ways. */
export const RightToLeftArabic: Story = {
  args: { deck: { ...arabicDeck, direction: "bidirectional" }, cards: [arabicPhraseCard] },
  globals: { direction: "rtl" },
};

/** A deck studied both ways, with a description. */
export const BothWays: Story = {
  args: {
    deck: {
      ...koreanDeck,
      description: { en: "Words for every day: food, family and the weather." },
    },
    cards: [multilingualCard],
  },
};

/** While a change saves: the controls wait. */
export const Busy: Story = { args: { busy: true, deck: gitDeck, cards: [markdownCard] } };

/** A change failed. */
export const ChangeFailed: Story = {
  args: { error: "The server did not answer in time. Check your connection and try again." },
};
