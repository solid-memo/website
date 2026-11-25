// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { DeckListContainer } from "./DeckListContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { storyDecks, storyInstance } from "../test/storyData";

const meta = {
  title: "Decks/DeckListContainer",
  component: DeckListContainer,
  args: {
    useCases: makeUseCasesFake({ listDecks: fn(async () => storyDecks) }),
    instance: storyInstance,
    onStudyDeck: fn(),
    onCourseStarted: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "instance", "isSetAside"] } },
} satisfies Meta<typeof DeckListContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An instance's decks, in the scripts the app shows. */
export const Decks: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("link", { name: "Kanji N5" }),
    ).toBeInTheDocument();
  },
};

/** An instance with no decks yet: the course for newcomers is offered. */
export const NoDecks: Story = {
  args: { useCases: makeUseCasesFake() },
};

/** The decks on their way. */
export const Loading: Story = {
  args: { useCases: makeUseCasesFake({ listDecks: fn(() => new Promise<never>(() => {})) }) },
};

/** The decks couldn't be read. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      listDecks: fn(async () => {
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

/** The data is still being checked: the list can't be rearranged yet. */
export const Checking: Story = { args: { checking: true } };
