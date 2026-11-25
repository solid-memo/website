// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DeckDetailScreen } from "./DeckDetailScreen";
import { DeckLanguagesNotice } from "./DeckLanguagesNotice";
import { arabicDeck, kanjiDeck, longTitleDeck, storyDeck } from "../test/storyData";

const meta = {
  title: "Decks/DeckDetailScreen",
  component: DeckDetailScreen,
  args: {
    deck: kanjiDeck,
    cardCount: 80,
    dueCount: 12,
    newCount: 5,
    studiedToday: 0,
    busy: false,
    error: null,
    preferencesHref: "#/deck-preferences",
    browseHref: "#/browser",
    studioHref: "#/studio",
    onStudy: fn(),
    onResetDay: fn(),
  },
  parameters: { controls: { exclude: ["deck", "notice"] } },
} satisfies Meta<typeof DeckDetailScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Cards due and new ones to study today. */
export const DueAndNew: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Study" }));
    await expect(args.onStudy).toHaveBeenCalled();
  },
};

/** Only cards due, after some study today, which can be reset. */
export const StudiedToday: Story = { args: { newCount: 0, studiedToday: 7 } };

/** Only new cards, of a deck with an author, a license and a description. */
export const NewOnly: Story = {
  args: {
    dueCount: 0,
    deck: storyDeck(arabicDeck.id, arabicDeck.title, {
      authors: ["Anton Wiklund"],
      license: "https://creativecommons.org/publicdomain/zero/1.0/",
      modifiedAt: "2026-09-27T20:12:13.000Z",
      description: { en: "Everyday greetings in Modern Standard Arabic." },
    }),
  },
};

/** Everything studied for today. */
export const AllStudied: Story = { args: { dueCount: 0, newCount: 0, studiedToday: 17 } };

/** A deck with no cards yet, and a name long enough to wrap. */
export const NoCards: Story = {
  args: { deck: longTitleDeck, cardCount: 0, dueCount: 0, newCount: 0 },
};

/** The day is being reset. */
export const Resetting: Story = { args: { studiedToday: 7, busy: true } };

/** The day could not be reset. */
export const ResetFailed: Story = {
  args: {
    studiedToday: 7,
    error: "The server did not answer in time. Check your connection and try again.",
  },
};

/** With a notice before the study state: card sides to settle the language of. */
export const WithNotice: Story = {
  args: {
    notice: <DeckLanguagesNotice issues={{ unstated: 3 }} href="#/deck-preferences" />,
  },
};
