// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { LibraryDeckContainer } from "./LibraryDeckContainer";
import { courseDeck, courseLibraryDeck } from "../test/course";
import { makeUseCasesFake } from "../test/useCasesFake";
import { storyInstance } from "../test/storyData";
import { capitalsLibraryDeck, importedCapitals } from "../test/stories/library";

const meta = {
  title: "Library/LibraryDeckContainer",
  component: LibraryDeckContainer,
  args: {
    useCases: makeUseCasesFake({ importLibraryDeck: fn(async () => importedCapitals) }),
    instance: storyInstance,
    deck: capitalsLibraryDeck,
    onDone: fn(),
    onCourseStarted: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "instance", "deck"] } },
} satisfies Meta<typeof LibraryDeckContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A library deck's page; the deck imported, which returns to the deck list. */
export const Deck: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Import this deck" }));
    await waitFor(() => expect(args.onDone).toHaveBeenCalled());
  },
};

/** A deck the instance already holds a copy of. */
export const AlreadyImported: Story = {
  args: { useCases: makeUseCasesFake({ listDecks: fn(async () => [importedCapitals]) }) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("Already imported")).toBeInTheDocument();
  },
};

/** A course, started, which opens the instance's deck of it. */
export const Course: Story = {
  args: {
    deck: courseLibraryDeck,
    useCases: makeUseCasesFake({ startCourse: fn(async () => courseDeck) }),
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Start course" }));
    await waitFor(() => expect(args.onCourseStarted).toHaveBeenCalledWith(courseDeck));
  },
};

/** An import that failed. */
export const ImportFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      importLibraryDeck: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Import this deck" }));
    await expect(await canvas.findByText(/did not answer in time/)).toBeInTheDocument();
  },
};

/** The import under way. */
export const Importing: Story = {
  args: {
    useCases: makeUseCasesFake({ importLibraryDeck: fn(() => new Promise<never>(() => {})) }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Import this deck" }));
    await expect(await canvas.findByRole("button", { name: "Importing…" })).toBeDisabled();
  },
};
