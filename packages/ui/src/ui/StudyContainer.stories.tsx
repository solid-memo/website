// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import type { Prompt } from "@solid-memo/domain/deck";
import { StudyContainer } from "./StudyContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { QUEUE_DEFAULTS } from "../test/fakes/study";
import { arabicCard, arabicDeck, kanjiCards, kanjiDeck, storyInstance } from "../test/storyData";

/** The kanji deck's cards, each asked front to back. */
const kanjiPrompts: Prompt[] = kanjiCards.map((card) => ({ card, direction: "front-to-back" }));

const meta = {
  title: "Study/StudyContainer",
  component: StudyContainer,
  args: {
    useCases: makeUseCasesFake({
      getStudyQueue: fn(async () => ({
        due: kanjiPrompts.slice(0, 2),
        newPrompts: kanjiPrompts.slice(2),
        studiedToday: 0,
        ...QUEUE_DEFAULTS,
      })),
    }),
    instance: storyInstance,
    deck: kanjiDeck,
    onExit: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "instance", "deck", "random"] } },
} satisfies Meta<typeof StudyContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A session of the deck's due and new cards: a card answered, the next comes up. */
export const Session: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Reveal" }));
    await userEvent.click(canvas.getByRole("button", { name: /Good/ }));
    await expect(await canvas.findByText("Card 2 of 3")).toBeInTheDocument();
  },
};

/** A session of a deck whose cards are Arabic, right to left. */
export const ArabicDeck: Story = {
  args: {
    deck: arabicDeck,
    useCases: makeUseCasesFake({
      getStudyQueue: fn(async () => ({
        due: [{ card: arabicCard, direction: "front-to-back" as const }],
        newPrompts: [],
        studiedToday: 0,
        ...QUEUE_DEFAULTS,
      })),
    }),
  },
};

/** Nothing due today: the session is over before it starts. */
export const NothingDue: Story = {
  args: { useCases: makeUseCasesFake() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "End session" }));
    await waitFor(() => expect(args.onExit).toHaveBeenCalledWith(false));
  },
};

/** The session's cards on their way. */
export const Preparing: Story = {
  args: {
    useCases: makeUseCasesFake({ getStudyQueue: fn(() => new Promise<never>(() => {})) }),
  },
};

/** The deck's cards couldn't be read. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      getStudyQueue: fn(async () => {
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
