// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { DistractorFields } from "./DistractorFields";
import { waterDistractors } from "../test/stories/cards";

const meta = {
  title: "Cards/DistractorFields",
  component: DistractorFields,
  args: {
    cardId: "water",
    distractors: waterDistractors,
    back: { en: "water" },
    busy: false,
    suggestions: ["en"],
    onChange: fn(),
  },
  parameters: { controls: { exclude: ["published", "taken", "picks"] } },
} satisfies Meta<typeof DistractorFields>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A card's wrong options, one with its note, one retired. */
export const Options: Story = {};

/** A wrong option written and added: the card's options as they are then. */
export const AddOne: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add a wrong option" }));
    await userEvent.type(await canvas.findByRole("textbox", { name: "Wrong option" }), "river");
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));
    await expect(args.onChange).toHaveBeenCalled();
  },
};

/** No wrong options yet. */
export const None: Story = { args: { distractors: [] } };

/** Options the deck's release published, and how often a learner chose each. */
export const PublishedWithPicks: Story = {
  args: {
    published: new Set(["water-d1"]),
    picks: new Map([
      ["water-d1", 7],
      ["water-d2", 1],
    ]),
  },
};

/** Options not in the back's languages: worth a look, never refused. */
export const OtherLanguages: Story = {
  args: {
    back: { en: "water", ar: "ماء" },
    distractors: [
      { id: "water-d1", text: { sv: "eld" } },
      { id: "water-d2", text: { ar: "شجرة" } },
    ],
  },
};

/** Options in Markdown, and one long enough to wrap. */
export const MarkdownAndLong: Story = {
  args: {
    textFormat: SM.markdown,
    back: { en: "`git commit --amend`" },
    distractors: [
      {
        id: "amend-d1",
        text: { en: "`git reset --hard`" },
        note: { en: "That **discards** changes." },
      },
      {
        id: "amend-d2",
        text: {
          en: "`git rebase --interactive --autosquash --rebase-merges --update-refs` on every branch you have ever pushed",
        },
      },
    ],
  },
};

/** While the card saves: the buttons wait. */
export const Busy: Story = { args: { busy: true } };
