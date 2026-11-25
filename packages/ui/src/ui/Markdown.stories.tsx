// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { markdownBlocks, markdownPhrases } from "./markdownCache";
import { MarkdownBlocks, MarkdownInlines } from "./Markdown";

const meta = {
  title: "Basics/Markdown",
  component: MarkdownBlocks,
  args: {
    blocks: markdownBlocks(
      [
        "Every **kind** of block, with *emphasis*, `code` and a line  ",
        "break.",
        "",
        "1. A numbered list",
        "2. Of two items",
        "",
        "- A loose list",
        "",
        "- Whose items are paragraphs",
        "",
        "```ts",
        'const greeting = "Hello, a code block that is far too long to fit, so it scrolls sideways";',
        "```",
        "",
        "> A quote, from someone.",
        "",
        "---",
        "",
        "| Left | Center | Right |",
        "| :--- | :----: | ----: |",
        "| a | b | c |",
        "| 1 | 2 | 3 |",
      ].join("\n"),
    )!,
  },
} satisfies Meta<typeof MarkdownBlocks>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every kind of block: paragraph, lists, code, quote, rule and table. */
export const Blocks: Story = {};

/** Links: one whose text is its address, one with text of its own (its host beside it), an international host, and one not followed. */
export const Links: Story = {
  args: {
    blocks: markdownBlocks(
      [
        "- <https://pod.example/decks/kanji/>",
        "- [The kanji deck](https://pod.example/decks/kanji/)",
        "- [Ett exempel](https://exempel.räksmörgås.example/)",
        "- [Not followed](javascript:alert(1))",
      ].join("\n"),
    )!,
  },
};

/** Arabic text, right to left, with a link in Arabic. */
export const Arabic: Story = {
  args: {
    blocks: markdownBlocks(
      "**مرحبا** بكم في [الدرس الأول](https://pod.example/ar/lesson-1)، وهو نص طويل بما يكفي ليلتف على سطرين أو أكثر في عرض ضيق.",
    )!,
  },
};

/** One line of phrasing, as a card's label shows it. */
export const Inlines: Story = {
  render: () => (
    <p>
      <MarkdownInlines nodes={markdownPhrases("Press *Space* to reveal, then `1`–`4`")!} />
    </p>
  ),
};
