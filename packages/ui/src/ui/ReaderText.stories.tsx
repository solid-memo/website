// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { CardLanguage, CourseLanguage } from "./cardLanguage";
import { CardText, CourseText, ReaderText, ReaderTexts } from "./ReaderText";

const meta = {
  title: "Basics/ReaderText",
  component: ReaderText,
  args: { text: { en: "Kanji N5", sv: "Kanji N5 på svenska", ja: "漢字 N5" } },
} satisfies Meta<typeof ReaderText>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Text in the reader's language (switch the toolbar's language to see it follow). */
export const InReadersLanguage: Story = {};

/** Text with no version in the reader's language: shown in another, marked with it. */
export const OtherLanguage: Story = { args: { text: { ja: "日本語の単語" } } };

/** Arabic text, right to left. */
export const Arabic: Story = { args: { text: { ar: "تحيات عربية للمبتدئين" } } };

/** A long name that may wrap after its slashes. */
export const BreaksAfterSlash: Story = {
  args: {
    breaks: true,
    text: { sv: "Fastighetstekniker/Drifttekniker/Fastighetsskötare, fastighet och liknande" },
  },
};

/** Card text under its deck's card language, and a course's title under its course language: both in Japanese first. */
export const CardAndCourseText: Story = {
  render: (args) => (
    <ul>
      <li>
        <CardLanguage language="ja">
          <CardText text={args.text} breaks />
        </CardLanguage>
      </li>
      <li>
        <CourseLanguage language="ja">
          <CourseText text={args.text} />
        </CourseLanguage>
      </li>
    </ul>
  ),
};

/** Several texts, such as a deck's topics, separated by commas. */
export const SeveralTexts: Story = {
  render: () => (
    <ReaderTexts texts={[{ en: "Language" }, { en: "Japanese", ja: "日本語" }, { ko: "한국어" }]} />
  ),
};
