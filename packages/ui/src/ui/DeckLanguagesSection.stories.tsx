// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DeckLanguagesSection } from "./DeckLanguagesSection";
import { kanjiDeck, storyDeck } from "../test/storyData";

const meta = {
  title: "Decks/DeckLanguagesSection",
  component: DeckLanguagesSection,
  args: {
    deck: kanjiDeck,
    languages: { back: "en", unstatedCounts: { front: 3, back: 1 } },
    busy: false,
    stated: null,
    onStateLanguages: fn(),
  },
  parameters: { controls: { exclude: ["deck"] } },
} satisfies Meta<typeof DeckLanguagesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Fronts and backs that state no language, a picker for each. */
export const Unstated: Story = {};

/** Stating with no language chosen asks for one. */
export const NoneChosen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "State the language" }));
    await expect(await canvas.findByText(/^Choose the language of/)).toBeInTheDocument();
  },
};

/** Only the fronts are to settle, of a copy of a library release. */
export const FrontsOfACopy: Story = {
  args: {
    deck: storyDeck(kanjiDeck.id, kanjiDeck.title, {
      sourceUrl: "https://pod.example/library/kanji/1.0.0/",
    }),
    languages: { unstatedCounts: { front: 12, back: 0 } },
  },
};

/** A statement is being saved. */
export const Saving: Story = { args: { busy: true } };

/** Every side states its language: nothing is left, and the last statement says how many it changed. */
export const Settled: Story = {
  args: {
    languages: { front: "ja", back: "en", unstatedCounts: { front: 0, back: 0 } },
    stated: 4,
  },
};

/** The cards are still being read. */
export const Loading: Story = { args: { languages: undefined } };

/** The cards could not be read. */
export const Unreadable: Story = {
  args: {
    languages: undefined,
    unreadable: "The server did not answer in time. Check your connection and try again.",
  },
};
