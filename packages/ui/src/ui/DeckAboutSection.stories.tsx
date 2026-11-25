// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DeckAboutSection } from "./DeckAboutSection";
import { arabicDeck, kanjiDeck, storyDeck } from "../test/storyData";

/** The kanji deck, described, with topics and keywords. */
const describedDeck = storyDeck(kanjiDeck.id, kanjiDeck.title, {
  description: { en: "Kanji of the N5 level, from https://jlpt.example/n5." },
  themes: ["https://solid-memo.com/ns/vocab/topics.ttl#languages"],
  keywords: { en: ["kanji", "JLPT"] },
});

const meta = {
  title: "Decks/DeckAboutSection",
  component: DeckAboutSection,
  args: { deck: describedDeck, busy: false, onSave: fn() },
  parameters: { controls: { exclude: ["deck"] } },
} satisfies Meta<typeof DeckAboutSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck's description, its URL a link, with its topics and keywords. */
export const Described: Story = {};

/** A deck with nothing said about it yet. */
export const NotDescribed: Story = { args: { deck: kanjiDeck } };

/** A description in Arabic, right to left. */
export const ArabicDescription: Story = {
  args: {
    deck: storyDeck(arabicDeck.id, arabicDeck.title, {
      description: { ar: "تحيات عربية يومية للمبتدئين، مع نطق كل كلمة." },
    }),
  },
};

/** Something is being saved: describing waits. */
export const Busy: Story = { args: { busy: true } };

/** Describing the deck, then saving the description. */
export const Describing: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Describe deck" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save description" }));
    await expect(args.onSave).toHaveBeenCalledWith({
      description: describedDeck.description,
      topics: describedDeck.themes,
      keywords: describedDeck.keywords,
    });
  },
};
