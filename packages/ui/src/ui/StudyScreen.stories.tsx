// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { StudyScreen } from "./StudyScreen";
import {
  arabicCard,
  arabicDeck,
  kanjiCards,
  kanjiDeck,
  storyCard,
  storyPictureUrl,
} from "../test/storyData";

/** A card with a picture on its front and what it shows on its back. */
const flagCard = storyCard(
  kanjiDeck,
  "cards",
  {},
  { en: "Flashcards" },
  {
    frontImageUrl: storyPictureUrl,
    frontImageDescription: { en: "Solid Memo's illustration of cards" },
  },
);

/** The interval each SM-2 grade would give, in days. */
const intervals = { 0: 1, 1: 1, 2: 1, 3: 3, 4: 6, 5: 10 } as const;

const meta = {
  title: "Study/StudyScreen",
  component: StudyScreen,
  args: {
    deckName: "Kanji N5",
    deckHref: "#/deck?deck=kanji",
    prompt: { card: kanjiCards[0]!, direction: "front-to-back" },
    intervals,
    position: 1,
    total: 3,
    putBack: false,
    answerScale: "sm2",
    busy: false,
    error: null,
    onAnswer: fn(),
    onExit: fn(),
  },
  parameters: { controls: { exclude: ["prompt", "report", "intervals", "error"] } },
} satisfies Meta<typeof StudyScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A card's front, its answer under Reveal. */
export const Front: Story = {};

/** The answer shown, with the grade buttons and the interval each gives. */
export const AnswerShown: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Reveal" }));
    await expect(canvas.getByText("water")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /Good/ }));
    await expect(args.onAnswer).toHaveBeenCalledWith(4, expect.anything());
  },
};

/** The answer shown on the minimal scale, from Again to Easy. */
export const MinimalScale: Story = {
  args: { answerScale: "minimal", intervals: undefined },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Reveal" }));
  },
};

/** A card whose front is Arabic, right to left. */
export const ArabicCard: Story = {
  args: {
    deckName: "تحيات عربية",
    deckLang: "ar",
    deckHref: `#/deck?deck=${arabicDeck.id}`,
    prompt: { card: arabicCard, direction: "front-to-back" },
  },
};

/** A card with a picture on its front. */
export const PictureCard: Story = {
  args: { prompt: { card: flagCard, direction: "front-to-back" } },
};

/** The last card, the one before it put back to come round again, the answer can be undone. */
export const LastCard: Story = {
  args: {
    prompt: { card: kanjiCards[2]!, direction: "front-to-back" },
    position: 4,
    total: 4,
    putBack: true,
    onUndo: fn(),
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Undo last answer" }));
    await expect(args.onUndo).toHaveBeenCalled();
  },
};

/** An answer being saved: the buttons wait. */
export const Saving: Story = { args: { busy: true } };

/** The answer couldn't be saved. */
export const SaveFailed: Story = {
  args: { error: "The pod didn't answer. Check your connection and try again." },
};

/** Every card studied: the session is over. */
export const Finished: Story = {
  args: { prompt: null, position: 3, total: 3, onUndo: fn() },
};

/** Nothing due: done for today. */
export const DoneForToday: Story = {
  args: { prompt: null, position: 0, total: 0 },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "End session" }));
    await expect(args.onExit).toHaveBeenCalled();
  },
};

/** A cram, which records nothing, at its end: it can start over. */
export const CramFinished: Story = {
  args: { prompt: null, position: 3, total: 3, cram: { onAgain: fn() } },
  parameters: { controls: { exclude: ["cram"] } },
};
