// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { CardLanguage, CourseLanguage } from "./cardLanguage";
import { CardText, CourseText, ReaderText } from "./ReaderText";

/** A card's front, in English and Korean. */
const FRONT = { en: "Hello", ko: "안녕하세요" };

/** A course's title, in English and Korean. */
const TITLE = { en: "Korean at the Table", ko: "식탁에서 배우는 한국어" };

const meta = {
  title: "Basics/CardLanguage",
  component: CardLanguage,
  args: { language: "ko", children: null },
  parameters: { controls: { exclude: ["children"] } },
  render: (args) => (
    <dl>
      <dt>Card text, no card language</dt>
      <dd>
        <CardText text={FRONT} />
      </dd>
      <dt>Card text, under the deck's card language</dt>
      <dd>
        <CardLanguage {...args}>
          <CardText text={FRONT} />
        </CardLanguage>
      </dd>
      <dt>A deck's title, under it: unchanged</dt>
      <dd>
        <CardLanguage {...args}>
          <ReaderText text={TITLE} />
        </CardLanguage>
      </dd>
      <dt>A course's title, under its course language</dt>
      <dd>
        <CourseLanguage {...args}>
          <CourseText text={TITLE} />
        </CourseLanguage>
      </dd>
    </dl>
  ),
} satisfies Meta<typeof CardLanguage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The same texts with and without a deck's (Korean) card language: only card and course text follow it. */
export const Korean: Story = {};

/** No card language: card text in the reader's language, as any text. */
export const NoCardLanguage: Story = { args: { language: undefined } };
