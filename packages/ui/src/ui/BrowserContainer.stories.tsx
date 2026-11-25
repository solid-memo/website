// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import type { Card, Deck, DeckDirection } from "@solid-memo/domain/deck";
import { BrowserContainer } from "./BrowserContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { kanjiCards, kanjiDeck } from "../test/storyData";

const meta = {
  title: "Cards/BrowserContainer",
  component: BrowserContainer,
  args: {
    useCases: makeUseCasesFake({
      listCards: fn(async () => kanjiCards),
      setDeckDirection: fn(async (deck: Deck, direction: DeckDirection) => ({
        ...deck,
        direction,
      })),
    }),
    deck: kanjiDeck,
    deckHref: "#/decks/kanji",
    page: 1,
    addCardHref: "#/decks/kanji/new-card",
    cardHref: fn((card: Card) => `#/decks/kanji/cards/${card.id}`),
    onPageChange: fn(),
    onLanguageFilterChange: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "deck", "cardHref"] } },
} satisfies Meta<typeof BrowserContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The deck's cards, read; its direction changed. */
export const Cards: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("radio", { name: "Both ways" }));
    await expect(args.useCases.setDeckDirection).toHaveBeenCalledWith(kanjiDeck, "bidirectional");
  },
};

/** The cards on their way. */
export const Loading: Story = {
  args: { useCases: makeUseCasesFake({ listCards: fn(() => new Promise<never>(() => {})) }) },
};

/** The cards couldn't be read. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      listCards: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/did not answer in time/),
    ).toBeInTheDocument();
  },
};
