// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import type { LibraryCard } from "@solid-memo/domain/library";
import { LibraryBrowserContainer } from "./LibraryBrowserContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { capitalsLibraryDeck, libraryCards } from "../test/stories/library";

const meta = {
  title: "Library/LibraryBrowserContainer",
  component: LibraryBrowserContainer,
  args: {
    useCases: makeUseCasesFake({ listLibraryCards: fn(async () => libraryCards) }),
    deck: capitalsLibraryDeck,
    deckHref: "#/library-deck",
    cardHref: fn((card: LibraryCard) => `#/library-card?card=${card.id}`),
    page: 1,
    onPageChange: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "deck", "cardHref"] } },
} satisfies Meta<typeof LibraryBrowserContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A library deck's cards, read from the library. */
export const Cards: Story = {
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("Stockholm")).toBeInTheDocument();
  },
};

/** The cards on their way. */
export const Loading: Story = {
  args: {
    useCases: makeUseCasesFake({ listLibraryCards: fn(() => new Promise<never>(() => {})) }),
  },
};

/** The cards couldn't be read. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      listLibraryCards: fn(async () => {
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
