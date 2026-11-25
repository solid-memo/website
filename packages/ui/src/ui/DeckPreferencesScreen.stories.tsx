// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { DeckPreferencesScreen } from "./DeckPreferencesScreen";
import { arabicDeck, kanjiDeck, longTitleDeck, storyDeck } from "../test/storyData";

/** The kanji deck with limits of its own and pictures from another server. */
const kanjiWithLimits = storyDeck(kanjiDeck.id, kanjiDeck.title, {
  newCardsPerDay: 10,
  pictureHosts: ["images.example"],
});

const meta = {
  title: "Preferences/DeckPreferencesScreen",
  component: DeckPreferencesScreen,
  args: {
    deck: kanjiWithLimits,
    deckHref: "#/deck",
    preferences: DEFAULT_PREFERENCES,
    preferencesHref: "#/preferences",
    languages: { front: "ja", back: "en", unstatedCounts: { front: 3, back: 0 } },
    cardLanguages: ["en", "sv"],
    busy: false,
    error: null,
    onSave: fn(),
    onRename: fn(),
    onRemove: fn(),
    onStateLanguages: fn(),
    onSetCardLanguage: fn(),
    onHidePictures: fn(),
    pictureHosts: ["images.example"],
  },
  parameters: { controls: { exclude: ["deck", "preferences", "languages"] } },
} satisfies Meta<typeof DeckPreferencesScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck's own limits, its card language and pictures, and fronts to settle; a limit handed back. */
export const OwnLimits: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText("New cards per day"));
    await userEvent.type(canvas.getByLabelText("Max reviews per day"), "50");
    await userEvent.click(canvas.getByRole("button", { name: "Save preferences" }));
    await expect(args.onSave).toHaveBeenCalledWith({ maxReviewsPerDay: 50 });
  },
};

/** A deck that follows the instance's limits, its name in Arabic, right to left. */
export const FollowsInstance: Story = {
  args: { deck: arabicDeck, pictureHosts: [], cardLanguages: ["ar", "en"] },
};

/** The deck renamed. */
export const Rename: Story = {
  args: { deck: longTitleDeck, pictureHosts: [] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Rename deck" }));
    await userEvent.type(canvas.getByRole("textbox", { name: /deck name/i }), " and seas");
    await userEvent.click(canvas.getByRole("button", { name: "Save name" }));
    await expect(args.onRename).toHaveBeenCalled();
  },
};

/** Pictures from a server no longer shown. */
export const HidePictures: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /images\.example/ }));
    await expect(args.onHidePictures).toHaveBeenCalledWith("images.example");
  },
};

/** A course's deck: its course language. */
export const Course: Story = {
  args: {
    deck: storyDeck("course", { en: "Getting started with Solid" }, { course: true }),
    course: true,
    pictureHosts: [],
  },
};

/** Opened at the Languages section by a link. */
export const AtLanguages: Story = { args: { section: "languages" } };

/** The cards still being read: no languages yet. */
export const LanguagesLoading: Story = { args: { languages: undefined, cardLanguages: undefined } };

/** The cards' languages couldn't be checked. */
export const LanguagesUnreadable: Story = {
  args: {
    languages: undefined,
    languagesUnreadable: "The server did not answer in time. Check your connection and try again.",
  },
};

/** The last statement of languages changed some cards. */
export const Stated: Story = {
  args: {
    languages: { front: "ja", back: "en", unstatedCounts: { front: 0, back: 0 } },
    stated: 3,
  },
};

/** A change being saved: the buttons wait. */
export const Busy: Story = { args: { busy: true } };

/** Saving failed. */
export const SaveFailed: Story = {
  args: {
    error:
      "This was changed elsewhere, perhaps in another tab or app, since Solid Memo read it, so nothing was saved. Reload the page and try again.",
  },
};
