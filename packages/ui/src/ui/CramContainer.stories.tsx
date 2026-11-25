// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { CramContainer } from "./CramContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { deckProgressOf } from "../test/fakes/statistics";
import { arabicCard, arabicDeck, kanjiCards, kanjiDeck, storyInstance } from "../test/storyData";

/** The kanji deck's water and fire forgotten often enough to be leeches; tree hard, but no leech. */
const kanjiLeeches = deckProgressOf(kanjiDeck, {
  hardest: {
    reviews: 20,
    cards: [
      { card: kanjiCards[0]!, lapses: 5, reviews: 8 },
      { card: kanjiCards[1]!, lapses: 4, reviews: 6 },
      { card: kanjiCards[2]!, lapses: 2, reviews: 6 },
    ],
  },
});

/** The Arabic deck's greeting, a leech. */
const arabicLeeches = deckProgressOf(arabicDeck, {
  hardest: { reviews: 9, cards: [{ card: arabicCard, lapses: 6, reviews: 9 }] },
});

const meta = {
  title: "Study/CramContainer",
  component: CramContainer,
  args: {
    useCases: makeUseCasesFake({
      getCardProgress: fn(async () => ({ today: "2026-09-21", decks: [kanjiLeeches] })),
      getPreferences: fn(async () => DEFAULT_PREFERENCES),
    }),
    instance: storyInstance,
    deck: kanjiDeck,
    onExit: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "instance", "deck", "random"] } },
} satisfies Meta<typeof CramContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A cram of a deck's leeches: answered, nothing recorded. */
export const DeckLeeches: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Reveal" }));
    await userEvent.click(canvas.getByRole("button", { name: /Good/ }));
    await expect(await canvas.findByText("Card 2 of 2")).toBeInTheDocument();
  },
};

/** A cram of every deck's leeches, an Arabic one among them: each card names its deck. */
export const EveryDeck: Story = {
  args: {
    deck: undefined,
    useCases: makeUseCasesFake({
      getCardProgress: fn(async () => ({
        today: "2026-09-21",
        decks: [arabicLeeches, kanjiLeeches],
      })),
      getPreferences: fn(async () => DEFAULT_PREFERENCES),
    }),
  },
};

/** A deck with no leeches: nothing to cram. */
export const NoLeeches: Story = {
  args: {
    useCases: makeUseCasesFake({
      getCardProgress: fn(async () => ({
        today: "2026-09-21",
        decks: [deckProgressOf(kanjiDeck)],
      })),
      getPreferences: fn(async () => DEFAULT_PREFERENCES),
    }),
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "End session" }),
    );
    await expect(args.onExit).toHaveBeenCalled();
  },
};

/** The leeches on their way. */
export const Preparing: Story = {
  args: {
    useCases: makeUseCasesFake({ getCardProgress: fn(() => new Promise<never>(() => {})) }),
  },
};

/** The cards' progress couldn't be read. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      getCardProgress: fn(async () => {
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
