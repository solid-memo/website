// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { DeckStudyAction, DeckStudyActionContainer } from "./DeckStudyAction";
import { makeUseCasesFake } from "../test/useCasesFake";
import { arabicDeck, kanjiDeck, storyInstance } from "../test/storyData";

const meta = {
  title: "Decks/DeckStudyAction",
  component: DeckStudyAction,
  args: {
    deckName: "Kanji N5",
    queue: { dueCount: 9, newCount: 3 },
    loading: false,
    onStudy: fn(),
  },
  // In a deck-list row's place for it, as DeckRow shows it.
  decorators: [
    (Story) => (
      <span class="deck-meta">
        <Story />
      </span>
    ),
  ],
} satisfies Meta<typeof DeckStudyAction>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Cards to study today, and the button that starts the session. */
export const ToStudy: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Study Kanji N5" }));
    await expect(args.onStudy).toHaveBeenCalled();
  },
};

/** Done for the day: a hint beside a green tick. */
export const Done: Story = { args: { queue: { dueCount: 0, newCount: 0 } } };

/** The queue is first being fetched: a skeleton and a loader. */
export const Loading: Story = { args: { queue: undefined, loading: true } };

/** The queue could not be read: nothing is offered. */
export const Unknown: Story = { args: { queue: undefined } };

/** The container, reading a deck's counts. */
export const Container: Story = {
  render: () => (
    <DeckStudyActionContainer
      useCases={makeUseCasesFake({
        getStudyCounts: fn(async () => ({ dueCount: 4, newCount: 1, learned: false })),
      })}
      instance={storyInstance}
      deck={arabicDeck}
      onStudy={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("button", { name: /Arabic greetings/ }),
    ).toBeInTheDocument();
  },
};

/** The container, whose deck's counts could not be read. */
export const ContainerReadFailed: Story = {
  render: () => (
    <DeckStudyActionContainer
      useCases={makeUseCasesFake({
        getStudyCounts: fn(async () => {
          throw new AppError("podNoAnswer");
        }),
      })}
      instance={storyInstance}
      deck={kanjiDeck}
      onStudy={fn()}
    />
  ),
};
