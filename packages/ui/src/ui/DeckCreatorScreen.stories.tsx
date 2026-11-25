// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DeckCreatorScreen } from "./DeckCreatorScreen";
import { DeviceValues } from "./deviceValues";
import { rememberLanguage } from "./remembered";
import { makeDeviceValuesFake } from "../test/fakes/deviceValues";

/** A device on which English was last chosen for a deck's text. */
const englishDevice = makeDeviceValuesFake();
rememberLanguage("deck", "en", englishDevice);

const meta = {
  title: "Decks/DeckCreatorScreen",
  component: DeckCreatorScreen,
  args: { busy: false, error: null, onCreate: fn() },
} satisfies Meta<typeof DeckCreatorScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new deck's name, its language not chosen yet: creating asks for it. */
export const NoLanguageYet: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox"), "Kanji N5");
    await userEvent.click(canvas.getByRole("button", { name: "Create deck" }));
    await expect(await canvas.findByText(/Choose the language of/)).toBeInTheDocument();
    await expect(args.onCreate).not.toHaveBeenCalled();
  },
};

/** On a device that last chose English for a deck's text: the name starts in English. */
export const LanguageRemembered: Story = {
  decorators: [
    (Story) => (
      <DeviceValues.Provider value={englishDevice}>
        <Story />
      </DeviceValues.Provider>
    ),
  ],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox"), "Kanji N5");
    await userEvent.click(canvas.getByRole("button", { name: "Create deck" }));
    await expect(args.onCreate).toHaveBeenCalledWith({ en: "Kanji N5" });
  },
};

/** The deck is being created. */
export const Creating: Story = { args: { busy: true } };

/** The deck could not be created. */
export const Failed: Story = {
  args: { error: "The server did not answer in time. Check your connection and try again." },
};
