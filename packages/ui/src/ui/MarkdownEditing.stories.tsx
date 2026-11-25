// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { CardPreview, MarkdownHelp } from "./MarkdownEditing";

const meta = {
  title: "Cards/MarkdownEditing",
  component: CardPreview,
  args: {
    front: [{ id: 0, value: "What does `git commit --amend` do?", tag: "en" }],
    back: [
      {
        id: 0,
        value: "It **replaces** the last commit:\n\n- its message\n- its changes",
        tag: "en",
      },
    ],
    frontLabel: [{ id: 0, value: "Command", tag: "en" }],
    frontNote: [{ id: 0, value: "", tag: "en" }],
    backLabel: [{ id: 0, value: "", tag: "en" }],
    backNote: [{ id: 0, value: "Never amend a commit *already pushed*.", tag: "en" }],
    textFormat: SM.markdown,
    asOption: false,
  },
  parameters: {
    controls: { exclude: ["front", "back", "frontLabel", "frontNote", "backLabel", "backNote"] },
  },
} satisfies Meta<typeof CardPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A card in Markdown as it will look in study, as it is written. */
export const Preview: Story = {};

/** A card asked as a multiple-choice question: its back also as an option shows it. */
export const AsOption: Story = {
  args: { asOption: true, back: [{ id: 0, value: "`git commit --amend`", tag: "en" }] },
};

/** Nothing written yet: an empty card. */
export const Empty: Story = {
  args: {
    front: [{ id: 0, value: "", tag: null }],
    back: [{ id: 0, value: "", tag: null }],
    frontLabel: [{ id: 0, value: "", tag: null }],
    backNote: [{ id: 0, value: "", tag: null }],
  },
};

/** The Markdown cheat sheet, opened. */
export const Help: Story = {
  render: () => <MarkdownHelp />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Formatting help"));
    await expect(await canvas.findByRole("table")).toBeVisible();
  },
};
