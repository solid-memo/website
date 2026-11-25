// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { LibraryCard } from "@solid-memo/domain/library";
import { LibraryBrowserScreen } from "./LibraryBrowserScreen";
import {
  arabicLibraryDeck,
  capitalsLibraryDeck,
  libraryCards,
  manyLibraryCards,
} from "../test/stories/library";

const meta = {
  title: "Library/LibraryBrowserScreen",
  component: LibraryBrowserScreen,
  args: {
    deck: capitalsLibraryDeck,
    deckHref: "#/library-deck",
    cardHref: fn((card: LibraryCard) => `#/library-card?card=${card.id}`),
    cards: libraryCards,
    page: 1,
    onPageChange: fn(),
  },
  parameters: { controls: { exclude: ["deck", "cards", "cardHref"] } },
} satisfies Meta<typeof LibraryBrowserScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Cards of every kind: Arabic text, a picture, long text; the retired one listed on request. */
export const Cards: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("checkbox", { name: "Show retired cards" }));
    await expect(canvas.getByText("Retired")).toBeInTheDocument();
  },
};

/** More cards than a page holds: paged. */
export const ManyCards: Story = {
  args: { cards: manyLibraryCards },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /next/i }));
    await expect(args.onPageChange).toHaveBeenCalledWith(2);
  },
};

/** The last page of many cards. */
export const LastPage: Story = { args: { cards: manyLibraryCards, page: 3 } };

/** A deck named in Arabic. */
export const ArabicDeck: Story = { args: { deck: arabicLibraryDeck } };

/** A deck with no cards. */
export const Empty: Story = { args: { cards: [] } };
