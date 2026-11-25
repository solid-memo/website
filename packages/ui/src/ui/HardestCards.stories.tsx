// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { deckProgressOf } from "../test/fakes/statistics";
import { kanjiDeck, storyInstance } from "../test/storyData";
import {
  arabicProgress,
  easyProgress,
  kanjiProgress,
  longProgress,
  manyLeechesProgress,
} from "../test/stories/statistics";
import { ConfusedOptions, HardestCards, Leeches } from "./HardestCards";

const meta = {
  title: "Statistics/HardestCards",
  component: HardestCards,
  args: { instanceUrl: storyInstance.url, progress: kanjiProgress },
  parameters: { controls: { exclude: ["progress"] } },
} satisfies Meta<typeof HardestCards>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck's hardest cards, two of them leeches, with a link to cram them. */
export const Hardest: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText(/· a leech$/)).toHaveLength(2);
    await expect(canvas.getByRole("link", { name: "Cram the leeches" })).toBeInTheDocument();
  },
};

/** A card in Arabic, its name right to left. */
export const RightToLeft: Story = { args: { progress: arabicProgress } };

/** A card whose long question wraps. */
export const LongText: Story = { args: { progress: longProgress } };

/** Reviews, but no card forgotten. */
export const NoneForgotten: Story = { args: { progress: easyProgress } };

/** No review yet: nothing is shown. */
export const NoReviews: Story = { args: { progress: deckProgressOf(kanjiDeck) } };

/** The wrong options chosen most in the deck's course questions; then a deck whose answers chose none. */
export const Confusions: Story = {
  render: (args) => (
    <>
      <ConfusedOptions {...args} />
      <ConfusedOptions {...args} progress={{ ...args.progress, confusions: [] }} />
      <ConfusedOptions {...args} progress={easyProgress} />
    </>
  ),
};

/** The leeches of every deck, the most forgotten first, each with its deck. */
export const LeechesOfEveryDeck: Story = {
  render: (args) => (
    <Leeches
      instanceUrl={args.instanceUrl}
      decks={[kanjiProgress, arabicProgress, longProgress, easyProgress]}
    />
  ),
};

/** No leech in any deck. */
export const NoLeeches: Story = {
  render: (args) => <Leeches instanceUrl={args.instanceUrl} decks={[easyProgress]} />,
};

/** More leeches than a page lists; the button shows the rest. */
export const ManyLeeches: Story = {
  render: (args) => <Leeches instanceUrl={args.instanceUrl} decks={[manyLeechesProgress]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Show 12 more" }));
    await expect(canvas.getAllByRole("listitem")).toHaveLength(62);
  },
};
