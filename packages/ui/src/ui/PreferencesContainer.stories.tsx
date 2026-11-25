// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import type { SwitchProgress } from "@solid-memo/domain/schedulerSwitch";
import { PreferencesContainer } from "./PreferencesContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { faintPalette, readingPalette } from "../test/stories/preferences";
import { arabicDeck, kanjiDeck, storyInstance } from "../test/storyData";

/** Switches to FSRS-6 in the form, and saves. */
async function switchToFsrs(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole("radio", { name: /^FSRS-6/ }));
  await userEvent.click(canvas.getByRole("button", { name: "Save" }));
}

const meta = {
  title: "Preferences/PreferencesContainer",
  component: PreferencesContainer,
  args: {
    useCases: makeUseCasesFake({ listPalettes: fn(async () => [readingPalette, faintPalette]) }),
    instance: storyInstance,
    offersConnectedScreen: true,
    onBack: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "instance"] } },
} satisfies Meta<typeof PreferencesContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The instance's preferences, with its palettes; saved, back to the decks. */
export const Preferences: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "Save" }));
    await expect(args.onBack).toHaveBeenCalled();
  },
};

/** A guest's: whether logging in shows the Connected screen isn't offered. */
export const Guest: Story = {
  args: { offersConnectedScreen: false },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("button", { name: "Save" })).toBeEnabled();
  },
};

/** The preferences on their way. */
export const Loading: Story = {
  args: {
    useCases: makeUseCasesFake({ getPreferences: fn(() => new Promise<never>(() => {})) }),
  },
  play: async ({ args }) => {
    await waitFor(() => expect(args.useCases.getPreferences).toHaveBeenCalled());
  },
};

/** The preferences couldn't be read. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      getPreferences: fn(async () => {
        throw new AppError("storageInaccessible");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("alert")).toBeInTheDocument();
  },
};

/** The saved preferences don't fit their shape: replacing them is asked. */
export const Misfit: Story = {
  args: { useCases: makeUseCasesFake({ preferencesMisfit: fn(async () => true) }) },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByLabelText(/replace the saved preferences/i),
    ).toBeInTheDocument();
  },
};

/** Saving the preferences failed: the form keeps what was chosen. */
export const SaveFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      savePreferences: fn(async () => {
        throw new AppError("writeRefused");
      }),
    }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Save" }));
    await expect(await canvas.findByText(/stopped a change/)).toBeInTheDocument();
    await expect(args.onBack).not.toHaveBeenCalled();
  },
};

/** A switch to FSRS-6 working out each deck's cards. */
export const Switching: Story = {
  args: {
    useCases: makeUseCasesFake({
      switchScheduler: fn(
        (_instanceUrl, _preferences, onProgress: (progress: SwitchProgress) => void) => {
          onProgress({ step: "decks", done: 1, total: 3, part: { done: 2, total: 5 } });
          return new Promise<never>(() => {});
        },
      ),
    }),
  },
  play: async ({ canvasElement }) => {
    await switchToFsrs(canvasElement);
    await expect(await within(canvasElement).findByRole("progressbar")).toBeInTheDocument();
  },
};

/** A switch to FSRS-6 done: how the cards were worked out. */
export const Switched: Story = {
  args: {
    useCases: makeUseCasesFake({
      switchScheduler: fn(async () => ({
        switched: true,
        decks: 4,
        replayed: 310,
        estimated: 12,
        failed: [],
      })),
    }),
  },
  play: async ({ args, canvasElement }) => {
    await switchToFsrs(canvasElement);
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "Done" }));
    await expect(args.onBack).toHaveBeenCalled();
  },
};

/** A switch to FSRS-6 that couldn't write some decks; closed, back to the form. */
export const SwitchUnfinished: Story = {
  args: {
    useCases: makeUseCasesFake({
      switchScheduler: fn(async () => ({
        switched: false,
        decks: 0,
        replayed: 0,
        estimated: 0,
        failed: [
          { url: kanjiDeck.url, title: kanjiDeck.title, error: new AppError("changedElsewhere") },
          { url: arabicDeck.url, title: arabicDeck.title, error: new AppError("writeRefused") },
        ],
      })),
    }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await switchToFsrs(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /close/i }));
    await expect(await canvas.findByRole("radio", { name: /^FSRS-6/ })).toBeChecked();
    await expect(args.onBack).not.toHaveBeenCalled();
  },
};
