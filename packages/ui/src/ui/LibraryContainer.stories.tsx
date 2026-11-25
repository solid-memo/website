// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { LibraryContainer } from "./LibraryContainer";
import { forget } from "./remembered";
import { makeUseCasesFake } from "../test/useCasesFake";
import { storyInstance } from "../test/storyData";
import { importedCapitals, kanjiLibraryDeck, libraryDecks } from "../test/stories/library";

/** The library's decks, and the instance's copy of the capitals deck. */
const library = {
  listLibraryDecks: fn(async () => libraryDecks),
  listDecks: fn(async () => [importedCapitals]),
};

const meta = {
  title: "Library/LibraryContainer",
  component: LibraryContainer,
  args: {
    useCases: makeUseCasesFake({
      ...library,
      importLibraryDeck: fn(async () => importedCapitals),
    }),
    instance: storyInstance,
    onDone: fn(),
  },
  // A story that checks a deck leaves it checked for the next: forgotten.
  beforeEach: () => () => forget(`library:${storyInstance.url}:selected`),
  parameters: { controls: { exclude: ["useCases", "instance"] } },
} satisfies Meta<typeof LibraryContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The library, one of its decks already imported; another checked and imported. */
export const Library: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Already imported")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Kanji N5" }));
    await userEvent.click(canvas.getByRole("button", { name: "Import 1 deck" }));
    await waitFor(() => expect(args.onDone).toHaveBeenCalled());
    await expect(args.useCases.importLibraryDeck).toHaveBeenCalledWith(
      storyInstance.url,
      kanjiLibraryDeck,
    );
  },
};

/** The library's index on its way. */
export const Loading: Story = {
  args: {
    useCases: makeUseCasesFake({ listLibraryDecks: fn(() => new Promise<never>(() => {})) }),
  },
};

/** The library's index couldn't be read. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      listLibraryDecks: fn(async () => {
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

/** An import that failed: the error under the list. */
export const ImportFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      ...library,
      importLibraryDeck: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("checkbox", { name: "Kanji N5" }));
    await userEvent.click(canvas.getByRole("button", { name: "Import 1 deck" }));
    await expect(await canvas.findByText(/did not answer in time/)).toBeInTheDocument();
  },
};
