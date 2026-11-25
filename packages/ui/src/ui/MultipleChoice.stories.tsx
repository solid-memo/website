// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { MultipleChoice } from "./MultipleChoice";

const meta = {
  title: "Cards/MultipleChoice",
  component: MultipleChoice,
  args: {
    labelledBy: "story-question",
    choices: [
      { key: "a", text: { en: "fire" } },
      { key: "b", text: { en: "water" } },
      { key: "c", text: { en: "tree" } },
      { key: "d", text: { en: "mountain" } },
    ],
    busy: false,
    onCheck: fn(),
  },
  render: (args) => (
    <>
      <p id="story-question">What does 水 mean?</p>
      <MultipleChoice {...args} />
    </>
  ),
} satisfies Meta<typeof MultipleChoice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Options to choose among: Check is pressed once one is chosen. */
export const Unanswered: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: /water/ }));
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    await expect(args.onCheck).toHaveBeenCalledWith("b");
  },
};

/** The answer being saved: Check says so. */
export const Checking: Story = { args: { busy: true } };

/** Answered right: the right option marked. */
export const AnsweredRight: Story = { args: { answered: { chosen: "b", correct: "b" } } };

/** Answered wrong: the option chosen and the right one, both marked. */
export const AnsweredWrong: Story = { args: { answered: { chosen: "a", correct: "b" } } };

/** Options in Markdown, each on one line. */
export const Markdown: Story = {
  args: {
    markdown: true,
    choices: [
      { key: "a", text: { en: "`git commit --amend`" } },
      { key: "b", text: { en: "`git reset --hard`, which **discards** changes" } },
      { key: "c", text: { en: "*Nothing*: commits never change" } },
    ],
  },
};

/** Arabic options, right to left, and one long enough to wrap. */
export const RightToLeftAndLong: Story = {
  args: {
    choices: [
      { key: "a", text: { ar: "مرحبا" } },
      { key: "b", text: { ar: "شكراً" } },
      {
        key: "c",
        text: { ar: "أهلاً وسهلاً بك في بيتنا، تفضل بالدخول، البيت بيتك ونحن سعداء بزيارتك" },
      },
    ],
  },
  globals: { direction: "rtl" },
};
