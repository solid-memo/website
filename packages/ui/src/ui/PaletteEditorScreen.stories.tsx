// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { PaletteEditorScreen } from "./PaletteEditorScreen";
import { ThemeProvider } from "./theme";
import { faintPalette, readingPalette } from "../test/stories/preferences";

const meta = {
  title: "Preferences/PaletteEditorScreen",
  component: PaletteEditorScreen,
  args: { busy: false, error: null, cancelHref: "#/preferences", onSave: fn() },
} satisfies Meta<typeof PaletteEditorScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new palette, at Standard's colors, named and saved. */
export const New: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Name"), "Calm");
    await userEvent.click(canvas.getByRole("button", { name: "Save and use" }));
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ url: null, title: { en: "Calm" }, basedOn: "standard" }),
      false,
    );
  },
};

/** A palette of the user's own, based on Parchment with colors of its own. */
export const Edit: Story = { args: { palette: readingPalette } };

/** A pair below the contrast it needs: saved only with Use anyway. */
export const ContrastProblem: Story = {
  args: { palette: faintPalette },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save and use" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Use anyway" }));
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ url: faintPalette.url }),
      true,
    );
  },
};

/** Text too faint to read on the background: the palette isn't saved. */
export const Unreadable: Story = {
  args: { palette: { ...readingPalette, light: { "--text": "#f0f0f0" } } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save and use" }));
    await expect(await canvas.findByRole("alert")).toBeInTheDocument();
    await expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** The page in a palette other than Standard: Reset colors is offered. */
export const ResetOffered: Story = {
  args: { palette: readingPalette },
  render: (args) => (
    <ThemeProvider choice="light" onChoose={fn()} palette="parchment" onChoosePalette={fn()}>
      <PaletteEditorScreen {...args} />
    </ThemeProvider>
  ),
};

/** The palette being saved. */
export const Saving: Story = { args: { palette: readingPalette, busy: true } };

/** Saving the palette failed. */
export const SaveFailed: Story = {
  args: {
    palette: readingPalette,
    error:
      "Solid Memo stopped a change to your Pod for safety: it would have been saved at an address Solid Memo never saves to. Nothing was changed.",
  },
};
