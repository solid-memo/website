// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { CardHistoryContainer } from "./CardHistoryContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { kanjiDeck, storyInstance } from "../test/storyData";
import { waterAnswers, waterCard, waterState } from "../test/stories/cards";

const meta = {
  title: "Cards/CardHistoryContainer",
  component: CardHistoryContainer,
  args: {
    useCases: makeUseCasesFake({
      cardAnswers: fn(async () => waterAnswers),
      listDeckReviewStates: fn(async () => ({ sm2: [waterState("front-to-back")], fsrs: [] })),
    }),
    instanceUrl: storyInstance.url,
    deck: kanjiDeck,
    card: waterCard,
  },
  parameters: { controls: { exclude: ["useCases", "deck", "card"] } },
} satisfies Meta<typeof CardHistoryContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The card's history, read from its answers and the deck's review states. */
export const History: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("table", { name: "Answers to this card" }),
    ).toBeInTheDocument();
  },
};

/** A card not studied yet. */
export const NotStudied: Story = { args: { useCases: makeUseCasesFake() } };

/** The history on its way. */
export const Loading: Story = {
  args: { useCases: makeUseCasesFake({ cardAnswers: fn(() => new Promise<never>(() => {})) }) },
};

/** The answers couldn't be read: a quiet line says so. */
export const Unavailable: Story = {
  args: {
    useCases: makeUseCasesFake({
      cardAnswers: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("The card's history cannot be read just now."),
    ).toBeInTheDocument();
  },
};
