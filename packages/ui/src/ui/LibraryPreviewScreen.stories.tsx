// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { LibraryPreviewScreen } from "./LibraryPreviewScreen";
import {
  arabicLibraryCard,
  longLibraryCard,
  pictureLibraryCard,
  stockholmCard,
} from "../test/stories/library";

const meta = {
  title: "Library/LibraryPreviewScreen",
  component: LibraryPreviewScreen,
  args: {
    deckName: "Capitals of the world",
    deckHref: "#/library-deck",
    cardLanguages: ["English", "Swedish"],
    prompt: { card: stockholmCard, direction: "front-to-back" },
    turn: 0,
    onNext: fn(),
    onExit: fn(),
  },
  parameters: { controls: { exclude: ["prompt"] } },
} satisfies Meta<typeof LibraryPreviewScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A card asked; revealed, then on to the next. */
export const Card: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Reveal" }));
    await expect(canvas.getByText("Stockholm")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Next card" }));
    await expect(args.onNext).toHaveBeenCalled();
  },
};

/** A card asked back to front. */
export const BackToFront: Story = {
  args: { prompt: { card: stockholmCard, direction: "back-to-front" } },
};

/** An Arabic card, its text right to left, from a deck named in Arabic. */
export const Arabic: Story = {
  args: {
    deckName: "تحيات عربية",
    deckLang: "ar",
    cardLanguages: ["Arabic", "English"],
    prompt: { card: arabicLibraryCard, direction: "front-to-back" },
  },
};

/** A card with a picture, from a deck that names no card languages. */
export const Picture: Story = {
  args: { cardLanguages: [], prompt: { card: pictureLibraryCard, direction: "front-to-back" } },
};

/** A card whose text is long enough to wrap. */
export const LongText: Story = {
  args: { prompt: { card: longLibraryCard, direction: "front-to-back" } },
};

/** A deck with no cards: back to the library. */
export const Empty: Story = {
  args: { prompt: null },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Back to library" }));
    await expect(args.onExit).toHaveBeenCalled();
  },
};
