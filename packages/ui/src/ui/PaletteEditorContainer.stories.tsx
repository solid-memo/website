// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { PaletteEditorContainer } from "./PaletteEditorContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { faintPalette, readingPalette } from "../test/stories/preferences";
import { storyInstance } from "../test/storyData";

const meta = {
  title: "Preferences/PaletteEditorContainer",
  component: PaletteEditorContainer,
  args: {
    useCases: makeUseCasesFake({
      listPalettes: fn(async () => [readingPalette, faintPalette]),
      savePalette: fn(async () => readingPalette),
    }),
    instance: storyInstance,
    paletteUrl: readingPalette.url,
    onDone: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "instance"] } },
} satisfies Meta<typeof PaletteEditorContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A palette of the user's own, edited and saved: back to the preferences. */
export const Edit: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Save and use" }));
    await expect(args.onDone).toHaveBeenCalled();
  },
};

/** A new palette. */
export const New: Story = {
  args: { paletteUrl: undefined },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByLabelText("Name")).toHaveValue("");
  },
};

/** The palettes on their way. */
export const Loading: Story = {
  args: {
    useCases: makeUseCasesFake({ listPalettes: fn(() => new Promise<never>(() => {})) }),
  },
  play: async ({ args }) => {
    await waitFor(() => expect(args.useCases.listPalettes).toHaveBeenCalled());
  },
};

/** The palettes couldn't be read. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      listPalettes: fn(async () => {
        throw new AppError("storageInaccessible");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("alert")).toBeInTheDocument();
  },
};

/** Saving the palette failed. */
export const SaveFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      listPalettes: fn(async () => [readingPalette]),
      savePalette: fn(async () => {
        throw new AppError("paletteLimit", { limit: 50 });
      }),
    }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Save and use" }));
    await expect(await canvas.findByText(/as many palettes/)).toBeInTheDocument();
    await expect(args.onDone).not.toHaveBeenCalled();
  },
};
