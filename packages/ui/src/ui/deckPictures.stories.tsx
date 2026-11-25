// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DeckPictures, DraftPictures, HiddenPicturesNotice, ShowPictures } from "./deckPictures";
import { forget } from "./remembered";
import { kanjiDeck } from "../test/storyData";
import { makeUseCasesFake } from "../test/useCasesFake";

/** Where the choices kept for the page are (deckPictures.tsx). */
const PAGE_CHOICES = "deckPictures:thisPage";

/** Every story starts, and leaves the page, with no host chosen. */
function noChoices() {
  forget(PAGE_CHOICES);
  return () => forget(PAGE_CHOICES);
}

const meta = {
  title: "Basics/DeckPictures",
  component: HiddenPicturesNotice,
  args: {
    urls: [
      "https://images.example/kanji/sun.png",
      "https://images.example/kanji/moon.png",
      "https://photos.example/mountain.jpg",
      undefined,
    ],
  },
  beforeEach: noChoices,
} satisfies Meta<typeof HiddenPicturesNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A draft's cards whose pictures come from two hosts: each host asked about; a press shows its pictures. */
export const DraftAsks: Story = {
  render: (args) => (
    <DraftPictures draftUrl="https://pod.example/drafts/kanji/">
      <HiddenPicturesNotice {...args} />
    </DraftPictures>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Show pictures from images.example" }),
    );
    await expect(
      await canvas.findByText("Pictures from images.example are shown for this deck."),
    ).toHaveFocus();
  },
};

/** A deck in an instance outside the learner's pod: it asks too, once its place is read. */
export const LinkedDeck: Story = {
  render: (args) => (
    <DeckPictures
      useCases={makeUseCasesFake({ isInOwnPod: fn(async () => false) })}
      deck={kanjiDeck}
    >
      <HiddenPicturesNotice {...args} />
    </DeckPictures>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("button", {
        name: "Show pictures from photos.example",
      }),
    ).toBeInTheDocument();
  },
};

/** The button while the host is being saved: marked disabled, keeping the focus. */
export const Saving: Story = {
  render: () => (
    <ShowPictures
      gate={{ access: fn(), allow: fn(), busy: true, error: null }}
      host="images.example"
      asked
      onAsk={fn()}
    />
  ),
};

/** The host could not be saved: why, under the button that was pressed. */
export const SaveFailed: Story = {
  render: () => (
    <ShowPictures
      gate={{
        access: fn(),
        allow: fn(),
        busy: false,
        error: "The choice couldn't be saved: your pod didn't answer.",
      }}
      host="images.example"
      asked
      onAsk={fn()}
    />
  ),
};
