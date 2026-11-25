// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { deckLanguages } from "@solid-memo/domain/deckLanguages";
import { CardScreen } from "./CardScreen";
import { arabicDeck, kanjiCards, kanjiDeck } from "../test/storyData";
import {
  arabicPhraseCard,
  gitDeck,
  longCard,
  markdownCard,
  multilingualCard,
  pictureCard,
  retiredCard,
  waterCard,
} from "../test/stories/cards";

const meta = {
  title: "Cards/CardScreen",
  component: CardScreen,
  args: {
    card: waterCard,
    deckTitle: kanjiDeck.title,
    languages: deckLanguages(kanjiCards),
    busy: false,
    saved: false,
    error: null,
    onSave: fn(),
    onRemove: fn(),
  },
  parameters: {
    controls: { exclude: ["card", "deckTitle", "languages", "published", "error", "keep"] },
  },
} satisfies Meta<typeof CardScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A card as studied, its editor and its wrong options; an edit saved. */
export const Card: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const back = canvas.getByRole("textbox", { name: "Back" });
    await userEvent.clear(back);
    await userEvent.type(back, "water, river");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(args.onSave).toHaveBeenCalled();
  },
};

/** A card in Markdown, with its label and note. */
export const Markdown: Story = { args: { card: markdownCard, deckTitle: gitDeck.title } };

/** A card in several languages. */
export const MultiLanguage: Story = {
  args: { card: multilingualCard, deckTitle: { en: "Korean" } },
};

/** An Arabic card, right to left. */
export const RightToLeftArabic: Story = {
  args: { card: arabicPhraseCard, deckTitle: arabicDeck.title },
  globals: { direction: "rtl" },
};

/** A word too long for a line, and a back that wraps. */
export const LongText: Story = { args: { card: longCard, deckTitle: undefined } };

/** A picture given as a data: URL, which is named, not shown. */
export const Picture: Story = { args: { card: pictureCard, deckTitle: undefined } };

/** A retired card, and wrong options its deck's release published. */
export const RetiredAndPublished: Story = {
  args: {
    card: { ...retiredCard, distractors: waterCard.distractors },
    published: new Set(["water-d1"]),
  },
};

/** As the Studio shows it: no heading, no wrong options. */
export const InStudio: Story = { args: { heading: false, withDistractors: false } };

/** Saved: a status line says so. */
export const Saved: Story = { args: { saved: true } };

/** While the card saves: its buttons wait. */
export const Busy: Story = { args: { busy: true } };

/** The save failed. */
export const SaveFailed: Story = {
  args: { error: "The server did not answer in time. Check your connection and try again." },
};
