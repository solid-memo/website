// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DEFAULT_PREFERENCES, NEW_INSTANCE_PREFERENCES } from "@solid-memo/domain/preferences";
import { PreferencesScreen, ResetColors } from "./PreferencesScreen";
import { ThemeProvider } from "./theme";
import { faintPalette, readingPalette } from "../test/stories/preferences";
import { storyInstance } from "../test/storyData";

/** The palette chosen, as the app's theme would take it. */
const choosePalette = fn();

const meta = {
  title: "Preferences/PreferencesScreen",
  component: PreferencesScreen,
  args: {
    instanceUrl: storyInstance.url,
    preferences: NEW_INSTANCE_PREFERENCES,
    palettes: [readingPalette, faintPalette],
    connectedScreenShown: true,
    busy: false,
    error: null,
    onSave: fn(),
  },
  parameters: { controls: { exclude: ["palettes"] } },
} satisfies Meta<typeof PreferencesScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every section, with FSRS-6 and the palettes of the user's own; a change saved. */
export const AllSections: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const newCards = canvas.getByLabelText("New cards per day");
    await userEvent.clear(newCards);
    await userEvent.type(newCards, "12");
    await userEvent.click(canvas.getByLabelText("Developer mode"));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ newCardsPerDay: 12, developerMode: true, scheduler: "fsrs6" }),
      true,
      false,
    );
  },
};

/** SM-2 chosen: the answer buttons can be chosen, the desired retention can't. */
export const Sm2: Story = { args: { preferences: DEFAULT_PREFERENCES } };

/** A palette of the user's own shown: it is checked, and Reset colors is offered; a built-in one chosen. */
export const OwnPaletteShown: Story = {
  render: (args) => (
    <ThemeProvider
      choice="dark"
      onChoose={fn()}
      customPalette={readingPalette}
      onChoosePalette={choosePalette}
    >
      <PreferencesScreen {...args} />
    </ThemeProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: /^High contrast/ }));
    await expect(choosePalette).toHaveBeenCalledWith("high-contrast");
  },
};

/** No palettes of the user's own, and the Connected screen not offered, as for a guest. */
export const Guest: Story = { args: { palettes: [], connectedScreenShown: undefined } };

/** The saved preferences don't fit their shape: the defaults shown, replacing them asked. */
export const Misfit: Story = {
  args: { misfit: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText(/replace the saved preferences/i));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(args.onSave).toHaveBeenCalledWith(expect.anything(), true, true);
  },
};

/** The preferences being saved: the fields wait. */
export const Saving: Story = { args: { busy: true } };

/** Saving the preferences failed. */
export const SaveFailed: Story = {
  args: {
    error:
      "Your saved preferences don't fit the form Solid Memo reads, so they weren't changed. To save these instead, check \"Replace the saved preferences\" and save again.",
  },
};

/** Reset colors alone, as the palette editor shows it, while the page is in Parchment. */
export const ResetColorsButton: Story = {
  render: () => (
    <ThemeProvider
      choice="light"
      onChoose={fn()}
      palette="parchment"
      onChoosePalette={choosePalette}
    >
      <ResetColors />
    </ThemeProvider>
  ),
};
