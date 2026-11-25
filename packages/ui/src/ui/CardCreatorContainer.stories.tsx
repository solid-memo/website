// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import type { CardContent, Deck } from "@solid-memo/domain/deck";
import { CardCreatorContainer } from "./CardCreatorContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { koreanDeck, storyCard } from "../test/storyData";

/** The Korean deck's cards: their texts say their languages, which a new card's start in. */
const koreanCards = [
  storyCard(koreanDeck, "water", { ko: "물" }, { en: "water" }),
  storyCard(koreanDeck, "fire", { ko: "불" }, { en: "fire" }),
];

/** Once the deck's cards give the front its language, writes a card on the front and back, and adds it. */
async function addCard(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await canvas.findByRole("button", { name: "Language: Korean" });
  await userEvent.type(canvas.getByRole("textbox", { name: "Front" }), "나무");
  await userEvent.type(canvas.getByRole("textbox", { name: "Back" }), "tree");
  await userEvent.click(canvas.getByRole("button", { name: "Add card" }));
}

const meta = {
  title: "Cards/CardCreatorContainer",
  component: CardCreatorContainer,
  args: {
    useCases: makeUseCasesFake({
      listCards: fn(async () => koreanCards),
      addCard: fn(async (deck: Deck, content: CardContent) =>
        storyCard(deck, "tree", content.front, content.back),
      ),
    }),
    deck: koreanDeck,
    deckHref: "#/decks/korean",
    backHref: "#/decks/korean/browser",
  },
  parameters: { controls: { exclude: ["useCases", "deck"] } },
} satisfies Meta<typeof CardCreatorContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A card added to the deck: the form clears and says so. */
export const AddsACard: Story = {
  play: async ({ canvasElement }) => {
    await addCard(canvasElement);
    await expect(await within(canvasElement).findByText("Card added.")).toBeInTheDocument();
  },
};

/** The deck's cards still on their way: the form is there, the languages still to come. */
export const CardsLoading: Story = {
  args: { useCases: makeUseCasesFake({ listCards: fn(() => new Promise<never>(() => {})) }) },
};

/** The card couldn't be added: the form keeps it, and the error says why. */
export const AddFails: Story = {
  args: {
    useCases: makeUseCasesFake({
      listCards: fn(async () => koreanCards),
      addCard: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await addCard(canvasElement);
    await expect(within(canvasElement).getByRole("textbox", { name: "Front" })).toHaveValue("나무");
  },
};
