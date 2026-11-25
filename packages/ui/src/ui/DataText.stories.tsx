// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { CardLanguage, CourseLanguage } from "./cardLanguage";
import { DataLine, DataProse, DataText } from "./DataText";

const meta = {
  title: "Basics/DataText",
  component: DataText,
  args: { text: { en: "The sun; a day", ja: "日" }, markdown: false },
} satisfies Meta<typeof DataText>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Plain card text, in the reader's language. */
export const Plain: Story = {};

/** The same card under its deck's card language: shown in Japanese first, marked so. */
export const InCardLanguage: Story = {
  render: (args) => (
    <CardLanguage language="ja">
      <DataText {...args} />
    </CardLanguage>
  ),
};

/** Markdown that reads as one paragraph: the same paragraph, with emphasis and code. */
export const MarkdownParagraph: Story = {
  args: { text: { en: "Use `git log` to see *every* commit." }, markdown: true },
};

/** Markdown of several blocks: a list, a code block, a table and a quote. */
export const MarkdownBlocks: Story = {
  args: {
    markdown: true,
    text: {
      en: [
        "The three ways to *undo*:",
        "",
        "1. `git restore`",
        "2. `git revert`",
        "",
        "```sh",
        "git revert HEAD",
        "```",
        "",
        "| Command | Keeps history |",
        "| :-- | :-: |",
        "| revert | yes |",
        "| reset | no |",
        "",
        "> Read [the book](https://pod.example/git-book) first.",
      ].join("\n"),
    },
  },
};

/** A long name that may wrap after its slashes. */
export const BreaksAfterSlash: Story = {
  args: {
    breaks: true,
    text: {
      sv: "Fastighetstekniker/Drifttekniker, fastighet/Fastighetsskötare/Fastighetsförvaltare och liknande yrken",
    },
  },
};

/** Arabic card text, right to left. */
export const Arabic: Story = { args: { text: { ar: "مرحبا، كيف حالك اليوم؟" } } };

/** A step's theory, shown a chunk at a time: this is the second of its chunks. */
export const Prose: Story = {
  render: () => (
    <CourseLanguage language="en">
      <DataProse
        class="theory"
        markdown
        chunk={1}
        text={{ en: "First chunk.\n\n---\n\nThe **second** chunk, with a list:\n\n- one\n- two" }}
      />
      <DataProse
        class="theory"
        markdown={false}
        text={{ en: "A plain paragraph.\n\nAnd another, after a blank line." }}
      />
    </CourseLanguage>
  ),
};

/** One line of phrasing, as an option's label: Markdown keeps only emphasis and code. */
export const Line: Story = {
  render: () => (
    <p>
      <DataLine markdown text={{ ko: "**안녕하세요** and `hello`" }} />
    </p>
  ),
};
