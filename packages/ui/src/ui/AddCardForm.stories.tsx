// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { CardContent } from "@solid-memo/domain/deck";
import { AddCardForm } from "./AddCardForm";

const meta = {
  title: "Cards/AddCardForm",
  component: AddCardForm,
  args: {
    busy: false,
    languages: {
      defaults: { front: "ja", back: "en", own: "en" },
      suggestions: { front: ["ja"], back: ["en"], own: ["en"] },
    },
    onAdd: fn((_content: CardContent, onAdded: () => void) => onAdded()),
  },
  parameters: { controls: { exclude: ["languages"] } },
} satisfies Meta<typeof AddCardForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A card written and added: the form clears for the next one, and says so. */
export const AddsACard: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Front" }), "火");
    await userEvent.type(canvas.getByRole("textbox", { name: "Back" }), "fire");
    await userEvent.click(canvas.getByRole("button", { name: "Add card" }));
    await expect(args.onAdd).toHaveBeenCalled();
    await expect(await canvas.findByText("Card added.")).toBeInTheDocument();
  },
};

/** Added with nothing written: the form says what a side needs. */
export const Refused: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add card" }));
    await expect(await canvas.findByText("The front needs text or an image.")).toBeInTheDocument();
  },
};

/** A deck whose cards say nothing of their languages yet: each text's is to choose. */
export const NoLanguagesYet: Story = {
  args: {
    languages: { defaults: {}, suggestions: { front: [], back: [], own: [] } },
  },
};

/** While a card is added: the button waits. */
export const Busy: Story = { args: { busy: true } };
