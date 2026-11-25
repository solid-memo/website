// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DeckCardLanguageForm } from "./DeckCardLanguageForm";

const meta = {
  title: "Decks/DeckCardLanguageForm",
  component: DeckCardLanguageForm,
  args: { value: undefined, languages: ["ja", "en", "sv"], busy: false, onSave: fn() },
} satisfies Meta<typeof DeckCardLanguageForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The app's language, with the languages the cards state to choose from. */
export const AppLanguage: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Card language" }), "sv");
    await userEvent.click(canvas.getByRole("button", { name: "Save card language" }));
    await expect(args.onSave).toHaveBeenCalledWith("sv");
  },
};

/** A language chosen that the cards no longer state: it shows, so it can be cleared. */
export const ChoiceNoLongerStated: Story = {
  args: { value: "ar" },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Card language" }), "");
    await userEvent.click(canvas.getByRole("button", { name: "Save card language" }));
    await expect(args.onSave).toHaveBeenCalledWith(null);
  },
};

/** The cards state no language. */
export const NoneStated: Story = { args: { languages: [] } };

/** The cards are still being read. */
export const Reading: Story = { args: { value: "ja", languages: undefined } };

/** A change is being saved. */
export const Saving: Story = { args: { value: "ja", busy: true } };

/** A course's deck: its course language. */
export const Course: Story = { args: { course: true, languages: ["ko", "en"] } };
