// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { DeckPreferencesContainer } from "./DeckPreferencesContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import {
  arabicCard,
  arabicDeck,
  kanjiCards,
  kanjiDeck,
  storyDeck,
  storyInstance,
} from "../test/storyData";

/** The kanji deck, showing pictures from another server. */
const kanjiWithPictures = storyDeck(kanjiDeck.id, kanjiDeck.title, {
  pictureHosts: ["images.example"],
});

const meta = {
  title: "Preferences/DeckPreferencesContainer",
  component: DeckPreferencesContainer,
  args: {
    useCases: makeUseCasesFake({ listCards: fn(async () => kanjiCards) }),
    instance: storyInstance,
    deck: kanjiWithPictures,
    onDeckRemoved: fn(),
    onDone: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "instance", "deck"] } },
} satisfies Meta<typeof DeckPreferencesContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck's preferences, its fronts' language to settle; saved, back to the deck. */
export const Preferences: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByLabelText("New cards per day"), "8");
    await userEvent.click(canvas.getByRole("button", { name: "Save preferences" }));
    await expect(args.onDone).toHaveBeenCalled();
  },
};

/** A deck whose cards' text runs right to left, opened at its Languages section. */
export const AtLanguages: Story = {
  args: {
    useCases: makeUseCasesFake({ listCards: fn(async () => [arabicCard]) }),
    deck: arabicDeck,
    section: "languages",
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("heading", { name: "Languages" }),
    ).toBeInTheDocument();
  },
};

/** The deck's cards couldn't be read: the Languages section says so. */
export const CardsUnreadable: Story = {
  args: {
    useCases: makeUseCasesFake({
      listCards: fn(async () => {
        throw new AppError("storageInaccessible");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/cannot open that storage/),
    ).toBeInTheDocument();
  },
};

/** The instance's preferences on their way. */
export const Loading: Story = {
  args: {
    useCases: makeUseCasesFake({ getPreferences: fn(() => new Promise<never>(() => {})) }),
  },
  play: async ({ args }) => {
    await waitFor(() => expect(args.useCases.getPreferences).toHaveBeenCalled());
  },
};

/** The instance's preferences couldn't be read. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      getPreferences: fn(async () => {
        throw new AppError("storageInaccessible");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("alert")).toBeInTheDocument();
  },
};

/** Saving the deck's limits failed. */
export const SaveFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      listCards: fn(async () => kanjiCards),
      setDeckPace: fn(async () => {
        throw new AppError("changedElsewhere");
      }),
    }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Save preferences" }));
    await expect(await canvas.findByText(/changed elsewhere/)).toBeInTheDocument();
    await expect(args.onDone).not.toHaveBeenCalled();
  },
};
