// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { LibraryPreviewContainer } from "./LibraryPreviewContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import {
  capitalsLibraryDeck,
  koreanLibraryDeck,
  libraryCards,
  libraryCard,
} from "../test/stories/library";

const meta = {
  title: "Library/LibraryPreviewContainer",
  component: LibraryPreviewContainer,
  args: {
    useCases: makeUseCasesFake({ listLibraryCards: fn(async () => libraryCards) }),
    deck: capitalsLibraryDeck,
    deckHref: "#/library-deck",
    onExit: fn(),
    // The first card first, then the one after it: the same every time.
    random: fn(() => 0),
  },
  parameters: { controls: { exclude: ["useCases", "deck", "random"] } },
} satisfies Meta<typeof LibraryPreviewContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The deck's cards one after another: the first revealed, then the next. */
export const Preview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Reveal" }));
    await expect(canvas.getByText("Stockholm")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Next card" }));
    await expect(await canvas.findByText("مرحبا")).toBeInTheDocument();
  },
};

/** A deck studied both ways: Korean cards asked from either side. */
export const BothWays: Story = {
  args: {
    deck: koreanLibraryDeck,
    useCases: makeUseCasesFake({
      listLibraryCards: fn(async () => [libraryCard("water", { ko: "물" }, { en: "water" })]),
    }),
  },
};

/** A deck with no cards. */
export const Empty: Story = {
  args: { useCases: makeUseCasesFake({ listLibraryCards: fn(async () => []) }) },
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
