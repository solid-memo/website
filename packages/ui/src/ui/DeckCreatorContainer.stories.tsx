// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { DeckCreatorContainer } from "./DeckCreatorContainer";
import { DeviceValues } from "./deviceValues";
import { rememberLanguage } from "./remembered";
import { makeDeviceValuesFake } from "../test/fakes/deviceValues";
import { makeUseCasesFake } from "../test/useCasesFake";
import { kanjiDeck, storyInstance } from "../test/storyData";

/** A device on which English was last chosen for a deck's text. */
const englishDevice = makeDeviceValuesFake();
rememberLanguage("deck", "en", englishDevice);

const meta = {
  title: "Decks/DeckCreatorContainer",
  component: DeckCreatorContainer,
  args: {
    useCases: makeUseCasesFake({ createDeck: fn(async () => kanjiDeck) }),
    instance: storyInstance,
    onDone: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "instance"] } },
  decorators: [
    (Story) => (
      <DeviceValues.Provider value={englishDevice}>
        <Story />
      </DeviceValues.Provider>
    ),
  ],
} satisfies Meta<typeof DeckCreatorContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Creating a deck, then back to the deck list. */
export const Creates: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox"), "Kanji N5");
    await userEvent.click(canvas.getByRole("button", { name: "Create deck" }));
    await waitFor(() => expect(args.onDone).toHaveBeenCalled());
  },
};

/** The deck could not be created: the error shows, and the screen stays. */
export const Fails: Story = {
  args: {
    useCases: makeUseCasesFake({
      createDeck: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox"), "Kanji N5");
    await userEvent.click(canvas.getByRole("button", { name: "Create deck" }));
    await expect(await canvas.findByText(/did not answer in time/)).toBeInTheDocument();
    await expect(args.onDone).not.toHaveBeenCalled();
  },
};
