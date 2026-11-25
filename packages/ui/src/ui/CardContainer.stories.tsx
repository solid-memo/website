// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import type { Card, CardContent, Deck } from "@solid-memo/domain/deck";
import { CardContainer } from "./CardContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { kanjiCards, kanjiDeck } from "../test/storyData";
import { waterCard } from "../test/stories/cards";

/** Changes the card's back and saves it. */
async function saveBack(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const back = canvas.getByRole("textbox", { name: "Back" });
  await userEvent.clear(back);
  await userEvent.type(back, "water, river");
  await userEvent.click(canvas.getByRole("button", { name: "Save" }));
}

const meta = {
  title: "Cards/CardContainer",
  component: CardContainer,
  args: {
    useCases: makeUseCasesFake({
      listCards: fn(async () => kanjiCards),
      updateCard: fn(async (_deck: Deck, card: Card, content: CardContent) => ({
        ...card,
        ...content,
      })),
    }),
    deck: kanjiDeck,
    card: waterCard,
    onRemoved: fn(),
    onSaved: fn(),
    onUnsaved: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "deck", "card", "keep"] } },
} satisfies Meta<typeof CardContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A card's page, its edit saved: a status line says so. */
export const SavesAnEdit: Story = {
  play: async ({ args, canvasElement }) => {
    await saveBack(canvasElement);
    await expect(await within(canvasElement).findByText("Saved.")).toBeInTheDocument();
    await expect(args.onSaved).toHaveBeenCalled();
  },
};

/** The edit couldn't be saved: the error says why, the edit kept. */
export const SaveFails: Story = {
  args: {
    useCases: makeUseCasesFake({
      listCards: fn(async () => kanjiCards),
      updateCard: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await saveBack(canvasElement);
    await expect(
      await within(canvasElement).findByText(/did not answer in time/),
    ).toBeInTheDocument();
  },
};

/** The deck's cards still on their way: the card is shown, its languages still to come. */
export const CardsLoading: Story = {
  args: { useCases: makeUseCasesFake({ listCards: fn(() => new Promise<never>(() => {})) }) },
};
