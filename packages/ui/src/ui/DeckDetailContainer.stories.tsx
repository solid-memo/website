// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { DeckDetailContainer } from "./DeckDetailContainer";
import { QUEUE_DEFAULTS } from "../test/fakes/study";
import { makeUseCasesFake } from "../test/useCasesFake";
import { arabicCard, arabicDeck, kanjiCards, kanjiDeck, storyInstance } from "../test/storyData";

/** Today's queue of the kanji deck: two cards due, one new, three studied. */
const kanjiQueue = {
  due: kanjiCards.slice(0, 2).map((card) => ({ card, direction: "front-to-back" as const })),
  newPrompts: [{ card: kanjiCards[2]!, direction: "front-to-back" as const }],
  studiedToday: 3,
  ...QUEUE_DEFAULTS,
};

const meta = {
  title: "Decks/DeckDetailContainer",
  component: DeckDetailContainer,
  args: {
    useCases: makeUseCasesFake({
      listCards: fn(async () => kanjiCards),
      getStudyQueue: fn(async () => kanjiQueue),
    }),
    instance: storyInstance,
    deck: kanjiDeck,
    onStudy: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "instance", "deck"] } },
} satisfies Meta<typeof DeckDetailContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck's page: today's study, and a notice of card sides that state no language. */
export const Deck: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("region", { name: "Languages of the deck's text" }),
    ).toBeInTheDocument();
  },
};

/** A deck whose card text runs right to left, every side's language stated, nothing studied yet. */
export const RightToLeft: Story = {
  args: {
    deck: arabicDeck,
    useCases: makeUseCasesFake({
      listCards: fn(async () => [arabicCard]),
      getStudyQueue: fn(async () => ({
        due: [],
        newPrompts: [{ card: arabicCard, direction: "front-to-back" as const }],
        studiedToday: 0,
        ...QUEUE_DEFAULTS,
      })),
    }),
  },
};

/** A deck with no cards yet. */
export const NoCards: Story = { args: { useCases: makeUseCasesFake() } };

/** The deck on its way. */
export const Loading: Story = {
  args: {
    useCases: makeUseCasesFake({ listCards: fn(() => new Promise<never>(() => {})) }),
  },
};

/** The deck's cards could not be read. */
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
