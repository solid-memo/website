// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { PauseDeckDialog } from "./PauseDeckDialog";
import { makeUseCasesFake } from "../test/useCasesFake";
import { arabicDeck, kanjiDeck, longTitleDeck, storyInstance } from "../test/storyData";

const meta = {
  title: "Decks/PauseDeckDialog",
  component: PauseDeckDialog,
  args: {
    useCases: makeUseCasesFake({
      getPauseOutlook: fn(async (_instanceUrl, _deck, resumesOn) => ({
        day: resumesOn ?? "2026-11-02",
        recall: 0.81,
      })),
    }),
    instanceUrl: storyInstance.url,
    deck: kanjiDeck,
    today: "2026-10-03",
    busy: false,
    error: null,
    onPause: fn(async () => true),
    onClose: fn(),
  },
  parameters: { controls: { exclude: ["useCases", "deck"] } },
} satisfies Meta<typeof PauseDeckDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Paused until resumed, with what is likely left after a month. */
export const UntilResumed: Story = {
  play: async ({ args, canvasElement }) => {
    const dialog = await within(canvasElement).findByRole("dialog");
    await within(dialog).findByText(/you’ll likely still remember about 81%/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Pause" }));
    await expect(args.onPause).toHaveBeenCalledWith(null);
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
  },
};

/** Paused until a day, with what is likely left on that day. */
export const UntilADay: Story = {
  play: async ({ args, canvasElement }) => {
    const dialog = await within(canvasElement).findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Until a day:" }));
    await within(dialog).findByText(/If you resume on/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Pause" }));
    await expect(args.onPause).toHaveBeenCalledWith("2026-10-04");
  },
};

/** A deck with nothing studied yet: nothing to forget. */
export const NothingStudied: Story = {
  args: {
    deck: arabicDeck,
    useCases: makeUseCasesFake({
      getPauseOutlook: fn(async () => ({ day: "2026-11-02", recall: null })),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/Nothing in this deck has been studied yet/),
    ).toBeInTheDocument();
  },
};

/** The pause is being written, for a deck with a long name. */
export const Busy: Story = { args: { busy: true, deck: longTitleDeck } };

/** The pause could not be made: the dialog stays open with why. */
export const Failed: Story = {
  args: {
    error: "The server did not answer in time. Check your connection and try again.",
    onPause: fn(async () => false),
  },
  play: async ({ args, canvasElement }) => {
    const dialog = await within(canvasElement).findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Pause" }));
    await expect(args.onPause).toHaveBeenCalled();
    await expect(dialog).toBeVisible();
  },
};
