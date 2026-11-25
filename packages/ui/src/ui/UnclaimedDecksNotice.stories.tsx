// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { UnclaimedDecksNotice } from "./UnclaimedDecksNotice";
import { makeUseCasesFake } from "../test/useCasesFake";
import { storyInstance } from "../test/storyData";
import { manyUnclaimedDecks, outsideDeck, unclaimedDeck } from "../test/stories/library";

const meta = {
  title: "Library/UnclaimedDecksNotice",
  component: UnclaimedDecksNotice,
  args: {
    useCases: makeUseCasesFake({ claimDeckDocuments: fn(async () => undefined) }),
    instanceUrl: storyInstance.url,
    decks: [unclaimedDeck, outsideDeck],
  },
  parameters: { controls: { exclude: ["useCases", "decks"] } },
} satisfies Meta<typeof UnclaimedDecksNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck whose documents can be claimed, and one with a document elsewhere; the first claimed once confirmed. */
export const Decks: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "These are this deck's documents" }));
    await userEvent.click(canvas.getByRole("button", { name: "Mark them as the deck's" }));
    await waitFor(() =>
      expect(args.useCases.claimDeckDocuments).toHaveBeenCalledWith(
        storyInstance.url,
        unclaimedDeck.deckUrl,
      ),
    );
  },
};

/** Asked once more before the documents are marked as the deck's. */
export const Confirming: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "These are this deck's documents" }),
    );
  },
};

/** The claim under way. */
export const Claiming: Story = {
  args: {
    useCases: makeUseCasesFake({ claimDeckDocuments: fn(() => new Promise<never>(() => {})) }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "These are this deck's documents" }));
    await userEvent.click(canvas.getByRole("button", { name: "Mark them as the deck's" }));
    await expect(await canvas.findByRole("button", { name: "Marking…" })).toBeDisabled();
  },
};

/** A claim that failed. */
export const ClaimFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      claimDeckDocuments: fn(async () => {
        throw new AppError("claimOutsidePod", {
          deck: "Capitals of the world",
          url: unclaimedDeck.documents[0]!,
        });
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "These are this deck's documents" }));
    await userEvent.click(canvas.getByRole("button", { name: "Mark them as the deck's" }));
    await expect(await canvas.findByText(/did not mark/)).toBeInTheDocument();
  },
};

/** More decks than the notice lists: how many more is said. */
export const ManyDecks: Story = { args: { decks: manyUnclaimedDecks } };

/** Every deck's documents are its own: nothing shown. */
export const None: Story = { args: { decks: [] } };
